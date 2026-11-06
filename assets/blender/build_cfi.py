"""build_cfi.py — the show's CFI: a lovable, late-40s flight instructor. Stylised (Pixar-short shape language), made for adults.

    python3 assets/blender/build_cfi.py --preview          (or: blender -b -P assets/blender/build_cfi.py -- --preview)

Writes assets/models/cfi.blend, cfi.glb and cfi_preview_*.png.
Design: square, kind jaw; big warm eyes with laugh lines; salt-and-pepper hair and a short beard; aviators pushed up;
headset around the neck; a worn brown leather jacket over a tee. Units: metres-ish (head ≈ 0.25 tall). Facing −Y, up +Z.
"""
import math, os, sys
import bpy, bmesh
from mathutils import Vector, Matrix, noise

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'assets', 'models')
ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]

SKIN, HAIR, BEARD, JACKET, TEE = '#E0A884', '#8C8C8E', '#6F6A68', '#7A4A2E', '#E9E4DA'


def lin(h):
    h = h.lstrip('#'); c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return [(v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4) for v in c] + [1]


def mat(name, color, rough=0.5, sss=0.0, metallic=0.0, coat=0.0, transmission=0.0, ior=1.45, sheen=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True; b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = lin(color) if isinstance(color, str) else color
    b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metallic
    for k, v in (('Subsurface Weight', sss), ('Coat Weight', coat), ('Transmission Weight', transmission), ('IOR', ior), ('Sheen Weight', sheen)):
        if k in b.inputs: b.inputs[k].default_value = v
    if sss and 'Subsurface Radius' in b.inputs:
        b.inputs['Subsurface Radius'].default_value = (1.0, 0.45, 0.25)
    if sss and 'Subsurface Scale' in b.inputs:
        b.inputs['Subsurface Scale'].default_value = 0.012
    return m


def obj(name, bm, m, sub=2, smooth=True, parent=None, loc=None, rot=None, scale=None):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(o)
    if isinstance(m, (list, tuple)):
        for mm in m: me.materials.append(mm)
    else: me.materials.append(m)
    if smooth:
        for p in me.polygons: p.use_smooth = True
    if sub:
        md = o.modifiers.new('S', 'SUBSURF'); md.levels = 1; md.render_levels = sub
    if parent: o.parent = parent
    if loc: o.location = loc
    if rot: o.rotation_euler = rot
    if scale: o.scale = scale
    return o


def sphere(r=1, u=48, v=32):
    bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=u, v_segments=v, radius=r); return bm


def deform(bm, f):
    for vt in bm.verts:
        vt.co = f(vt.co.copy())
    return bm


def head_shape(p):
    """A sphere → a kind, square-jawed head. +Z up, −Y forward (face)."""
    x, y, z = p.x, p.y, p.z
    # overall proportions: a bit taller than wide, flatter at the sides
    x *= 0.86; z *= 1.1; y *= 0.95
    # square jaw: widen and flatten the lower third
    if z < 0:
        k = min(1, -z / 1.1)
        x *= 1 + 0.16 * k - 0.30 * k ** 3
        y *= 1 - 0.10 * k
        z = z * (1 - 0.12 * k)
    # chin: push the bottom-front forward a little
    if z < -0.6 and y < 0:
        y -= 0.10 * (-(z + 0.6) / 0.5) * min(1, -y)
    # brow ridge
    if 0.15 < z < 0.45 and y < -0.6:
        y -= 0.04
    # flatten the back of the head slightly
    if y > 0.5: y = 0.5 + (y - 0.5) * 0.8
    return Vector((x, y, z))


def build():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    skin = mat('Skin', SKIN, rough=0.48, sss=0.25)
    skin_dark = mat('Lips', '#B9715E', rough=0.45, sss=0.2)
    hair = mat('Hair', HAIR, rough=0.62, sheen=0.4)
    beard = mat('Beard', BEARD, rough=0.75, sheen=0.3)
    white = mat('EyeWhite', '#F4F1EC', rough=0.25, sss=0.1)
    iris = mat('Iris', '#5B7FA3', rough=0.3)
    pupil = mat('Pupil', '#0E1016', rough=0.2)
    cornea = mat('Cornea', (1, 1, 1, 1), rough=0.0, transmission=1.0, ior=1.33)
    brow = mat('Brow', '#5E5A58', rough=0.7)
    jacket = mat('Leather', JACKET, rough=0.55, coat=0.15)
    collar = mat('Shearling', '#E6D9C3', rough=0.95, sheen=0.6)
    tee = mat('Tee', TEE, rough=0.85)
    gold = mat('Gold', '#C9A45A', metallic=1.0, rough=0.25)
    lens = mat('Lens', '#3B5A4A', rough=0.05, metallic=0.3, coat=1.0)
    headset = mat('Headset', '#2E3138', rough=0.45)
    pad = mat('EarPad', '#1E2024', rough=0.7)

    root = bpy.data.objects.new('CFI', None); sc.collection.objects.link(root)
    H = 0.125                                            # head radius
    head = obj('Head', deform(sphere(1, 64, 48), head_shape), skin, parent=root, loc=(0, 0, 1.62), scale=(H, H, H))

    def on_head(x, y, z):                                # head-local unit coords → world
        return Vector((x * H, y * H, 1.62 + z * H))

    # ears
    for s in (1, -1):
        bm = sphere(1, 24, 16); bm = deform(bm, lambda p: Vector((p.x * 0.18, p.y * 0.42, p.z * 0.62)))
        obj('Ear', bm, skin, parent=root, loc=on_head(s * 0.86, 0.08, 0.02), rot=(0, 0, s * 0.35), scale=(H, H, H))
    # nose: a soft, friendly bulb + bridge
    bm = sphere(1, 32, 24); bm = deform(bm, lambda p: Vector((p.x * 0.24, p.y * 0.22, p.z * 0.2)))
    obj('NoseTip', bm, skin, parent=root, loc=on_head(0, -1.02, -0.12), scale=(H, H, H))
    bm = sphere(1, 24, 16); bm = deform(bm, lambda p: Vector((p.x * 0.13, p.y * 0.16, p.z * 0.38)))
    obj('NoseBridge', bm, skin, parent=root, loc=on_head(0, -0.93, 0.12), rot=(0.25, 0, 0), scale=(H, H, H))
    # cheeks (a smile pushes them up)
    for s in (1, -1):
        bm = sphere(1, 24, 16); bm = deform(bm, lambda p: Vector((p.x * 0.3, p.y * 0.22, p.z * 0.22)))
        obj('Cheek', bm, skin, parent=root, loc=on_head(s * 0.42, -0.78, -0.22), scale=(H, H, H))
    # eyes: big, warm, with lids that sit a little low (a calm, kind look) and laugh lines
    for s in (1, -1):
        ex, ey, ez = s * 0.36, -0.76, 0.16
        er = 0.2
        obj('EyeWhite', sphere(er, 32, 24), white, parent=root, loc=on_head(ex, ey, ez), scale=(H, H, H))
        bm = sphere(1, 32, 16); bm = deform(bm, lambda p: Vector((p.x * er * 0.62, p.y * 0.05, p.z * er * 0.62)))
        obj('Iris', bm, iris, parent=root, loc=on_head(ex - s * 0.02, ey - er * 0.92, ez - 0.01), scale=(H, H, H))
        bm = sphere(1, 24, 12); bm = deform(bm, lambda p: Vector((p.x * er * 0.3, p.y * 0.05, p.z * er * 0.3)))
        obj('Pupil', bm, pupil, parent=root, loc=on_head(ex - s * 0.02, ey - er * 0.97, ez - 0.01), scale=(H, H, H))
        obj('Cornea', sphere(er * 1.03, 32, 24), cornea, parent=root, loc=on_head(ex, ey, ez), scale=(H, H, H))
        # upper lid (relaxed, covers the top third) + lower lid
        for up, cover in ((1, 0.32), (-1, 0.12)):
            bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=32, v_segments=16, radius=er * 1.1)
            geom = [v for v in bm.verts if v.co.z * up < er * 1.1 * (1 - 2 * cover) - er * 0.05]
            bmesh.ops.delete(bm, geom=geom, context='VERTS')
            obj('Lid', bm, skin, parent=root, loc=on_head(ex, ey + 0.01, ez), rot=(up * -0.18, 0, s * up * 0.08), scale=(H, H, H))
        # brow: thick, soft, gently raised in the middle (warm, open)
        pts = [Vector((ex + s * (0.2 - 0.2 * i / 6) * 1.0 - s * 0.02, ey - 0.12 + 0.02 * math.sin(math.pi * i / 6), ez + 0.27 + 0.05 * math.sin(math.pi * i / 6) - 0.02 * (i / 6))) for i in range(7)]
        for i, pnt in enumerate(pts):
            r = 0.055 * (1 - 0.4 * abs(i - 2) / 4)
            obj('Brow', sphere(r, 16, 12), brow, parent=root, loc=on_head(*pnt), scale=(H * 1.4, H, H * 0.7), sub=1)
        # laugh lines: two tiny creases at the outer corner
        for k in (0, 1):
            bm = sphere(1, 12, 8); bm = deform(bm, lambda p: Vector((p.x * 0.012, p.y * 0.01, p.z * 0.07)))
            obj('Crease', bm, skin_dark, parent=root, loc=on_head(ex + s * 0.25, ey + 0.08, ez - 0.04 - k * 0.08), rot=(0, s * (0.5 + k * 0.4), 0), scale=(H, H, H), sub=1)
    # mouth: a warm, slightly lopsided smile (a curved crease + lower lip)
    smile = []
    for i in range(13):
        u = i / 12 - 0.5
        smile.append(Vector((u * 0.62, -0.93 + 0.12 * u * u, -0.5 + 0.30 * u * u + 0.03 * u)))
    for i, pnt in enumerate(smile):
        obj('Smile', sphere(0.032 if 2 < i < 10 else 0.024, 12, 8), mat('MouthLine', '#5A2C28', rough=0.6), parent=root, loc=on_head(*pnt), scale=(H, H, H), sub=1)
    bm = sphere(1, 24, 12); bm = deform(bm, lambda p: Vector((p.x * 0.24, p.y * 0.08, p.z * 0.06)))
    obj('LowerLip', bm, skin_dark, parent=root, loc=on_head(0.01, -0.9, -0.6), scale=(H, H, H))
    # short beard: a shell over the jaw and upper lip, slightly larger than the head
    def beard_shape(p):
        q = head_shape(p) * 1.035
        return q
    bm = deform(sphere(1, 64, 48), beard_shape)
    keep_out = [v for v in bm.verts if not ((v.co.z < -0.25 and v.co.y < 0.55) or (v.co.z < -0.3))]
    bmesh.ops.delete(bm, geom=keep_out, context='VERTS')
    # clear the mouth opening area
    mouth = [v for v in bm.verts if abs(v.co.x) < 0.33 and -0.7 < v.co.z < -0.34 and v.co.y < -0.6]
    bmesh.ops.delete(bm, geom=mouth, context='VERTS')
    obj('Beard', bm, beard, parent=root, loc=(0, 0, 1.62), scale=(H, H, H))
    # moustache
    bm = sphere(1, 32, 12); bm = deform(bm, lambda p: Vector((p.x * 0.34, p.y * 0.1, p.z * 0.08 - 0.06 * p.x * p.x)))
    obj('Moustache', bm, beard, parent=root, loc=on_head(0, -0.98, -0.32), scale=(H, H, H))
    # hair: short, tidy, salt-and-pepper, with a little lift at the front
    def hair_shape(p):
        q = head_shape(p) * 1.07
        if q.z > 0.4 and q.y < -0.2: q.z += 0.12 * (q.z - 0.4) + 0.04
        q += Vector((0, 0, 0.03 * noise.noise(p * 3.0)))
        return q
    bm = deform(sphere(1, 64, 48), hair_shape)
    cut = [v for v in bm.verts if (v.co.z < 0.2 and v.co.y < 0.2) or v.co.z < -0.35 or (v.co.y < -0.62 and v.co.z < 0.62)]
    bmesh.ops.delete(bm, geom=cut, context='VERTS')
    obj('Hair', bm, hair, parent=root, loc=(0, 0, 1.62), scale=(H, H, H))
    # aviators pushed up on the hair
    for s in (1, -1):
        bm = sphere(1, 32, 12); bm = deform(bm, lambda p: Vector((p.x * 0.26, p.y * 0.04, p.z * 0.2 - 0.05 * max(0, -p.z) - 0.04 * p.x * s)))
        obj('Lens', bm, lens, parent=root, loc=on_head(s * 0.3, -0.62, 0.92), rot=(-0.9, 0, 0), scale=(H, H, H))
        bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=False, segments=32, radius1=0.27, radius2=0.27, depth=0.03)
        obj('Frame', bm, gold, parent=root, loc=on_head(s * 0.3, -0.64, 0.92), rot=(-0.9 + math.pi / 2, 0, 0), scale=(H * 0.98, H * 0.78, H), sub=1)
    # neck, tee, jacket with a shearling collar
    bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=32, radius1=0.062, radius2=0.058, depth=0.16)
    obj('Neck', bm, skin, parent=root, loc=(0, 0.01, 1.47))
    bm = deform(sphere(1, 48, 32), lambda p: Vector((p.x * 0.26, p.y * 0.15, p.z * 0.25)))
    obj('Torso', bm, jacket, parent=root, loc=(0, 0.02, 1.2))
    bm = deform(sphere(1, 32, 16), lambda p: Vector((p.x * 0.09, p.y * 0.04, p.z * 0.1)))
    obj('TeeV', bm, tee, parent=root, loc=(0, -0.125, 1.36))
    bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=False, segments=48, radius1=0.12, radius2=0.085, depth=0.07)
    obj('Collar', bm, collar, parent=root, loc=(0, 0.0, 1.39), rot=(0.18, 0, 0))
    for s in (1, -1):
        bm = deform(sphere(1, 32, 24), lambda p: Vector((p.x * 0.09, p.y * 0.09, p.z * 0.1)))
        obj('Shoulder', bm, jacket, parent=root, loc=(s * 0.21, 0.02, 1.31))
    # headset resting around the neck
    bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=False, segments=48, radius1=0.11, radius2=0.11, depth=0.018)
    obj('HeadsetBand', bm, headset, parent=root, loc=(0, 0.02, 1.37), rot=(0.25, 0, 0))
    for s in (1, -1):
        bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=32, radius1=0.045, radius2=0.04, depth=0.035)
        obj('EarCup', bm, headset, parent=root, loc=(s * 0.11, -0.03, 1.355), rot=(0, s * 1.35, 0))
        bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=32, radius1=0.037, radius2=0.037, depth=0.02)
        obj('Pad', bm, pad, parent=root, loc=(s * 0.093, -0.03, 1.355), rot=(0, s * 1.35, 0))
    return sc, root


def preview(sc, root):
    w = bpy.data.worlds.new('Studio'); sc.world = w; w.use_nodes = True
    bg = w.node_tree.nodes['Background']; bg.inputs['Color'].default_value = lin('#9DB4CC'); bg.inputs['Strength'].default_value = 0.35
    def light(name, energy, color, loc, size):
        L = bpy.data.lights.new(name, 'AREA'); L.energy = energy; L.color = color; L.size = size
        o = bpy.data.objects.new(name, L); sc.collection.objects.link(o); o.location = loc
        o.rotation_euler = (Vector((0, 0, 1.6)) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    light('Key', 90, (1.0, 0.86, 0.72), (-0.9, -1.2, 2.1), 0.9)        # warm key, upper left
    light('Fill', 30, (0.75, 0.85, 1.0), (1.1, -1.0, 1.6), 1.2)       # cool fill
    light('Rim', 70, (1.0, 0.8, 0.6), (0.4, 1.2, 2.0), 0.5)           # warm rim from behind
    bm = bmesh.new(); bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=4)
    back = obj('Backdrop', bm, mat('Backdrop', '#A9BCD0', rough=1), sub=0, loc=(0, 1.2, 1.5), rot=(math.pi / 2, 0, 0))
    cam = bpy.data.objects.new('Cam', bpy.data.cameras.new('Cam')); sc.collection.objects.link(cam); sc.camera = cam
    cam.data.lens = 85
    r = sc.render; r.engine = 'CYCLES'; sc.cycles.samples = int(os.environ.get('SAMPLES', 64)); sc.cycles.use_denoising = True
    r.resolution_x, r.resolution_y, r.resolution_percentage = 1080, 1350, int(os.environ.get('PCT', 50))
    looks = [i.identifier for i in sc.view_settings.bl_rna.properties['look'].enum_items]
    sc.view_settings.look = next((l for l in looks if 'Medium High' in l or 'Punchy' in l), 'None')
    shots = {'front': ((0.0, -1.55, 1.58), (0, 0, 1.53)), 'three_quarter': ((-0.85, -1.3, 1.62), (0, 0, 1.54)), 'profile': ((-1.55, -0.05, 1.58), (0, 0, 1.54))}
    which = [a.split('=', 1)[1] for a in ARGS if a.startswith('--shot=')] or list(shots)
    for name in which:
        loc, look = shots[name]; cam.location = loc
        cam.rotation_euler = (Vector(look) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
        r.filepath = os.path.join(OUT, f'cfi_preview_{name}.png'); bpy.ops.render.render(write_still=True)
        print('preview →', r.filepath)


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    sc, root = build()
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, 'cfi.blend'))
    if '--preview' in ARGS:
        preview(sc, root)
