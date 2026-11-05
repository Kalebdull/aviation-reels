"""build_rv7.py — the show's airplane: an RV-7 taildragger in polished aluminium with one accent colour.

Run headless (here or on the Mac):   blender -b -P assets/blender/build_rv7.py -- --preview
or with the bpy module:              python3 assets/blender/build_rv7.py --preview

Writes  assets/models/rv7.blend   (open it in Blender to look around and tweak)
        assets/models/rv7.glb     (for the real-time engine)
        assets/models/rv7_preview_*.png  (with --preview: Cycles stills, golden hour)

Coordinates: metres, nose → +X, up → +Z, left wing → +Y. Modelled in level flight; ground attitude is a rotation.
Proportions: span 7.62 m (25 ft), length ≈ 6.2 m, wing chord 1.47 m, dihedral 3.5°.
The model is smooth (subdivision surfaces): the look is "Pixar short", not toy and not CAD.
"""
import math, os, sys
import bpy, bmesh
from mathutils import Vector, Matrix

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'assets', 'models')
ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
ACCENT = '#F26B1D'          # aviation orange; change here and re-run
for a in ARGS:
    if a.startswith('--accent='):
        ACCENT = a.split('=', 1)[1]


# ---------------------------------------------------------------- helpers
def hex_rgb(h):
    h = h.lstrip('#')
    srgb = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return [(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4) for c in srgb] + [1]


def material(name, color, metallic=0.0, rough=0.4, coat=0.0, transmission=0.0, ior=1.45, aniso=0.0, alpha=1.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = hex_rgb(color) if isinstance(color, str) else color
    b.inputs['Metallic'].default_value = metallic
    b.inputs['Roughness'].default_value = rough
    for key, val in (('Coat Weight', coat), ('Transmission Weight', transmission), ('IOR', ior), ('Anisotropic', aniso), ('Alpha', alpha)):
        if key in b.inputs:
            b.inputs[key].default_value = val
    return m


def mesh_object(name, bm, mats=(), subsurf=2, smooth=True, parent=None):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    for m in mats:
        me.materials.append(m)
    if smooth:
        for p in me.polygons:
            p.use_smooth = True
    if subsurf:
        mod = ob.modifiers.new('Subsurf', 'SUBSURF'); mod.levels = 1; mod.render_levels = subsurf
    if parent:
        ob.parent = parent
    return ob


def loft(rings, cap_start=True, cap_end=True, mat_of=None):
    """rings: list of closed loops (same vertex count). mat_of(i, j) → material index for the quad at ring i, vertex j."""
    bm = bmesh.new()
    vs = [[bm.verts.new(p) for p in r] for r in rings]
    n = len(rings[0])
    for i in range(len(rings) - 1):
        for j in range(n):
            f = bm.faces.new((vs[i][j], vs[i][(j + 1) % n], vs[i + 1][(j + 1) % n], vs[i + 1][j]))
            if mat_of:
                f.material_index = mat_of(i, j)
    for k, cap in ((0, cap_start), (len(rings) - 1, cap_end)):
        if cap:
            c = bm.verts.new(sum((Vector(p) for p in rings[k]), Vector()) / n)
            for j in range(n):
                a, b = vs[k][j], vs[k][(j + 1) % n]
                bm.faces.new((a, b, c) if k else (b, a, c))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def lerp_stations(st, x):
    for i in range(len(st) - 1):
        if st[i][0] <= x <= st[i + 1][0]:
            u = (x - st[i][0]) / (st[i + 1][0] - st[i][0])
            u = u * u * (3 - 2 * u) if 0 < i < len(st) - 2 else u
            return [st[i][k] + (st[i + 1][k] - st[i][k]) * u for k in range(1, len(st[i]))]
    return st[-1][1:] if x > st[-1][0] else st[0][1:]


# ---------------------------------------------------------------- scene
def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.unit_settings.system = 'METRIC'
    return sc


# fuselage stations: x, half-width, top, bottom
FUSE = [
    (0.22, 0.29, 0.22, -0.30), (0.45, 0.42, 0.32, -0.40), (0.85, 0.52, 0.40, -0.45), (1.25, 0.565, 0.45, -0.46),
    (1.70, 0.585, 0.48, -0.45), (2.40, 0.59, 0.50, -0.42), (3.00, 0.55, 0.58, -0.36), (3.80, 0.40, 0.50, -0.18),
    (4.75, 0.25, 0.40, -0.02), (5.60, 0.12, 0.34, 0.08), (5.95, 0.035, 0.32, 0.12),
]


def section(x, n=48, k=2.9):
    hw, top, bot = lerp_stations(FUSE, x)
    mid, hh = (top + bot) / 2, (top - bot) / 2
    pts = []
    for j in range(n):
        th = 2 * math.pi * j / n
        c, s = math.cos(th), math.sin(th)
        y = math.copysign(abs(c) ** (2 / k), c) * hw
        z = mid + math.copysign(abs(s) ** (2 / k), s) * hh
        pts.append((x, y, z))
    return pts


def build(sc):
    accent = material('Accent', ACCENT, rough=0.28, coat=1.0)
    alu = material('PolishedAluminium', (0.91, 0.92, 0.94, 1), metallic=1.0, rough=0.12, aniso=0.35)
    glass = material('Canopy', (0.80, 0.86, 0.92, 1), rough=0.02, transmission=1.0, ior=1.5)
    rubber = material('Rubber', '#1E2026', rough=0.7)
    steel = material('Steel', '#6E7682', metallic=0.8, rough=0.35)
    dark = material('Interior', '#2A2E36', rough=0.6)
    seat = material('Seats', '#3B2E2A', rough=0.55)

    root = bpy.data.objects.new('RV7', None); sc.collection.objects.link(root)

    # fuselage: aluminium with an accent swoosh along each side and an accent cowl front
    n, xs = 48, [0.22 + (5.95 - 0.22) * (i / 90) for i in range(91)]
    rings = [section(x, n) for x in xs]

    def fmat(i, j):
        x = xs[i]
        th = 2 * math.pi * (j + 0.5) / n
        side = math.cos(th)                       # +1 left side, -1 right side
        zf = math.sin(th)
        swoosh_c = 0.10 - 0.35 * max(0, x - 1.4) / 4.6 * 0.6       # the band drops slightly toward the tail
        band = abs(zf - swoosh_c) < 0.09 - 0.05 * max(0, x - 1.4) / 4.6
        if abs(side) > 0.55 and band and 0.6 < x < 5.9:
            return 1
        if x < 0.55:
            return 1
        return 0
    mesh_object('Fuselage', loft(rings, mat_of=fmat), (alu, accent), parent=root)

    # canopy bubble (glass) on top, from the panel to behind the seats
    cr = []
    for i in range(31):
        x = 1.50 + 1.65 * i / 30
        u = (x - 1.50) / 1.65
        h = 0.50 * math.sin(math.pi * min(1, u * 1.12) ** 0.8) if u < 0.89 else 0.50 * (1 - (u - 0.89) / 0.11 * 0.5)
        hw, top, _ = lerp_stations(FUSE, x)
        w = hw * 0.93
        ring = []
        for j in range(24):
            a = math.pi * j / 23
            ring.append((x, math.cos(a) * w, top - 0.02 + math.sin(a) * max(0.02, h)))
        for j in range(23, -1, -1):
            a = math.pi * j / 23
            ring.append((x, math.cos(a) * w * 0.98, top - 0.03))
        cr.append(ring)
    mesh_object('Canopy', loft(cr), (glass,), parent=root)
    # canopy frame bow
    bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=16, radius1=0.018, radius2=0.018, depth=1.1)
    bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi / 2, 3, 'X'))
    bow = mesh_object('CanopyBow', bm, (alu,), subsurf=0, parent=root); bow.location = (2.95, 0, 0.78)

    # interior: panel + two seats (seen through the glass)
    for y in (0.27, -0.27):
        bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1)
        bmesh.ops.scale(bm, vec=(0.42, 0.38, 0.62), verts=bm.verts)
        s = mesh_object('Seat', bm, (seat,), subsurf=2, parent=root); s.location = (2.55, y, 0.12); s.rotation_euler = (0, -0.35, 0)
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1); bmesh.ops.scale(bm, vec=(0.12, 0.98, 0.3), verts=bm.verts)
    p = mesh_object('Panel', bm, (dark,), subsurf=1, parent=root); p.location = (1.62, 0, 0.36)

    # low wing: rectangular, rounded tips, 3.5° dihedral, airfoil sections (RV-ish 23013.5)
    def airfoil(chord, t=0.135, m=24):
        up, lo = [], []
        for i in range(m + 1):
            xc = (1 - math.cos(math.pi * i / m)) / 2
            yt = 5 * t * (0.2969 * math.sqrt(xc) - 0.126 * xc - 0.3516 * xc ** 2 + 0.2843 * xc ** 3 - 0.1036 * xc ** 4)
            yc = 0.015 * math.sin(math.pi * xc)
            up.append((xc, yc + yt)); lo.append((xc, yc - yt))
        loop = up + lo[::-1][1:-1]
        return [(-(u - 0.27) * chord, v * chord) for u, v in loop]       # x (+ forward), z
    half, chord, dih = 3.81, 1.47, math.radians(3.5)
    wrings = []
    ys = [-half + 2 * half * i / 40 for i in range(41)]
    for y in ys:
        tipu = max(0, (abs(y) - (half - 0.32)) / 0.32)                  # last 0.32 m: rounded tip
        sc_c = math.sqrt(max(0.04, 1 - tipu ** 2)) if tipu > 0 else 1
        c = chord * (0.55 + 0.45 * sc_c) if tipu > 0 else chord
        th = 0.135 * (0.3 + 0.7 * sc_c)
        z0 = -0.36 + abs(y) * math.tan(dih)
        wrings.append([(2.18 + px * (c / chord) - (chord - c) * 0.1, y, z0 + pz * (th / 0.135) * (c / chord)) for px, pz in airfoil(chord)])
    def wmat(i, j):
        return 1 if abs(ys[i]) > half - 0.45 else 0                     # accent wingtips
    mesh_object('Wing', loft(wrings, mat_of=wmat), (alu, accent), parent=root)

    # horizontal stabiliser + elevator
    hr = []
    hs = 1.22
    for i in range(21):
        y = -hs + 2 * hs * i / 20
        tipu = max(0, (abs(y) - (hs - 0.18)) / 0.18)
        k = math.sqrt(max(0.05, 1 - tipu ** 2)) if tipu > 0 else 1
        c = 0.78 * (0.6 + 0.4 * k)
        hr.append([(5.82 + px * (c / 1.47) * 1.0 - 0.1, y, 0.2 + pz * 0.6 * (c / 1.47)) for px, pz in airfoil(1.47, 0.11)])
    mesh_object('HStab', loft(hr), (alu,), parent=root)

    # fin + rudder: the RV's rounded rudder top, accent on the rudder
    def fin_outline(z):          # leading/trailing edge x at height z above the fuselage top
        le = 5.18 + 0.62 * (z / 1.0) ** 0.9
        te = 6.32 - 0.04 * z
        return le, te
    fr = []
    zs = [0.24 + 0.98 * i / 24 for i in range(25)]
    for z in zs:
        zz = z - 0.24
        le, te = fin_outline(zz)
        if zz > 0.78:                                    # rounded top
            u = (zz - 0.78) / 0.2
            mid = (le + te) / 2; half_c = (te - le) / 2 * math.sqrt(max(0.02, 1 - u ** 2))
            le, te = mid - half_c + 0.06 * u, mid + half_c
        ch = te - le
        ring = []
        for px, pz in airfoil(1.0, 0.10):
            ring.append((le + (0.27 - px) * ch, pz * ch * 0.8, z))
        fr.append(ring)
    def rmat(i, j):
        return 1 if zs[i] > 0.85 else 0
    mesh_object('Fin', loft(fr, mat_of=rmat), (alu, accent), parent=root)

    # cowling inlets (dark ovals on the front) + spinner + prop
    for y in (0.17, -0.17):
        bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=24, v_segments=12, radius=0.09)
        bmesh.ops.scale(bm, vec=(0.3, 1.1, 0.8), verts=bm.verts)
        o = mesh_object('Inlet', bm, (dark,), subsurf=1, parent=root); o.location = (0.24, y, 0.04)
    prof = [(0.0, 0.0)] + [(0.13 * math.sin(math.pi / 2 * (i / 12) ** 0.65), -0.34 * (1 - i / 12)) for i in range(1, 13)]
    bm = bmesh.new()
    ring_list = []
    for r, xoff in prof:
        ring_list.append([(0.20 + xoff + 0.0, r * math.cos(2 * math.pi * j / 32), r * math.sin(2 * math.pi * j / 32)) for j in range(32)])
    sp = mesh_object('Spinner', loft(ring_list[1:], cap_start=True, cap_end=True), (accent,), parent=root)
    prop = bpy.data.objects.new('Prop', None); sc.collection.objects.link(prop); prop.parent = root; prop.location = (0.0, 0, 0)
    for sgn in (1, -1):
        bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1)
        bmesh.ops.scale(bm, vec=(0.03, 0.13, 0.86), verts=bm.verts)
        bl = mesh_object('Blade', bm, (steel, accent), subsurf=2, parent=prop); bl.location = (0.05, 0, sgn * 0.46); bl.rotation_euler = (sgn * 0.25, 0, 0)

    # main gear: tapered legs + teardrop wheel pants; tailwheel on a spring
    for sgn in (1, -1):
        a, b = Vector((1.38, sgn * 0.45, -0.42)), Vector((1.46, sgn * 0.92, -0.92))
        bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=12, radius1=0.05, radius2=0.03, depth=(b - a).length)
        leg = mesh_object('GearLeg', bm, (alu,), subsurf=1, parent=root)
        leg.location = (a + b) / 2; leg.rotation_euler = (Vector((0, 0, 1))).rotation_difference(b - a).to_euler()
        bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=32, v_segments=16, radius=0.30)
        for v in bm.verts:
            v.co.x *= 1.25 if v.co.x > 0 else 1.85; v.co.y *= 0.36; v.co.z *= 0.62
        pant = mesh_object('WheelPant', bm, (accent,), subsurf=1, parent=root); pant.location = (1.46, sgn * 0.95, -0.98)
        bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=24, radius1=0.17, radius2=0.17, depth=0.12)
        bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi / 2, 3, 'X'))
        tire = mesh_object('Tire', bm, (rubber,), subsurf=1, parent=root); tire.location = (1.46, sgn * 0.95, -1.04)
    a, b = Vector((5.82, 0, 0.12)), Vector((6.12, 0, -0.18))
    bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=10, radius1=0.025, radius2=0.02, depth=(b - a).length)
    sp2 = mesh_object('TailSpring', bm, (steel,), subsurf=0, parent=root); sp2.location = (a + b) / 2; sp2.rotation_euler = Vector((0, 0, 1)).rotation_difference(b - a).to_euler()
    bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=20, radius1=0.09, radius2=0.09, depth=0.06)
    bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi / 2, 3, 'X'))
    tw = mesh_object('TailWheel', bm, (rubber,), subsurf=1, parent=root); tw.location = (6.14, 0, -0.27)
    return root


# ---------------------------------------------------------------- preview: golden-hour air-to-air
def preview(sc, root):
    world = bpy.data.worlds.new('Sky'); sc.world = world; world.use_nodes = True
    nt = world.node_tree; bg = nt.nodes['Background']
    tc = nt.nodes.new('ShaderNodeTexCoord'); sep = nt.nodes.new('ShaderNodeSeparateXYZ'); nt.links.new(tc.outputs['Generated'], sep.inputs[0])
    ramp = nt.nodes.new('ShaderNodeValToRGB'); el = ramp.color_ramp.elements
    el[0].position, el[0].color = 0.0, hex_rgb('#C98E6E')          # below the horizon: warm haze
    el[1].position, el[1].color = 1.0, hex_rgb('#2F5597')          # zenith: deep blue
    for pos, col in ((0.47, '#F4C79A'), (0.52, '#FFD9A8'), (0.6, '#E9A07E'), (0.75, '#7E8DBA')):
        e = el.new(pos); e.color = hex_rgb(col)
    mr = nt.nodes.new('ShaderNodeMapRange'); mr.inputs['From Min'].default_value = -1; mr.inputs['From Max'].default_value = 1
    nt.links.new(sep.outputs['Z'], mr.inputs['Value']); nt.links.new(mr.outputs['Result'], ramp.inputs['Fac'])
    nt.links.new(ramp.outputs['Color'], bg.inputs['Color']); bg.inputs['Strength'].default_value = 1.0
    # patchwork countryside 150 m below, fading into the haze with distance (the chrome reflects it)
    bm = bmesh.new(); bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=12000)
    gnd = mesh_object('Ground', bm, (), subsurf=0); gnd.location = (0, 0, -150)
    gm = bpy.data.materials.new('Fields'); gm.use_nodes = True; N, Lk = gm.node_tree.nodes, gm.node_tree.links
    bsdf = N['Principled BSDF']; bsdf.inputs['Roughness'].default_value = 0.95
    tc = N.new('ShaderNodeTexCoord'); vor = N.new('ShaderNodeTexVoronoi'); vor.inputs['Scale'].default_value = 0.035; vor.inputs['Randomness'].default_value = 0.85
    Lk.new(tc.outputs['Object'], vor.inputs['Vector'])
    ramp = N.new('ShaderNodeValToRGB'); el = ramp.color_ramp.elements
    el[0].color = hex_rgb('#4F7A3A'); el[1].color = hex_rgb('#C9A85E')
    for pos, col in ((0.3, '#6E9446'), (0.55, '#94A852'), (0.75, '#3E6A35')):
        e = el.new(pos); e.color = hex_rgb(col)
    Lk.new(vor.outputs['Color'], ramp.inputs['Fac']) if 'Color' in vor.outputs else Lk.new(vor.outputs[1], ramp.inputs['Fac'])
    cd = N.new('ShaderNodeCameraData'); mr = N.new('ShaderNodeMapRange'); mr.inputs['From Min'].default_value = 300; mr.inputs['From Max'].default_value = 5000
    Lk.new(cd.outputs['View Distance'], mr.inputs['Value'])
    mix = N.new('ShaderNodeMix'); mix.data_type = 'RGBA'
    Lk.new(mr.outputs['Result'], mix.inputs['Factor']); Lk.new(ramp.outputs['Color'], mix.inputs[6]); mix.inputs[7].default_value = hex_rgb('#E8B48C')
    Lk.new(mix.outputs[2], bsdf.inputs['Base Color'])
    em = N.new('ShaderNodeEmission'); Lk.new(mix.outputs[2], em.inputs['Color']); em.inputs['Strength'].default_value = 0.0
    gnd.data.materials.append(gm)
    sun = bpy.data.objects.new('Sun', bpy.data.lights.new('Sun', 'SUN')); sc.collection.objects.link(sun)
    sun.data.energy = 4.2; sun.data.color = (1.0, 0.78, 0.55); sun.data.angle = math.radians(2.5)
    sun.rotation_euler = (math.radians(81), 0, math.radians(215 + 90))
    cam = bpy.data.objects.new('Cam', bpy.data.cameras.new('Cam')); sc.collection.objects.link(cam); sc.camera = cam
    cam.data.lens = 85; cam.data.dof.use_dof = True; cam.data.dof.focus_object = root; cam.data.dof.aperture_fstop = 2.8
    r = sc.render
    r.engine = 'CYCLES'; sc.cycles.samples = int(os.environ.get('SAMPLES', 48)); sc.cycles.use_denoising = True
    r.resolution_x, r.resolution_y, r.resolution_percentage = 1080, 1920, int(os.environ.get('PCT', 50))
    r.film_transparent = False
    sc.view_settings.view_transform = 'AgX' if 'AgX' in [i.identifier for i in sc.view_settings.bl_rna.properties['view_transform'].enum_items] else 'Filmic'
    looks = [i.identifier for i in sc.view_settings.bl_rna.properties['look'].enum_items]
    sc.view_settings.look = next((l for l in looks if 'Punchy' in l), 'None')
    shots = {'front34': ((15.0, 14.0, 4.2), (2.6, 0.0, -0.2)), 'side': ((3.0, 24.0, 0.6), (3.0, 0, 0.0)), 'rear34': ((-10.5, -15.0, 4.5), (2.8, 0, 0.1))}
    which = [a.split('=', 1)[1] for a in ARGS if a.startswith('--shot=')] or list(shots)
    for name in which:
        loc, look = shots[name]
        cam.location = loc
        d = Vector(look) - Vector(loc); cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
        r.filepath = os.path.join(OUT, f'rv7_preview_{name}.png')
        bpy.ops.render.render(write_still=True)
        print('preview →', r.filepath)


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    sc = reset()
    root = build(sc)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, 'rv7.blend'))
    try:
        bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, 'rv7.glb'), export_apply=True, export_yup=True)
        print('glb →', os.path.join(OUT, 'rv7.glb'))
    except Exception as e:
        print('glb export skipped:', e)
    if '--preview' in ARGS:
        preview(sc, root)
