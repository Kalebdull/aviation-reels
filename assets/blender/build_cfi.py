"""build_cfi.py (v3): the show's CFI, built on Blender Studio's stylized male base mesh (CC0, assets/base/).

    python3 assets/blender/build_cfi.py --preview [--shot=portrait|bust|full|three_quarter|profile]

Writes assets/models/cfi.blend, cfi.glb and cfi_preview_*.png.

Why a base mesh: a lovable face comes from real sculpted anatomy, not from formulas. The base gives us that, and this
script turns it into OUR character: proportions, a warm smile, salt-and-pepper hair, a short beard, laugh lines,
aviators pushed up, a headset round the neck, a worn brown leather flight jacket over a tee, chinos.
Units: metres. Faces -Y, up +Z, feet at z = 0, centred on x = 0.
"""
import math, os, sys
import bpy, bmesh
from mathutils import Vector, Matrix, noise
from mathutils.bvhtree import BVHTree

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'assets', 'models')
BASE = os.path.join(ROOT, 'assets', 'base', 'human_male_stylized.blend')
ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
arg = lambda k, d=None: next((a.split('=', 1)[1] for a in ARGS if a.startswith(f'--{k}=')), d)

SKIN, IRIS = '#DDA27E', '#6F8FA8'                 # warm skin, blue-grey eyes
HAIR = '#3A2A22'                                  # dark brown
NAVY, SHIRT, TIE, GOLD = '#23304A', '#F2F2EE', '#2B2F36', '#D4A93A'


def lin(h):
    h = h.lstrip('#'); c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return [(v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4) for v in c] + [1]


def principled(name, color, rough=0.5, sss=0.0, sheen=0.0, coat=0.0, metallic=0.0, transmission=0.0, ior=1.45):
    m = bpy.data.materials.new(name); m.use_nodes = True; b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = lin(color) if isinstance(color, str) else color
    b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metallic
    for k, v in (('Subsurface Weight', sss), ('Sheen Weight', sheen), ('Coat Weight', coat), ('Transmission Weight', transmission), ('IOR', ior)):
        if k in b.inputs: b.inputs[k].default_value = v
    if sss:
        if 'Subsurface Radius' in b.inputs: b.inputs['Subsurface Radius'].default_value = (1.0, 0.40, 0.20)
        if 'Subsurface Scale' in b.inputs: b.inputs['Subsurface Scale'].default_value = 0.005
    return m


def eye_material():
    """Sclera + blue iris + pupil, painted by the angle from the eye's forward axis (-Y), with a glossy cornea."""
    m = bpy.data.materials.new('Eye'); m.use_nodes = True; N, L = m.node_tree.nodes, m.node_tree.links
    b = N['Principled BSDF']; b.inputs['Roughness'].default_value = 0.05
    if 'Coat Weight' in b.inputs: b.inputs['Coat Weight'].default_value = 1.0
    tc = N.new('ShaderNodeTexCoord'); nv = N.new('ShaderNodeVectorMath'); nv.operation = 'NORMALIZE'; L.new(tc.outputs['Object'], nv.inputs[0])
    dp = N.new('ShaderNodeVectorMath'); dp.operation = 'DOT_PRODUCT'; L.new(nv.outputs[0], dp.inputs[0]); dp.inputs[1].default_value = (0, -1, 0)
    r = N.new('ShaderNodeValToRGB'); el = r.color_ramp.elements
    el[0].position, el[0].color = 0.905, lin('#F1ECE6'); el[1].position, el[1].color = 0.986, lin('#0A0B0E')
    e = el.new(0.912); e.color = lin('#3F5468')                 # dark limbal ring
    e = el.new(0.93); e.color = lin(IRIS)
    e = el.new(0.978); e.color = lin('#9AB3C6')                 # iris inner (lighter)
    L.new(dp.outputs['Value'], r.inputs['Fac']); L.new(r.outputs['Color'], b.inputs['Base Color'])
    return m


def hair_material(name, rough=0.6):
    m = bpy.data.materials.new(name); m.use_nodes = True; N, L = m.node_tree.nodes, m.node_tree.links
    b = N['Principled BSDF']; b.inputs['Roughness'].default_value = rough
    if 'Sheen Weight' in b.inputs: b.inputs['Sheen Weight'].default_value = 0.6
    tc = N.new('ShaderNodeTexCoord'); nz = N.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 650; nz.inputs['Detail'].default_value = 3
    mp = N.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (1, 1, 0.25)      # strands run roughly vertically
    L.new(tc.outputs['Object'], mp.inputs['Vector']); L.new(mp.outputs['Vector'], nz.inputs['Vector'])
    r = N.new('ShaderNodeValToRGB'); r.color_ramp.elements[0].position = 0.40; r.color_ramp.elements[1].position = 0.60
    r.color_ramp.elements[0].color = lin('#1E1511'); r.color_ramp.elements[1].color = lin('#3A2A20')
    L.new(nz.outputs['Fac'], r.inputs['Fac']); L.new(r.outputs['Color'], b.inputs['Base Color'])
    bump = N.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = 0.35; L.new(nz.outputs['Fac'], bump.inputs['Height']); L.new(bump.outputs['Normal'], b.inputs['Normal'])
    return m


def add_subsurf(o, lv=2):
    md = o.modifiers.new('Subsurf', 'SUBSURF'); md.levels = 1; md.render_levels = lv
    for p in o.data.polygons: p.use_smooth = True


def load_base():
    with bpy.data.libraries.load(BASE) as (src, dst):
        dst.objects = list(src.objects)
    objs = [o for o in dst.objects]
    for o in objs: bpy.context.scene.collection.objects.link(o)
    body = next(o for o in objs if '.eye' not in o.name)
    eyes = [o for o in objs if '.eye' in o.name]
    # bake transforms into the meshes, then centre the character on x = 0 with feet on the ground
    bpy.context.view_layer.update()
    mats = {o.name: o.matrix_world.copy() for o in objs}          # read every world matrix BEFORE changing any
    for o in objs:
        o.parent = None
        o.data = o.data.copy(); o.data.transform(mats[o.name]); o.matrix_world = Matrix.Identity(4)
    vs = [v.co for v in body.data.vertices]
    cx = (max(v.x for v in vs) + min(v.x for v in vs)) / 2; z0 = min(v.z for v in vs)
    for o in objs: o.data.transform(Matrix.Translation((-cx, 0, -z0)))
    return body, eyes


def landmarks(body, eyes):
    ec = [sum((v.co for v in e.data.vertices), Vector()) / len(e.data.vertices) for e in eyes]
    eye_mid = (ec[0] + ec[1]) / 2
    top = max(v.co.z for v in body.data.vertices)
    return {'eyes': ec, 'eye_mid': eye_mid, 'top': top, 'head_c': Vector((0, eye_mid.y + 0.07, eye_mid.z + 0.02))}


def shell(name, body, select, offset, mat, jitter=0.0, jscale=40.0, solid=0.0):
    """A shell over part of the skin: verts where select(co, normal) is True, pushed out along the normal."""
    bm = bmesh.new(); bm.from_mesh(body.data); bm.normal_update()
    drop = [v for v in bm.verts if not select(v.co, v.normal)]
    bmesh.ops.delete(bm, geom=drop, context='VERTS')
    for v in bm.verts:
        off = offset(v.co) if callable(offset) else offset
        v.co = v.co + v.normal * (off + jitter * noise.noise(v.co * jscale))
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(o); me.materials.append(mat)
    if solid:
        s = o.modifiers.new('Thick', 'SOLIDIFY'); s.thickness = solid; s.offset = -1
    add_subsurf(o, 2)
    return o


def smile(body, lm, amount=1.0):
    """Lift the mouth corners and push the cheeks up a touch: a warm, closed-mouth smile."""
    em = lm['eye_mid']
    mouth = Vector((0, em.y - 0.075, em.z - 0.085))          # approx; refined by the nearest front vertex
    front = [v for v in body.data.vertices if abs(v.co.x) < 0.03 and abs(v.co.z - mouth.z) < 0.02]
    if front: mouth.y = min(v.co.y for v in front)
    for v in body.data.vertices:
        for S in (1, -1):
            c = mouth + Vector((S * 0.024, 0.006, 0.0))
            d = (v.co - c).length
            if d < 0.03: v.co += Vector((S * 0.002, -0.001, 0.0045)) * (1 - d / 0.03) ** 2 * amount
            ck = mouth + Vector((S * 0.036, 0.018, 0.022))
            d = (v.co - ck).length
            if d < 0.028: v.co += Vector((0, -0.0015, 0.002)) * (1 - d / 0.028) ** 2 * amount
    return mouth


def build():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    body, eyes = load_base()
    lm = landmarks(body, eyes)
    reshape(body, lm)
    mouth = smile(body, lm, 1.6)
    skin = principled('Skin', SKIN, rough=0.42, sss=0.32)
    body.data.materials.clear(); body.data.materials.append(skin); add_subsurf(body, 2)
    em = eye_material()
    for e in eyes:
        c = sum((v.co for v in e.data.vertices), Vector()) / len(e.data.vertices)
        e.data.transform(Matrix.Translation(-c)); e.location = c          # origin at the eye centre (for the iris shader)
        e.data.materials.clear(); e.data.materials.append(em); add_subsurf(e, 1)
    dress(body, lm)
    sc['landmarks'] = {k: list(v) if isinstance(v, Vector) else v for k, v in lm.items() if k != 'eyes'}
    return sc, body, eyes, lm, mouth


def smoothstep(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a))); return t * t * (3 - 2 * t)


def reshape(body, lm):
    """A grown man's build: broader shoulders and chest, thicker neck, squarer jaw."""
    ez = lm['eye_mid'].z
    for v in body.data.vertices:
        c = v.co
        torso = smoothstep(1.0, 1.25, c.z) * (1 - smoothstep(1.47, 1.53, c.z))
        c.x *= 1 + 0.13 * torso; c.y *= 1 + 0.08 * torso
        neck = smoothstep(1.44, 1.48, c.z) * (1 - smoothstep(1.52, 1.56, c.z))
        if abs(c.x) < 0.09: c.x *= 1 + 0.12 * neck; c.y = c.y * (1 + 0.08 * neck)
        jaw = smoothstep(ez - 0.13, ez - 0.09, c.z) * (1 - smoothstep(ez - 0.05, ez - 0.02, c.z))
        if c.z > 1.5: c.x *= 1 + 0.07 * jaw


def dress(body, lm):
    em, ez, top = lm['eye_mid'], lm['eye_mid'].z, lm['top']
    front_y = min(v.co.y for v in body.data.vertices if v.co.z > ez - 0.02 and abs(v.co.x) < 0.02)
    # ---- hair: a swept-up pompadour on top, short and neat at the sides and back
    hair = hair_material('Hair', 0.5)
    def hair_sel(c, n):
        if c.z < ez - 0.095: return False
        hairline = ez + 0.045 - 0.025 * smoothstep(0.035, 0.075, abs(c.x))      # recedes a little at the temples
        if c.y < front_y + 0.045 and c.z < hairline: return False                # forehead stays clear
        if abs(c.x) > 0.055 and c.z < ez + 0.01 and c.y < 0.01: return False      # sideburn area / ears
        if c.z < ez - 0.02 and c.y < 0.02: return False                           # behind the ears down to the nape only
        return True
    def hair_off(c):
        on_top = smoothstep(ez + 0.06, top - 0.01, c.z)
        front = 1 - smoothstep(front_y + 0.03, front_y + 0.16, c.y)
        sides = smoothstep(0.03, 0.08, abs(c.x))
        quiff = 0.020 * on_top * front * (1 - 0.7 * sides)                        # the pompadour lift
        sweep = 0.006 * math.sin((c.y - front_y) * 40 + c.x * 25)                 # combed-back waves
        return 0.004 + 0.005 * on_top + quiff + 0.6 * sweep * on_top
    shell('Hair', body, hair_sel, hair_off, hair, jitter=0.0015, jscale=180)
    # ---- brows: thick, dark, a confident gentle arch
    brow = principled('Brow', '#2B1F19', rough=0.75, sheen=0.4)
    def brow_sel(c, n):
        if n.y > -0.35: return False
        ax = abs(c.x); arch = ez + 0.026 + 0.006 * math.sin(math.pi * smoothstep(0.012, 0.06, ax))
        return 0.012 < ax < 0.063 and abs(c.z - arch) < 0.0065 - 0.002 * smoothstep(0.03, 0.063, ax)
    shell('Brows', body, brow_sel, 0.0028, brow)
    # ---- uniform: navy jacket over arms and torso, a white shirt V and a dark tie at the front
    navy = jacket_material()
    shirt = principled('Shirt', SHIRT, rough=0.7, sheen=0.3)
    tie = principled('Tie', TIE, rough=0.45, sheen=0.3)
    neck_z = 1.468
    def is_hand(c): return abs(c.x) > 0.16 and c.z < 0.92
    def in_v(c): return c.y < 0 and 1.26 < c.z < neck_z + 0.012 and abs(c.x) < 0.075 * (c.z - 1.26) / 0.21
    def jacket_sel(c, n): return 0.86 < c.z < neck_z and not is_hand(c) and not in_v(c)
    def ease(c):
        torso = 1 - smoothstep(0.15, 0.20, abs(c.x))
        waist = 1 - smoothstep(1.05, 1.22, c.z)
        return 0.013 + torso * (0.016 + 0.018 * waist)
    shell('Jacket', body, jacket_sel, ease, navy, solid=0.004)
    shell('ShirtV', body, lambda c, n: in_v(c), 0.022, shirt)
    shell('Collar', body, lambda c, n: neck_z - 0.008 < c.z < neck_z + 0.03 and abs(c.x) < 0.075 and -0.085 < c.y < 0.08, 0.011, shirt, solid=0.003)
    shell('Tie', body, lambda c, n: in_v(c) and abs(c.x) < 0.011 + 0.005 * (c.z < 1.42), 0.026, tie)
    # ---- trousers and shoes
    shell('Trousers', body, lambda c, n: 0.09 < c.z < 0.95 and not is_hand(c), 0.011, principled('Trousers', '#1C2436', rough=0.65, sheen=0.25))
    shell('Shoes', body, lambda c, n: c.z < 0.10, 0.008, principled('Shoes', '#111114', rough=0.25, coat=0.8))
    # ---- gold wings on the left chest, epaulettes with gold bars
    gold = principled('Gold', GOLD, rough=0.25, metallic=1.0)
    wy = min(v.co.y for v in body.data.vertices if abs(v.co.x - 0.085) < 0.01 and abs(v.co.z - 1.36) < 0.01) - 0.016
    for S in (1, -1):
        bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1); bmesh.ops.scale(bm, vec=(0.032, 0.003, 0.008), verts=bm.verts)
        bmesh.ops.translate(bm, vec=(S * 0.018, 0, 0.002 * S), verts=bm.verts)
        o = obj_from(bm, 'Wing', gold); o.location = (0.085, wy, 1.36); o.rotation_euler = (0, S * 0.18, 0); add_subsurf(o, 1)
    bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=16, v_segments=8, radius=0.006); o = obj_from(bm, 'WingBadge', gold); o.location = (0.085, wy - 0.002, 1.36)
    for S in (1, -1):
        sh = max((v.co for v in body.data.vertices if 1.40 < v.co.z < 1.47 and v.co.x * S > 0.12), key=lambda c: c.z, default=Vector((S * 0.17, 0, 1.45)))
        bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1); bmesh.ops.scale(bm, vec=(0.055, 0.11, 0.008), verts=bm.verts)
        o = obj_from(bm, 'Epaulette', navy); o.location = (S * 0.15, 0.0, sh.z + 0.016); o.rotation_euler = (0, -S * 0.22, 0); add_subsurf(o, 1)
        for k in range(4):
            bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1); bmesh.ops.scale(bm, vec=(0.008, 0.112, 0.003), verts=bm.verts)
            o = obj_from(bm, 'EpauletteBar', gold); o.location = (S * (0.135 + 0.014 * k), 0.0, sh.z + 0.021 - S * 0.0031 * k * 0 + 0.0); o.rotation_euler = (0, -S * 0.22, 0)
    # ---- gold aviators worn on the face
    aviators(lm, gold)


def obj_from(bm, name, m):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(o); me.materials.append(m)
    return o


def jacket_material():
    """Navy wool with four gold captain bars near each cuff (painted by height on the sleeves)."""
    m = bpy.data.materials.new('Uniform'); m.use_nodes = True; N, L = m.node_tree.nodes, m.node_tree.links
    b = N['Principled BSDF']; b.inputs['Roughness'].default_value = 0.6
    if 'Sheen Weight' in b.inputs: b.inputs['Sheen Weight'].default_value = 0.35
    tc = N.new('ShaderNodeTexCoord'); P = N.new('ShaderNodeSeparateXYZ'); L.new(tc.outputs['Object'], P.inputs[0])
    ax = N.new('ShaderNodeMath'); ax.operation = 'ABSOLUTE'; L.new(P.outputs['X'], ax.inputs[0])
    on_sleeve = N.new('ShaderNodeMath'); on_sleeve.operation = 'GREATER_THAN'; L.new(ax.outputs[0], on_sleeve.inputs[0]); on_sleeve.inputs[1].default_value = 0.17
    bars = None
    for k in range(4):
        c = N.new('ShaderNodeMath'); c.operation = 'COMPARE'; L.new(P.outputs['Z'], c.inputs[0]); c.inputs[1].default_value = 0.955 + 0.016 * k; c.inputs[2].default_value = 0.0038
        if bars is None: bars = c
        else:
            mx = N.new('ShaderNodeMath'); mx.operation = 'MAXIMUM'; L.new(bars.outputs[0], mx.inputs[0]); L.new(c.outputs[0], mx.inputs[1]); bars = mx
    g = N.new('ShaderNodeMath'); g.operation = 'MULTIPLY'; L.new(bars.outputs[0], g.inputs[0]); L.new(on_sleeve.outputs[0], g.inputs[1])
    mix = N.new('ShaderNodeMix'); mix.data_type = 'RGBA'; L.new(g.outputs[0], mix.inputs['Factor'])
    mix.inputs[6].default_value = lin(NAVY); mix.inputs[7].default_value = lin(GOLD)
    L.new(mix.outputs[2], b.inputs['Base Color']); L.new(g.outputs[0], b.inputs['Metallic'])
    return m


def aviators(lm, gold):
    lens = bpy.data.materials.new('AviatorLens'); lens.use_nodes = True; N, L = lens.node_tree.nodes, lens.node_tree.links
    out = N['Material Output']; N.remove(N['Principled BSDF'])
    tr = N.new('ShaderNodeBsdfTransparent'); tr.inputs['Color'].default_value = (0.86, 0.84, 0.78, 1)
    gl = N.new('ShaderNodeBsdfGlossy'); gl.inputs['Roughness'].default_value = 0.03
    fr = N.new('ShaderNodeFresnel'); fr.inputs['IOR'].default_value = 1.6
    mx = N.new('ShaderNodeMixShader'); L.new(fr.outputs[0], mx.inputs[0]); L.new(tr.outputs[0], mx.inputs[1]); L.new(gl.outputs[0], mx.inputs[2]); L.new(mx.outputs[0], out.inputs['Surface'])
    rim_pts_all = []
    for ec in lm['eyes']:
        S = 1 if ec.x > 0 else -1
        c = Vector((ec.x + S * 0.006, ec.y - 0.036, ec.z - 0.004))
        pts = []
        for k in range(48):
            a = 2 * math.pi * k / 48
            x = 0.031 * math.cos(a); z = 0.023 * math.sin(a) - (0.010 * max(0, -math.sin(a)) * (1 + S * math.cos(a) * 0.5))   # teardrop: fuller at the bottom-outside
            pts.append(c + Vector((x + S * 0.002 * max(0, -math.sin(a)), 0.003 * (x / 0.026) * S, z)))
        rim_pts_all.append(pts)
        bm = bmesh.new(); vs = [bm.verts.new(p) for p in pts]; bm.faces.new(vs)
        o = obj_from(bm, 'Lens', lens)
        tube('AviatorRim', pts + [pts[0]], 0.0013, gold)
        # temple arm back to the ear
        tube('AviatorArm', [c + Vector((S * 0.032, 0, 0.012)), c + Vector((S * 0.06, 0.05, 0.016)), c + Vector((S * 0.066, 0.115, 0.004))], 0.0011, gold)
    l, r = rim_pts_all
    a, b = (l[12], r[12]) if l[12].x < r[12].x else (r[12], l[12])
    tube('AviatorBridge', [a, (a + b) / 2 + Vector((0, -0.002, 0.004)), b], 0.0012, gold)
    tube('AviatorBrowBar', [l[6] + Vector((0, 0, 0.002)), (l[6] + r[6]) / 2 + Vector((0, -0.003, 0.006)), r[6] + Vector((0, 0, 0.002))], 0.0011, gold)


def tube(name, pts, r, m):
    cu = bpy.data.curves.new(name, 'CURVE'); cu.dimensions = '3D'; cu.bevel_depth = r; cu.bevel_resolution = 3
    sp = cu.splines.new('POLY'); sp.points.add(len(pts) - 1)
    for p_, q in zip(sp.points, pts): p_.co = (q[0], q[1], q[2], 1)
    o = bpy.data.objects.new(name, cu); bpy.context.scene.collection.objects.link(o); cu.materials.append(m)
    return o


def preview(sc, lm):
    w = bpy.data.worlds.new('Studio'); sc.world = w; w.use_nodes = True
    bg = w.node_tree.nodes['Background']; bg.inputs['Color'].default_value = lin('#AEBFD1'); bg.inputs['Strength'].default_value = 0.4
    hc = lm['head_c']
    def light(name, energy, color, d, size, target):
        L = bpy.data.lights.new(name, 'AREA'); L.energy = energy; L.color = color; L.size = size
        o = bpy.data.objects.new(name, L); sc.collection.objects.link(o); o.location = Vector(target) + Vector(d)
        o.rotation_euler = (-Vector(d)).to_track_quat('-Z', 'Y').to_euler()
    light('Key', 70, (1.0, 0.88, 0.76), (-0.9, -1.3, 0.5), 1.0, hc)
    light('Fill', 25, (0.78, 0.86, 1.0), (1.2, -1.1, 0.0), 1.4, hc)
    light('Rim', 60, (1.0, 0.82, 0.62), (0.6, 1.1, 0.4), 0.6, hc)
    light('Body', 120, (1.0, 0.95, 0.9), (-1.2, -2.5, -0.4), 2.5, (0, 0, 1.0))
    cam = bpy.data.objects.new('Cam', bpy.data.cameras.new('Cam')); sc.collection.objects.link(cam); sc.camera = cam
    r = sc.render; r.engine = 'CYCLES'; sc.cycles.samples = int(os.environ.get('SAMPLES', 64)); sc.cycles.use_denoising = True
    r.resolution_x, r.resolution_y, r.resolution_percentage = 1080, 1350, int(os.environ.get('PCT', 50))
    vt = [i.identifier for i in sc.view_settings.bl_rna.properties['view_transform'].enum_items]
    sc.view_settings.view_transform = 'AgX' if 'AgX' in vt else 'Filmic'
    shots = {
        'portrait': (hc + Vector((-0.45, -1.30, 0.03)), hc + Vector((0, 0, -0.02)), 85),
        'bust': (hc + Vector((-0.75, -2.3, -0.05)), hc + Vector((0, 0, -0.22)), 85),
        'three_quarter': (hc + Vector((-1.0, -0.95, 0.03)), hc, 85),
        'profile': (hc + Vector((-1.4, 0.0, 0.0)), hc, 85),
        'full': (Vector((-1.2, -4.6, 1.0)), Vector((0, 0, 0.92)), 50),
    }
    which = [arg('shot')] if arg('shot') else ['portrait', 'bust', 'three_quarter', 'profile', 'full']
    for name in which:
        loc, look, lens = shots[name]; cam.location = loc; cam.data.lens = lens
        cam.rotation_euler = (Vector(look) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
        r.filepath = os.path.join(OUT, f'cfi_preview_{name}.png'); bpy.ops.render.render(write_still=True)
        print('preview →', r.filepath)


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    sc, body, eyes, lm, mouth = build()
    print('landmarks', {k: [round(x, 3) for x in v] if hasattr(v, '__len__') else round(v, 3) for k, v in lm.items() if k != 'eyes'}, 'mouth', [round(x, 3) for x in mouth])
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, 'cfi.blend'))
    if '--preview' in ARGS:
        preview(sc, lm)
