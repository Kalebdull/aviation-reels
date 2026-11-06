"""build_rv7.py (v2): the show's airplane, an RV-7 taildragger in soft satin paint with working control surfaces.

Run headless (here or on the Mac):   blender -b -P assets/blender/build_rv7.py -- --preview
or with the bpy module:              python3 assets/blender/build_rv7.py --preview [--shot=studio_front34] [--pose=controls]

Writes  assets/models/rv7.blend          open it in Blender to look around and tweak
        assets/models/rv7.glb            for the real-time engine (named, animatable nodes)
        assets/models/rv7_rig.json       every moving part: node name, hinge axis, travel limits
        assets/models/rv7_*.png          with --preview: studio turnaround + golden-hour beauty shot (Cycles)

Livery: change BODY / TRIM / ACCENT below (or --body=#hex --trim=#hex --accent=#hex) and re-run.

Coordinates: metres. Fuselage station x runs from the nose (≈0) to the tail (≈6.2), so the nose points −X.
Up is +Z, the LEFT wing is +Y. Modelled in level flight; `--pose=ground` sits it in the 3-point attitude.
Proportions follow the RV-7: span 7.62 m (25 ft), length ≈ 6.2 m, wing chord 1.47 m, dihedral 3.5°, prop 1.83 m.

Control-surface sign convention (rotation of the moving part about its hinge, degrees):
  aileron/elevator/trim/flap: + = trailing edge UP          rudder: + = trailing edge LEFT (+Y)
  tailwheel: + = steer left        prop: spins about X
"""
import json, math, os, sys
import bpy, bmesh
from mathutils import Vector, Matrix, Euler

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'assets', 'models')
ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
arg = lambda k, d=None: next((a.split('=', 1)[1] for a in ARGS if a.startswith(f'--{k}=')), d)

# ---- livery: one soft body colour, a white trim swoosh, one navy accent ----
BODY = arg('body', '#1F4FC4')      # deep satin blue: top of the fuselage, tail, spinner
TRIM = arg('trim', '#F7F8FA')      # white: belly, wings, stab, gear, wheel pants
ACCENT = arg('accent', '#15171C')  # black: the swoosh between blue and white, canopy frame, spinner
SPARK = arg('spark', '#FFB23F')    # Aviation Reels amber: the pinstripe and the tail slash
TAG = arg('tag', '')

DIH = math.radians(3.5)


# ================================================================ helpers
def lin(h):
    h = h.lstrip('#'); c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return [(v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4) for v in c] + [1]


def material(name, color, rough=0.4, metallic=0.0, coat=0.0, transmission=0.0, ior=1.45, emission=None, estr=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = lin(color) if isinstance(color, str) else color
    b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metallic
    for k, v in (('Coat Weight', coat), ('Coat Roughness', 0.04), ('Transmission Weight', transmission), ('IOR', ior)):
        if k in b.inputs: b.inputs[k].default_value = v
    if emission and 'Emission Color' in b.inputs:
        b.inputs['Emission Color'].default_value = lin(emission); b.inputs['Emission Strength'].default_value = estr
    return m


def new_obj(name, bm, mats, sub=2, smooth=True, parent=None, loc=(0, 0, 0), rot=(0, 0, 0), solidify=0.0):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(o)
    for m in (mats if isinstance(mats, (list, tuple)) else [mats]): me.materials.append(m)
    if smooth:
        for p in me.polygons: p.use_smooth = True
    if solidify:
        s = o.modifiers.new('Shell', 'SOLIDIFY'); s.thickness = solidify; s.offset = 0
    if sub:
        md = o.modifiers.new('Subsurf', 'SUBSURF'); md.levels = 1; md.render_levels = sub
    o.parent = parent; o.location = loc; o.rotation_euler = rot
    return o


def empty(name, parent=None, loc=(0, 0, 0), rot=(0, 0, 0)):
    e = bpy.data.objects.new(name, None); bpy.context.collection.objects.link(e)
    e.empty_display_size = 0.15; e.parent = parent; e.location = loc; e.rotation_euler = rot
    return e


def loft(rings, closed=True, cap_start=False, cap_end=False, mat_of=None):
    bm = bmesh.new()
    vs = [[bm.verts.new(p) for p in r] for r in rings]
    n = len(rings[0]); m = n if closed else n - 1
    for i in range(len(rings) - 1):
        for j in range(m):
            f = bm.faces.new((vs[i][j], vs[i][(j + 1) % n], vs[i + 1][(j + 1) % n], vs[i + 1][j]))
            if mat_of: f.material_index = mat_of(i, j)
    for k, cap in ((0, cap_start), (len(rings) - 1, cap_end)):
        if cap and closed:
            c = bm.verts.new(sum((Vector(p) for p in rings[k]), Vector()) / n)
            for j in range(n):
                a, b = vs[k][j], vs[k][(j + 1) % n]
                f = bm.faces.new((a, b, c) if k else (b, a, c))
                if mat_of: f.material_index = mat_of(min(k, len(rings) - 2), j)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def prim(kind, **kw):
    bm = bmesh.new()
    if kind == 'sphere': bmesh.ops.create_uvsphere(bm, u_segments=kw.get('u', 32), v_segments=kw.get('v', 16), radius=kw.get('r', 1))
    elif kind == 'cyl': bmesh.ops.create_cone(bm, cap_ends=True, segments=kw.get('seg', 24), radius1=kw['r1'], radius2=kw.get('r2', kw['r1']), depth=kw['d'])
    elif kind == 'cube': bmesh.ops.create_cube(bm, size=1)
    if 'scale' in kw: bmesh.ops.scale(bm, vec=kw['scale'], verts=bm.verts)
    return bm


def tube(name, pts, r, m, parent):
    """A smooth swept tube through points (canopy frames, rails)."""
    cu = bpy.data.curves.new(name, 'CURVE'); cu.dimensions = '3D'; cu.bevel_depth = r; cu.bevel_resolution = 4; cu.use_fill_caps = True
    sp = cu.splines.new('POLY'); sp.points.add(len(pts) - 1)
    for p_, q in zip(sp.points, pts): p_.co = (q[0], q[1], q[2], 1)
    o = bpy.data.objects.new(name, cu); bpy.context.collection.objects.link(o); cu.materials.append(m); o.parent = parent
    return o


def rod(name, a, b, r0, r1, m, parent, sub=1):
    a, b = Vector(a), Vector(b)
    o = new_obj(name, prim('cyl', r1=r0, r2=r1, d=(b - a).length, seg=16), m, sub=sub, parent=parent, loc=(a + b) / 2)
    o.rotation_euler = Vector((0, 0, 1)).rotation_difference(b - a).to_euler()
    return o


# ================================================================ airfoils (chord fraction u: 0 = LE, 1 = TE)
def af(u, t, camber=0.018):
    yt = 5 * t * (0.2969 * math.sqrt(max(u, 0)) - 0.126 * u - 0.3516 * u * u + 0.2843 * u ** 3 - 0.1036 * u ** 4)
    yc = camber * math.sin(math.pi * u) * (1 - 0.3 * u)
    return yc + yt, yc - yt, yc


def cos_space(a, b, n):
    return [a + (b - a) * (1 - math.cos(math.pi * i / n)) / 2 for i in range(n + 1)]


def loop(u0, u1, t, n=14, camber=0.018):
    """Closed section between chord fractions u0..u1: upper surface u1→u0, then lower u0→u1. Points are (u, z/c)."""
    us = cos_space(u0, u1, n)
    up = [(u, af(u, t, camber)[0]) for u in reversed(us)]
    lo = [(u, af(u, t, camber)[1]) for u in us[1:-1]] if u0 == 0 else [(u, af(u, t, camber)[1]) for u in us]
    if u0 == 0:
        return up + lo + [(us[-1], af(us[-1], t, camber)[1])]
    return up + lo


# ================================================================ fuselage
# station x, half-width, top, bottom  (RV-7: deep cabin, short cowl, slim tailcone)
FUSE = [
    (0.20, 0.43, 0.27, -0.24), (0.45, 0.53, 0.39, -0.32), (0.85, 0.575, 0.48, -0.36), (1.25, 0.59, 0.55, -0.37),
    (1.70, 0.595, 0.60, -0.36), (2.40, 0.595, 0.63, -0.33), (3.00, 0.56, 0.72, -0.27), (3.80, 0.42, 0.64, -0.12),
    (4.75, 0.27, 0.50, 0.02), (5.60, 0.13, 0.40, 0.10), (6.02, 0.04, 0.37, 0.15),
]


def fstation(x):
    """Half-width, top, bottom at station x: a Catmull-Rom spline through the stations (C1-smooth, no ripples)."""
    S = FUSE
    if x <= S[0][0]: return list(S[0][1:])
    if x >= S[-1][0]: return list(S[-1][1:])
    i = max(k for k in range(len(S) - 1) if S[k][0] <= x)
    p0, p1, p2, p3 = S[max(0, i - 1)], S[i], S[i + 1], S[min(len(S) - 1, i + 2)]
    u = (x - p1[0]) / (p2[0] - p1[0])
    # tangents scaled by station spacing (non-uniform Catmull-Rom)
    out = []
    for k in (1, 2, 3):
        m1 = (p2[k] - p0[k]) / (p2[0] - p0[0]) * (p2[0] - p1[0]) if p0 is not p1 else (p2[k] - p1[k])
        m2 = (p3[k] - p1[k]) / (p3[0] - p1[0]) * (p2[0] - p1[0]) if p3 is not p2 else (p2[k] - p1[k])
        h00, h10, h01, h11 = 2*u**3 - 3*u**2 + 1, u**3 - 2*u**2 + u, -2*u**3 + 3*u**2, u**3 - u**2
        out.append(h00 * p1[k] + h10 * m1 + h01 * p2[k] + h11 * m2)
    return out


CX0, CX1 = 1.46, 3.30          # canopy (windscreen base → where it lands on the turtledeck)


def canopy_add(x, y):
    """Extra height the canopy adds to the fuselage top at (x, y). Zero at the sides and both ends, so the glass grows
    out of the skin with no seam: the cabin sides flow straight up into it and it lands on the turtledeck."""
    if not (CX0 < x < CX1): return 0.0
    hw = fstation(x)[0]; q = (abs(y) / hw) / 0.88        # the bulge starts exactly at the glass sill line
    if q >= 1: return 0.0
    return canopy_h((x - CX0) / (CX1 - CX0)) * (1 - q ** 3.2) ** 0.35      # flat-topped, broad


def fsurf_z(x, y, k=3.3):
    """Height of the fuselage's upper surface (including the canopy) at station x, lateral offset y."""
    hw, top, bot = fstation(x); mid, hh = (top + bot) / 2, (top - bot) / 2
    c = min(0.999, abs(y) / hw) ** (k / 2); s_ = math.sqrt(max(0.0, 1 - c * c))
    return mid + s_ ** (2 / k) * hh + canopy_add(x, y)


def canopy_h(u, H=0.25):
    """Canopy height above the deck line along its length: steep raked windscreen, long low taper into the turtledeck."""
    return H * math.sin(math.pi * max(0.0, min(1.0, u)) ** 0.72) ** 0.8


def fsection(x, n=104, k=3.3):
    hw, top, bot = fstation(x); mid, hh = (top + bot) / 2, (top - bot) / 2
    out = []
    for j in range(n):
        th = 2 * math.pi * j / n; c, s = math.cos(th), math.sin(th)
        y = math.copysign(abs(c) ** (2 / k), c) * hw
        z = mid + math.copysign(abs(s) ** (2 / k), s) * hh
        if s < 0: y *= 1 - 0.22 * (-s) ** 1.5             # the belly narrows toward the bottom
        if s > 0: z += canopy_add(x, y)
        out.append((x, y, z))
    return out


# ================================================================ livery painted in the shader (smooth curves, any mesh density)
def tinted_glass():
    """Smoky tinted canopy: a thin-skin glass (no lensing) that still reflects the sky like real acrylic."""
    m = bpy.data.materials.new('CanopyTint'); m.use_nodes = True; N, L = m.node_tree.nodes, m.node_tree.links
    out = N['Material Output']; N.remove(N['Principled BSDF'])
    tr = N.new('ShaderNodeBsdfTransparent'); tr.inputs['Color'].default_value = (0.34, 0.40, 0.47, 1)      # the tint
    gl = N.new('ShaderNodeBsdfGlossy'); gl.inputs['Roughness'].default_value = 0.02
    fr = N.new('ShaderNodeFresnel'); fr.inputs['IOR'].default_value = 1.5
    mx = N.new('ShaderNodeMixShader'); L.new(fr.outputs[0], mx.inputs[0]); L.new(tr.outputs[0], mx.inputs[1]); L.new(gl.outputs[0], mx.inputs[2])
    L.new(mx.outputs[0], out.inputs['Surface'])
    m.blend_method = 'BLEND' if hasattr(m, 'blend_method') else None
    return m


def fin_material(ox=0.0, oz=0.0):
    """Blue tail with the signature black + amber slash. ox/oz: the part's origin, so the slash continues across hinged parts."""
    m = bpy.data.materials.new('FinLivery'); m.use_nodes = True; N, L = m.node_tree.nodes, m.node_tree.links
    b = N['Principled BSDF']; b.inputs['Roughness'].default_value = 0.22; b.inputs['Metallic'].default_value = 0.45
    if 'Coat Weight' in b.inputs: b.inputs['Coat Weight'].default_value = 1.0; b.inputs['Coat Roughness'].default_value = 0.04
    tc = N.new('ShaderNodeTexCoord'); P = N.new('ShaderNodeSeparateXYZ'); L.new(tc.outputs['Object'], P.inputs[0])
    # slash line rising toward the back: d = z - 1.15*(x - 5.0) - 0.18
    d1 = N.new('ShaderNodeMath'); d1.operation = 'MULTIPLY_ADD'; L.new(P.outputs['X'], d1.inputs[0]); d1.inputs[1].default_value = -1.15; d1.inputs[2].default_value = 5.75 - 0.42 - 1.15 * ox + oz
    d = N.new('ShaderNodeMath'); d.operation = 'ADD'; L.new(P.outputs['Z'], d.inputs[0]); L.new(d1.outputs[0], d.inputs[1])
    def band(lo, hi):
        r = N.new('ShaderNodeMapRange'); r.interpolation_type = 'LINEAR'; L.new(d.outputs[0], r.inputs['Value'])
        r.inputs['From Min'].default_value = lo; r.inputs['From Max'].default_value = hi
        g = N.new('ShaderNodeMath'); g.operation = 'COMPARE'; L.new(d.outputs[0], g.inputs[0]); g.inputs[1].default_value = (lo + hi) / 2; g.inputs[2].default_value = (hi - lo) / 2
        return g.outputs[0]
    def rgb(h):
        n = N.new('ShaderNodeRGB'); n.outputs[0].default_value = lin(h); return n.outputs[0]
    def mix(f, a, c):
        n = N.new('ShaderNodeMix'); n.data_type = 'RGBA'; L.new(f, n.inputs['Factor']); L.new(a, n.inputs[6]); L.new(c, n.inputs[7]); return n.outputs[2]
    c = mix(band(0.0, 0.11), rgb(BODY), rgb(ACCENT)); c = mix(band(0.135, 0.175), c, rgb(SPARK))
    L.new(c, b.inputs['Base Color'])
    return m


def livery_material():
    m = bpy.data.materials.new('Livery'); m.use_nodes = True
    N, L = m.node_tree.nodes, m.node_tree.links
    b = N['Principled BSDF']; b.inputs['Roughness'].default_value = 0.22
    if 'Coat Weight' in b.inputs: b.inputs['Coat Weight'].default_value = 1.0
    if 'Coat Roughness' in b.inputs: b.inputs['Coat Roughness'].default_value = 0.04
    tc = N.new('ShaderNodeTexCoord'); P = N.new('ShaderNodeSeparateXYZ'); L.new(tc.outputs['Object'], P.inputs[0])
    Nn = N.new('ShaderNodeSeparateXYZ'); L.new(tc.outputs['Normal'], Nn.inputs[0])
    def math(op, a, b=None, c=None):
        n = N.new('ShaderNodeMath'); n.operation = op
        for i, v in enumerate((a, b, c)):
            if v is None: continue
            if isinstance(v, (int, float)): n.inputs[i].default_value = v
            else: L.new(v, n.inputs[i])
        return n.outputs[0]
    def band(v, lo, hi, soft=0.004):            # smooth 0..1 mask for lo < v < hi
        a = math('SUBTRACT', v, lo); a = math('DIVIDE', a, soft); a = math('MINIMUM', math('MAXIMUM', a, 0.0), 1.0)
        c = math('SUBTRACT', hi, v); c = math('DIVIDE', c, soft); c = math('MINIMUM', math('MAXIMUM', c, 0.0), 1.0)
        return math('MULTIPLY', a, c)
    x, z = P.outputs['X'], P.outputs['Z']
    # split line: low at the cowl, rising gently under the canopy, up toward the tail (z = -0.29 + 0.075x)
    # blue nose, then the line sweeps up through the middle of the side toward the tail (white below)
    # speed swoosh: low at the nose, sweeping up through mid-side to high at the tail
    split = math('ADD', -0.15, math('MULTIPLY', x, 0.09))
    split = math('SUBTRACT', split, math('MULTIPLY', math('MAXIMUM', math('SUBTRACT', 0.9, x), 0.0), 0.10))
    dz = math('SUBTRACT', z, split)
    blue = band(dz, 0.0, 9.0, 0.004)
    black = band(dz, -0.095, -0.020, 0.003)         # the bold black swoosh (a thin white line sits above it)
    spark = band(dz, -0.142, -0.108, 0.002)         # amber pinstripe under it
    def rgb(hexv):
        n = N.new('ShaderNodeRGB'); n.outputs[0].default_value = lin(hexv); return n.outputs[0]
    def mix(fac, a, b):
        n = N.new('ShaderNodeMix'); n.data_type = 'RGBA'; L.new(fac, n.inputs['Factor']); L.new(a, n.inputs[6]); L.new(b, n.inputs[7]); return n.outputs[2]
    c = mix(blue, rgb(TRIM), rgb(BODY)); c = mix(black, c, rgb(ACCENT)); c = mix(spark, c, rgb(SPARK))
    L.new(c, b.inputs['Base Color'])
    # metallic-flake blue, plain gloss white
    mm = N.new('ShaderNodeMath'); mm.operation = 'MULTIPLY'; L.new(blue, mm.inputs[0]); mm.inputs[1].default_value = 0.45
    L.new(mm.outputs[0], b.inputs['Metallic'])
    return m


# ================================================================ build
def build():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    M = {
        'body': material('Paint_Body', BODY, rough=0.24, metallic=0.45, coat=1.0),
        'trim': material('Paint_Trim', TRIM, rough=0.22, coat=1.0),
        'accent': material('Paint_Accent', ACCENT, rough=0.25, coat=1.0),
        'glass': material('Canopy', (0.74, 0.82, 0.90, 1), rough=0.0, transmission=1.0, ior=1.0),
        'lens': material('LightLens', (0.95, 0.97, 1.0, 1), rough=0.05, transmission=1.0, ior=1.5),
        'rubber': material('Rubber', '#1C1E22', rough=0.72),
        'steel': material('Steel', '#7D8590', rough=0.32, metallic=0.85),
        'exhaust': material('Exhaust', '#4A4440', rough=0.5, metallic=0.7),
        'inlet': material('Inlet', '#101216', rough=0.8),
        'interior': material('Interior', '#2B2F36', rough=0.65),
        'seat': material('Seats', '#5A3B2A', rough=0.55),
        'screen': material('Screen', '#0B1A2C', rough=0.2, emission='#4FA3E3', estr=1.6),
        'red': material('NavRed', '#FF2B2B', rough=0.2, emission='#FF2B2B', estr=3.0),
        'green': material('NavGreen', '#2BFF6A', rough=0.2, emission='#2BFF6A', estr=3.0),
        'white': material('Strobe', '#FFFFFF', rough=0.2, emission='#FFFFFF', estr=2.0),
    }
    root = empty('RV7')
    rig = {'units': 'metres', 'up': '+Z (Blender) / +Y (glTF)', 'nose': '-X', 'left_wing': '+Y', 'parts': []}

    def hinge(name, parent, loc, rot, axis, lo, hi, note):
        e = empty(name, parent, loc, rot)
        rig['parts'].append({'node': name, 'axis': axis, 'min_deg': lo, 'max_deg': hi, 'note': note})
        return e

    # ---------- fuselage: body paint, a white swoosh with a navy pinstripe, navy anti-glare panel ----------
    n, xs = 104, [0.20 + (6.02 - 0.20) * i / 200 for i in range(201)]
    rings = [fsection(x, n) for x in xs]

    def fmat(i, j):
        x = xs[min(i, len(xs) - 1)]; th = 2 * math.pi * (j + 0.5) / n
        c, s = math.cos(th), math.sin(th)
        if s > 0.75 and 0.55 < x < 1.45: return 2                              # anti-glare panel ahead of the windscreen
        centre = 0.05 + 0.10 * math.sin(min(1, max(0, (x - 0.5) / 5.3)) * math.pi * 0.9) - 0.32 * max(0, x - 3.6) / 2.4
        width = 0.11 * (1 - 0.45 * max(0, x - 1.0) / 5)
        if abs(c) > 0.45 and 0.5 < x < 5.85:
            if abs(s - centre) < width: return 1                                # white swoosh
            if abs(s - (centre - width - 0.035)) < 0.022: return 2              # navy pinstripe under it
        return 0
    def is_glass(i, j):
        # glass = a fixed band of the cross-section (a clean sill line along one vertex row) where the canopy is tall enough
        th = 2 * math.pi * (j + 0.5) / n
        if math.sin(th) <= 0: return False
        q = abs(math.cos(th)) ** (2 / 3.3)                       # = |y| / half-width for this row
        xm = (xs[min(i, len(xs) - 1)] + xs[min(i + 1, len(xs) - 1)]) / 2
        return q < 0.88 and canopy_h((xm - CX0) / (CX1 - CX0)) > 0.012 if CX0 < xm < CX1 else False
    new_obj('Fuselage', loft(rings, closed=True, cap_start=True, cap_end=True, mat_of=lambda i, j: 1 if is_glass(i, j) else 0),
            (livery_material(), tinted_glass()), parent=root, sub=1)
    # black canopy frame: rails along both sills + the windscreen bow, all lying ON the skin
    left, right = [], []
    for i in range(len(rings) - 1):
        js = [j for j in range(n // 2 + 1) if is_glass(i, j)]
        if js:
            left.append(rings[i][min(js)]); right.append(rings[i][(max(js) + 1) % n])
    for side_pts in (left, right):
        tube('CanopyRail', [(p[0], p[1] * 1.004, p[2] + 0.004) for p in side_pts], 0.014, M['accent'], root)
    glass_rows = [i for i in range(len(rings) - 1) if any(is_glass(i, j) for j in range(n // 2 + 1))]
    for ib, name in ((glass_rows[0], 'WindscreenBase'), (min(range(len(xs)), key=lambda i: abs(xs[i] - 1.98)), 'WindscreenBow')):
        js = [j for j in range(n // 2 + 2) if is_glass(ib, j) or is_glass(ib, j - 1)]
        tube(name, [(rings[ib][j][0], rings[ib][j][1], rings[ib][j][2] + 0.006) for j in js], 0.016, M['accent'], root)

    # ---------- interior: panel with two screens, two seats, two sticks ----------
    new_obj('Panel', prim('cube', scale=(0.14, 1.0, 0.26)), M['interior'], sub=1, parent=root, loc=(1.66, 0, 0.44))
    for y in (0.24, -0.24):
        new_obj('Screen', prim('cube', scale=(0.01, 0.2, 0.14)), M['screen'], sub=0, parent=root, loc=(1.735, y, 0.45))
        new_obj('SeatBase', prim('cube', scale=(0.5, 0.42, 0.12)), M['seat'], sub=2, parent=root, loc=(2.42, y, -0.08))
        new_obj('SeatBack', prim('cube', scale=(0.12, 0.42, 0.62)), M['seat'], sub=2, parent=root, loc=(2.72, y, 0.2), rot=(0, 0.28, 0))
        rod('Stick', (2.12, y, -0.18), (2.06, y, 0.2), 0.016, 0.012, M['interior'], root)
        new_obj('StickGrip', prim('sphere', r=0.03), M['rubber'], sub=1, parent=root, loc=(2.06, y, 0.16))

    # ---------- cowling details: inlets, exhausts ----------
    for y in (0.27, -0.27):
        # sporty round intakes: open oval mouths with thin lips, long cheeks flowing back into the cowl
        R, r_, EZ = 0.088, 0.013, 0.8                     # mouth radius, lip radius, vertical squash (oval)
        cx, cz = 0.205, 0.05
        cheek = prim('sphere', r=1, u=48, v=24)
        bmesh.ops.delete(cheek, geom=[v for v in cheek.verts if v.co.x < -0.05], context='VERTS')     # open at the front
        for v in cheek.verts:
            v.co.x *= 0.42; v.co.y *= R + r_; v.co.z *= (R + r_) * EZ
        new_obj('IntakeCheek', cheek, M['body'], sub=1, parent=root, loc=(cx, y, cz))
        lip = [[(r_ * math.sin(b), (R + r_ * math.cos(b)) * math.cos(a), (R + r_ * math.cos(b)) * math.sin(a) * EZ) for a in [2 * math.pi * k / 48 for k in range(48)]] for b in [2 * math.pi * k / 16 for k in range(17)]]
        new_obj('IntakeLip', loft(lip, closed=True), M['body'], sub=1, parent=root, loc=(cx - 0.02, y, cz))
        th = prim('cyl', r1=R, r2=R * 0.75, d=0.16, seg=40); bmesh.ops.scale(th, vec=(1, EZ, 1), verts=th.verts)
        new_obj('IntakeThroat', th, M['inlet'], sub=1, parent=root, loc=(cx + 0.10, y, cz), rot=(0, math.pi / 2, 0))
        # cut a real opening through the cowl so you look into the throat (boolean before the smoothing)
        cut = prim('cyl', r1=R * 0.97, d=0.5, seg=48); bmesh.ops.scale(cut, vec=(1, EZ, 1), verts=cut.verts)
        cutter = new_obj(f'IntakeCutter{"L" if y > 0 else "R"}', cut, M['inlet'], sub=0, parent=root, loc=(cx + 0.05, y, cz), rot=(0, math.pi / 2, 0))
        cutter.display_type = 'WIRE'; cutter.hide_render = True
        fus = bpy.data.objects['Fuselage']
        bo = fus.modifiers.new(f'Intake{"L" if y > 0 else "R"}', 'BOOLEAN'); bo.operation = 'DIFFERENCE'; bo.object = cutter; bo.solver = 'EXACT'
        fus.modifiers.move(len(fus.modifiers) - 1, 0)
        rod('Exhaust', (1.0, y * 0.8, -0.30), (1.12, y * 0.85, -0.46), 0.028, 0.028, M['exhaust'], root)

    # ---------- prop + spinner (spin about X) ----------
    prop = hinge('Prop', root, (0.04, 0, -0.04), (0, 0, 0), 'X', -1e9, 1e9, 'spins about X; ~2,400 rpm at cruise (animate 40 rad/s for a soft blur)')
    sp_rings = []
    for i in range(1, 17):
        u = i / 16; r = 0.165 * (1 - (1 - u) ** 2.4)                                  # pointed ogive, flush with the cowl lip
        sp_rings.append([(-0.40 + 0.60 * u, r * math.cos(2 * math.pi * j / 48), r * math.sin(2 * math.pi * j / 48)) for j in range(48)])
    new_obj('Spinner', loft(sp_rings, cap_start=True, cap_end=True), M['accent'], parent=prop, loc=(-0.0, 0, 0), sub=1)
    for sgn in (1, -1):
        blade = []
        for i in range(13):                                             # tapered, slightly twisted blade
            r = 0.13 + (0.915 - 0.13) * i / 12; c = 0.15 - 0.06 * (i / 12) ** 1.3; tw = 0.55 - 0.4 * i / 12
            sec = []
            for (u, z) in loop(0, 1, 0.12, 8):
                lx, ly = (u - 0.4) * c, z * c
                sec.append((lx * math.cos(tw) - ly * math.sin(tw), (lx * math.sin(tw) + ly * math.cos(tw)) * sgn, sgn * r))
            blade.append(sec)
        new_obj('Blade', loft(blade, cap_start=True, cap_end=True), M['interior'], parent=prop, loc=(0, 0, 0))

    # ---------- wing: fixed core + flap + aileron per side + rounded tips, 3.5° dihedral ----------
    XLE, CH, HALF, F = 1.30, 1.47, 3.81, 0.76                          # LE station, chord, half span, hinge at 76 % chord
    Z0 = -0.29
    zc = lambda y: Z0 + abs(y) * math.tan(DIH)
    FLAP = (0.60, 2.08); AIL = (2.13, 3.42); TIP = 3.44

    def wing_ring(y, u0, u1, k=1.0, t=0.13, n=30):
        # k < 1 rounds the tip: chord shrinks from both ends, thickness follows
        c = CH * k; xle = XLE + (CH - c) * 0.45
        return [(xle + u * c, y, zc(y) + z * c) for (u, z) in loop(u0, u1, t * (0.55 + 0.45 * k), n)]
    for sgn, side in ((1, 'L'), (-1, 'R')):
        ys = [sgn * (TIP * i / 40) for i in range(41)]
        new_obj(f'Wing_{side}', loft([wing_ring(y, 0, F) for y in ys], cap_end=False), M['trim'], parent=root, sub=1)
        tip_rings = []
        for i in range(13):
            y = sgn * (TIP + (HALF - TIP) * i / 12); q = i / 12
            tip_rings.append(wing_ring(y, 0, 1, k=max(0.08, math.sqrt(max(0.0, 1 - q ** 2.2)))))
        new_obj(f'WingTip_{side}', loft(tip_rings, cap_end=True), M['body'], parent=root, sub=1)
        # control surfaces, built in hinge space: local X aft, local Y spanwise (outboard = sgn), local Z up
        for (y0, y1), kind, lim in ((FLAP, 'Flap', (0, 40)), (AIL, 'Aileron', (-20, 25))):
            ym = sgn * (y0 + y1) / 2
            hx = XLE + F * CH; hz = zc(ym) + af(F, 0.135)[2] * CH
            h = hinge(f'{kind}_{side}', root, (hx, ym, hz), (sgn * DIH, 0, 0), 'Y', -lim[1] if kind == 'Aileron' else -lim[1], lim[0] if kind == 'Flap' else lim[1],
                      f'{kind.lower()} {side}: rotate about local Y; + = trailing edge up' + ('; flaps deflect down (negative), 0..-40' if kind == 'Flap' else ''))
            rings_cs = []
            for i in range(9):
                ys_ = sgn * (y0 + 0.004 + (y1 - y0 - 0.008) * i / 8)
                rings_cs.append([((u - F) * CH, (ys_ - ym) / math.cos(DIH), (z - af(F, 0.135)[2]) * CH) for (u, z) in loop(F + 0.012, 1, 0.13, 16)])
            new_obj(f'{kind}Panel_{side}', loft(rings_cs, cap_start=True, cap_end=True), M['trim'], parent=h, sub=1)
        # nav light (left red, right green), landing light, fuel cap
        new_obj(f'NavLight_{side}', prim('sphere', r=0.035, u=16, v=8), M['red'] if sgn > 0 else M['green'], sub=1, parent=root, loc=(XLE + 0.18, sgn * (HALF - 0.03), zc(HALF)))
        new_obj(f'LandingLight_{side}', prim('sphere', r=1, u=16, v=8, scale=(0.02, 0.09, 0.04)), M['lens'], sub=1, parent=root, loc=(XLE + 0.01, sgn * 3.05, zc(3.05) + 0.01))
        new_obj(f'FuelCap_{side}', prim('cyl', r1=0.045, d=0.01, seg=24), M['steel'], sub=0, parent=root, loc=(XLE + 0.32, sgn * 1.55, zc(1.55) + 0.095))
    # pitot tube under the left wing
    rod('PitotMast', (XLE + 0.35, 2.55, zc(2.55) - 0.06), (XLE + 0.30, 2.55, zc(2.55) - 0.2), 0.012, 0.01, M['steel'], root)
    rod('PitotTube', (XLE + 0.31, 2.55, zc(2.55) - 0.2), (XLE - 0.12, 2.55, zc(2.55) - 0.2), 0.011, 0.011, M['steel'], root)

    # ---------- horizontal tail: stabiliser + two elevator halves on one hinge + trim tab ----------
    SX, SC, SH, SF, SZ = 5.30, 0.88, 1.25, 0.58, 0.215
    def stab_ring(y, u0, u1, k=1.0, local=None):
        c = SC * k; xle = SX + (SC - c) * 0.5
        pts = [(xle + u * c, y, SZ + z * c) for (u, z) in loop(u0, u1, 0.10, 24, camber=0.0)]
        if local: pts = [(px - local[0], py - local[1], pz - local[2]) for px, py, pz in pts]
        return pts
    elev = hinge('Elevator', root, (SX + SF * SC, 0, SZ), (0, 0, 0), 'Y', -25, 20, 'elevator: + = trailing edge up (stick back)')
    for sgn, side in ((1, 'L'), (-1, 'R')):
        ys = [sgn * (SH * i / 20) for i in range(21)]
        ks = [math.sqrt(max(0.06, 1 - max(0, (abs(y) - (SH - 0.2)) / 0.2) ** 2)) for y in ys]
        new_obj(f'HStab_{side}', loft([stab_ring(y, 0, SF, k) for y, k in zip(ys, ks)], cap_end=True), M['trim'], parent=root, sub=1)
        ys2 = [sgn * (0.07 + (SH - 0.07) * i / 18) for i in range(19)]
        ks2 = [math.sqrt(max(0.06, 1 - max(0, (abs(y) - (SH - 0.2)) / 0.2) ** 2)) for y in ys2]
        new_obj(f'ElevatorPanel_{side}', loft([stab_ring(y, SF + 0.015, 1, k, local=(SX + SF * SC, 0, SZ)) for y, k in zip(ys2, ks2)], cap_start=True, cap_end=True), M['trim'], parent=elev, sub=1)
    trim = hinge('TrimTab', elev, (SC * (0.88 - SF), 0.5, 0), (0, 0, 0), 'Y', -15, 15, 'elevator trim tab (left elevator), + = tab trailing edge up')
    new_obj('TrimTabPanel', loft([[(px - (SX + 0.88 * SC), py - 0.5, pz - SZ) for px, py, pz in stab_ring(y, 0.885, 1)] for y in (0.32 + 0.36 * i / 4 for i in range(5))], cap_start=True, cap_end=True), M['trim'], parent=trim)

    # ---------- vertical tail: swept fin + the RV's big rounded rudder with a balance horn ----------
    HX = 5.86
    fin_rings = []
    for i in range(20):
        z = 0.30 + (1.30 - 0.30) * i / 19
        le = 4.92 + (z - 0.30) * 0.70
        c = (HX - le) / 0.985
        fin_rings.append([(le + u * c, zz * c * 0.85, z) for (u, zz) in loop(0, 0.985, 0.095, 24, camber=0.0)])
    new_obj('Fin', loft(fin_rings, cap_end=True), fin_material(), parent=root, sub=1)
    rud = hinge('Rudder', root, (HX, 0, 0.12), (0, 0, 0), 'Z', -30, 30, 'rudder: rotate about local Z; + = trailing edge left (+Y)')
    rud_rings = []
    for i in range(26):
        z = 0.10 + (1.42 - 0.10) * i / 25
        aft = (0.36 + 0.06 * (z - 0.1)) * (1 if z < 1.34 else math.sqrt(max(0.05, 1 - ((z - 1.34) / 0.08) ** 2)))
        fwd = 0.0 if z < 1.31 else 0.15 * min(1, (z - 1.31) / 0.03) * (1 if z < 1.38 else math.sqrt(max(0.05, 1 - ((z - 1.38) / 0.04) ** 2)))
        c = aft + fwd + 0.02
        rud_rings.append([(-fwd + u * c, zz * c * 0.8, z - 0.12) for (u, zz) in loop(0, 1, 0.11 if fwd > 0 else 0.085, 24, camber=0.0)])
    new_obj('RudderPanel', loft(rud_rings, cap_start=True, cap_end=True), fin_material(HX, 0.12), parent=rud, sub=1)
    new_obj('Strobe', prim('sphere', r=0.03, u=16, v=8), M['white'], sub=1, parent=rud, loc=(0.40, 0, 0.62))
    rod('Antenna', (3.75, 0, 0.62), (3.95, 0, 0.92), 0.012, 0.006, M['interior'], root)

    # ---------- landing gear: tapered spring legs with fairings, teardrop wheel pants, steerable tailwheel ----------
    WX, WY, WZ, WR = 1.08, 0.97, -1.03, 0.17
    for sgn, side in ((1, 'L'), (-1, 'R')):
        rod(f'GearLeg_{side}', (1.28, sgn * 0.40, -0.34), (WX + 0.02, sgn * (WY - 0.1), WZ + 0.12), 0.05, 0.034, M['trim'], root)
        pant = prim('sphere', r=1, u=64, v=32)
        for v in pant.verts:
            aft = max(0.0, v.co.x); taper = 1 - 0.62 * aft ** 1.4                       # tapers to a narrow, rounded tail
            v.co.x *= 0.27 if v.co.x < 0 else 0.68
            v.co.y *= 0.105 * (taper if v.co.x > 0 else 1); v.co.z *= 0.155 * (taper if v.co.x > 0 else 1)
        new_obj(f'WheelPant_{side}', pant, M['trim'], sub=1, parent=root, loc=(WX + 0.05, sgn * WY, WZ + 0.03))
        new_obj(f'Tire_{side}', prim('cyl', r1=WR, d=0.11, seg=32), M['rubber'], sub=1, parent=root, loc=(WX, sgn * WY, WZ), rot=(math.pi / 2, 0, 0))
    # 3-point attitude ≈ 11.5°: the tailwheel sits on the same ground line as the mains
    tw_x = 6.08; tw_ground = (WZ - WR) + (tw_x - WX) * math.tan(math.radians(11.5)); tw_r = 0.085
    rod('TailSpring', (5.80, 0, 0.14), (tw_x - 0.02, 0, tw_ground + tw_r + 0.06), 0.022, 0.018, M['steel'], root)
    tw = hinge('TailWheel', root, (tw_x - 0.02, 0, tw_ground + tw_r + 0.06), (0, 0, 0), 'Z', -30, 30, 'tailwheel steering, + = left; follows the rudder on the ground')
    rod('TailFork', (0, 0, 0), (0.03, 0, -0.06), 0.012, 0.012, M['steel'], tw)
    new_obj('TailTire', prim('cyl', r1=tw_r, d=0.05, seg=24), M['rubber'], sub=1, parent=tw, loc=(0.03, 0, -0.06), rot=(math.pi / 2, 0, 0))
    rig['ground_attitude_deg'] = 11.5
    rig['main_wheel_bottom_z'] = WZ - WR
    return sc, root, rig


# ================================================================ poses
def pose(name):
    def rot(obj, axis, deg):
        o = bpy.data.objects[obj]; e = Euler((0, 0, 0)); setattr(e, axis.lower(), math.radians(deg))
        base = o.rotation_euler.copy(); o.rotation_euler = (base.to_matrix() @ e.to_matrix()).to_euler()
    if name == 'controls':          # stick left + back, right rudder, flaps 20°
        rot('Aileron_L', 'Y', 18); rot('Aileron_R', 'Y', -14); rot('Elevator', 'Y', 14); rot('Rudder', 'Z', -18)
        rot('Flap_L', 'Y', -20); rot('Flap_R', 'Y', -20); rot('TrimTab', 'Y', -8)
    if name == 'ground':
        r = bpy.data.objects['RV7']; r.rotation_euler = (0, math.radians(-11.5), 0)


# ================================================================ preview renders
def setup_render(sc, res=(1080, 1350)):
    r = sc.render; r.engine = 'CYCLES'
    sc.cycles.samples = int(os.environ.get('SAMPLES', 48)); sc.cycles.use_denoising = True
    r.resolution_x, r.resolution_y = res; r.resolution_percentage = int(os.environ.get('PCT', 50))
    vt = [i.identifier for i in sc.view_settings.bl_rna.properties['view_transform'].enum_items]
    sc.view_settings.view_transform = 'AgX' if 'AgX' in vt else 'Filmic'
    looks = [i.identifier for i in sc.view_settings.bl_rna.properties['look'].enum_items]
    sc.view_settings.look = next((l for l in looks if 'Medium High Contrast' in l), next((l for l in looks if 'Punchy' in l), 'None'))


def area(sc, name, energy, color, loc, size, target=(3, 0, 0)):
    L = bpy.data.lights.new(name, 'AREA'); L.energy = energy; L.color = color; L.size = size
    o = bpy.data.objects.new(name, L); sc.collection.objects.link(o); o.location = loc
    o.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    return o


def camera(sc, loc, look, lens=70):
    cam = sc.camera
    if cam is None:
        cam = bpy.data.objects.new('Cam', bpy.data.cameras.new('Cam')); sc.collection.objects.link(cam); sc.camera = cam
    cam.data.lens = lens; cam.location = loc
    cam.rotation_euler = (Vector(look) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()


def studio(sc):
    """Soft studio: a pale gradient world, gentle big lights and a shadow-catcher floor. Judge the airplane itself."""
    w = bpy.data.worlds.new('Studio'); sc.world = w; w.use_nodes = True; nt = w.node_tree; bg = nt.nodes['Background']
    tc = nt.nodes.new('ShaderNodeTexCoord'); sep = nt.nodes.new('ShaderNodeSeparateXYZ'); nt.links.new(tc.outputs['Generated'], sep.inputs[0])
    ramp = nt.nodes.new('ShaderNodeValToRGB'); el = ramp.color_ramp.elements
    el[0].position, el[0].color = 0.35, lin('#DCE3EA'); el[1].position, el[1].color = 0.9, lin('#9FB6CF')
    nt.links.new(sep.outputs['Z'], ramp.inputs['Fac']); nt.links.new(ramp.outputs['Color'], bg.inputs['Color']); bg.inputs['Strength'].default_value = 0.55
    bm = bmesh.new(); bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=60)
    floor = new_obj('Floor', bm, material('Floor', '#E4E9EE', rough=0.9), sub=0, loc=(3, 0, -1.25))
    floor.is_shadow_catcher = True
    area(sc, 'Key', 650, (1.0, 0.94, 0.86), (-6, 9, 7), 7)
    area(sc, 'Fill', 260, (0.84, 0.9, 1.0), (-7, -8, 3), 9)
    area(sc, 'Rim', 520, (1.0, 0.92, 0.82), (12, 6, 5), 6)
    area(sc, 'Top', 220, (1.0, 1.0, 1.0), (3, 0, 10), 12)
    for i, (loc, e) in enumerate((((-2, 6, 6), 380), ((6, 7, 7), 300), ((2, -7, 6), 260))):
        st = area(sc, f'Strip{i}', e, (1, 1, 1), loc, 1); st.data.shape = 'RECTANGLE'; st.data.size, st.data.size_y = 9, 0.35


def sky(sc):
    """Art-directed golden hour: warm gradient sky, warm key + cool fill, patchwork ground in haze."""
    w = bpy.data.worlds.new('Sky'); sc.world = w; w.use_nodes = True; nt = w.node_tree; bg = nt.nodes['Background']
    tc = nt.nodes.new('ShaderNodeTexCoord'); sep = nt.nodes.new('ShaderNodeSeparateXYZ'); nt.links.new(tc.outputs['Generated'], sep.inputs[0])
    ramp = nt.nodes.new('ShaderNodeValToRGB'); el = ramp.color_ramp.elements
    el[0].position, el[0].color = 0.0, lin('#B88A72'); el[1].position, el[1].color = 1.0, lin('#3C63A8')
    el[0].color = lin('#B9C6D6'); el[1].color = lin('#4F7DC0')
    for pos, col in ((0.5, '#F1E6DA'), (0.52, '#D9E3EE'), (0.58, '#A9C2E2'), (0.7, '#7DA2D4')):
        e = el.new(pos); e.color = lin(col)
    mr = nt.nodes.new('ShaderNodeMapRange'); mr.inputs['From Min'].default_value = -1; mr.inputs['From Max'].default_value = 1
    nt.links.new(sep.outputs['Z'], mr.inputs['Value']); nt.links.new(mr.outputs['Result'], ramp.inputs['Fac'])
    # soft streaky cloud layer mixed over the gradient
    nz_ = nt.nodes.new('ShaderNodeTexNoise'); nz_.inputs['Scale'].default_value = 2.2; nz_.inputs['Detail'].default_value = 6
    mp = nt.nodes.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (1.0, 2.6, 6.0); nt.links.new(tc.outputs['Generated'], mp.inputs['Vector']); nt.links.new(mp.outputs['Vector'], nz_.inputs['Vector'])
    cr_ = nt.nodes.new('ShaderNodeMapRange'); cr_.inputs['From Min'].default_value = 0.5; cr_.inputs['From Max'].default_value = 0.72
    nt.links.new(nz_.outputs['Fac'], cr_.inputs['Value'])
    hm = nt.nodes.new('ShaderNodeMapRange'); hm.inputs['From Min'].default_value = 0.02; hm.inputs['From Max'].default_value = 0.35; hm.inputs['To Min'].default_value = 0.9; hm.inputs['To Max'].default_value = 0.0
    nt.links.new(sep.outputs['Z'], hm.inputs['Value'])
    cm = nt.nodes.new('ShaderNodeMath'); cm.operation = 'MULTIPLY'; nt.links.new(cr_.outputs['Result'], cm.inputs[0]); nt.links.new(hm.outputs['Result'], cm.inputs[1])
    mx = nt.nodes.new('ShaderNodeMix'); mx.data_type = 'RGBA'; nt.links.new(cm.outputs[0], mx.inputs['Factor']); nt.links.new(ramp.outputs['Color'], mx.inputs[6]); mx.inputs[7].default_value = lin('#F4F1EC')
    nt.links.new(mx.outputs[2], bg.inputs['Color']); bg.inputs['Strength'].default_value = 1.0
    for name, energy, col, d in (('Sun', 4.2, (1.0, 0.80, 0.60), (-0.55, 1.0, 0.32)), ('SkyFill', 0.9, (0.74, 0.84, 1.0), (0.6, -0.4, 0.9)), ('Rim', 2.4, (1.0, 0.78, 0.55), (0.9, -0.6, 0.25))):
        L = bpy.data.lights.new(name, 'SUN'); L.energy = energy; L.color = col; L.angle = math.radians(3)
        o = bpy.data.objects.new(name, L); sc.collection.objects.link(o); o.rotation_euler = (-Vector(d)).to_track_quat('-Z', 'Y').to_euler()
    bm = bmesh.new(); bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=12000)
    gnd = new_obj('Ground', bm, [], sub=0, loc=(0, 0, -160)); gnd.hide_render = '--ground' not in ARGS   # air-to-air: sky only
    gm = bpy.data.materials.new('Fields'); gm.use_nodes = True; N, Lk = gm.node_tree.nodes, gm.node_tree.links
    bsdf = N['Principled BSDF']; bsdf.inputs['Roughness'].default_value = 0.95
    tcc = N.new('ShaderNodeTexCoord'); vor = N.new('ShaderNodeTexVoronoi'); vor.inputs['Scale'].default_value = 0.03
    Lk.new(tcc.outputs['Object'], vor.inputs['Vector'])
    fr = N.new('ShaderNodeValToRGB'); e2 = fr.color_ramp.elements; fr.color_ramp.interpolation = 'CONSTANT'
    e2[0].color = lin('#6E9B4A'); e2[1].position, e2[1].color = 0.85, lin('#4E7E3E')
    for pos, col in ((0.2, '#A3B45E'), (0.38, '#D2B66A'), (0.55, '#88A851'), (0.7, '#B9A15C')):
        e = e2.new(pos); e.color = lin(col)
    Lk.new(vor.outputs['Color'] if 'Color' in vor.outputs else vor.outputs[1], fr.inputs['Fac'])
    cd = N.new('ShaderNodeCameraData'); mr2 = N.new('ShaderNodeMapRange'); mr2.inputs['From Min'].default_value = 250; mr2.inputs['From Max'].default_value = 5000
    Lk.new(cd.outputs['View Distance'], mr2.inputs['Value'])
    mix = N.new('ShaderNodeMix'); mix.data_type = 'RGBA'
    Lk.new(mr2.outputs['Result'], mix.inputs['Factor']); Lk.new(fr.outputs['Color'], mix.inputs[6]); mix.inputs[7].default_value = lin('#E3B892')
    Lk.new(mix.outputs[2], bsdf.inputs['Base Color']); gnd.data.materials.append(gm)


STUDIO_SHOTS = {
    'studio_head_on': ((-4.2, 0.6, 0.25), (0.2, 0, -0.02)),
    'studio_nose': ((-3.4, 2.0, 0.35), (0.3, 0, 0.0)),
    'studio_close': ((-4.8, 4.2, 1.1), (1.2, 0, 0.1)),
    'studio_front34': ((-9.5, 10.5, 3.2), (2.9, 0, -0.1)),
    'studio_side': ((2.9, 17.0, 0.4), (2.9, 0, -0.05)),
    'studio_rear34': ((13.5, -10.0, 4.2), (3.0, 0, 0.0)),
    'studio_top': ((3.0, 0.01, 16.0), (3.0, 0, 0)),
    'studio_low': ((-7.5, 7.5, -0.95), (2.6, 0, 0.25)),
}
SKY_SHOTS = {'beauty': ((-9.0, 7.4, -1.7), (2.4, 0.9, 0.35))}


def render(sc, name, loc, look, lens=70):
    camera(sc, loc, look, lens)
    sc.render.filepath = os.path.join(OUT, f'rv7_{name}{TAG}.png')
    bpy.ops.render.render(write_still=True)
    print('render →', sc.render.filepath)


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    sc, root, rig = build()
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, 'rv7.blend'))
    json.dump(rig, open(os.path.join(OUT, 'rv7_rig.json'), 'w'), indent=1)
    try:
        [setattr(o, 'hide_viewport', True) for o in bpy.data.objects if o.name.startswith('IntakeCutter')]
        bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, 'rv7.glb'), export_apply=True, export_yup=True, use_visible=True)
    except Exception as e:
        print('glb export skipped:', e)
    if arg('pose'): pose(arg('pose'))
    if '--preview' in ARGS:
        shots = arg('shot')
        setup_render(sc)
        if not shots or shots.startswith('studio'):
            studio(sc)
            for k, (loc, look) in STUDIO_SHOTS.items():
                if not shots or shots == k or shots == 'studio': render(sc, k, loc, look, 85 if k != 'studio_top' else 50)
        if shots in ('beauty', None):
            for o in [o for o in bpy.data.objects if o.name in ('Key', 'Fill', 'Rim', 'Top', 'Floor') or o.name.startswith('Strip')]: bpy.data.objects.remove(o)
            sky(sc)
            setup_render(sc, (1080, 1920))
            for k, (loc, look) in SKY_SHOTS.items(): render(sc, k, loc, look, 70)
