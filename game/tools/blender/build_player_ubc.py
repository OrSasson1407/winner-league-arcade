# Builds the arcade's 3D player (game/vendor/models/player.glb, before compression) in Blender, headless:
#   blender -b --factory-startup -P game/tools/blender/build_player_ubc.py -- <UBC folder> <UAL gltf> <out.glb>
# - the body, eyes and eyebrows: Quaternius's Universal Base Characters (CC0), Superhero_Male, Unreal skeleton
# - the hairstyles and the beard from the same pack, moved onto that skeleton's Head bone
# - the animations: Quaternius's Universal Animation Library (CC0), made on a different skeleton (Rigify "DEF-"
#   bones), retargeted here bone by bone: every frame each target bone gets its source bone's rotation relative to
#   the rest pose, so differences in bone orientation don't matter; the hips' movement is scaled to the new height.
import bpy, sys, os, shutil
from mathutils import Matrix, Quaternion, Vector

args = sys.argv[sys.argv.index("--") + 1:]
UBC, UAL, OUT = args[0], args[1], args[2]
BODY = os.path.join(UBC, "Base Characters", "Godot - UE", "Superhero_Male_FullBody.gltf")
HAIRS = os.path.join(UBC, "Hairstyles", "Rigged to Head Bone", "glTF (Godot -Unreal)")
KEEP = ["Idle_Loop", "Jog_Fwd_Loop", "Sprint_Loop", "Walk_Loop", "Jump_Start", "Jump_Loop", "Jump_Land", "Dance_Loop", "Spell_Simple_Shoot"]
HAIR_FILES = ["Hair_SimpleParted", "Hair_Buzzed", "Hair_Long", "Hair_Buns", "Hair_Beard"]

# the pack's glTF files ask for normal maps under a slightly different name: copy them there
tex = os.path.join(UBC, "Base Characters", "Textures")
for folder in (os.path.dirname(BODY), HAIRS):
    for n in ("T_Hair_1_Normal", "T_Hair_2_Normal", "T_Eye_Normal"):
        src, dst = os.path.join(tex, n + ".png"), os.path.join(folder, n + "_png.png")
        if os.path.exists(src) and not os.path.exists(dst): shutil.copy(src, dst)

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

def import_gltf(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    return [o for o in bpy.data.objects if o not in before]

src_objs = import_gltf(UAL)
src = next(o for o in src_objs if o.type == "ARMATURE")
tgt_objs = import_gltf(BODY)
tgt = next(o for o in tgt_objs if o.type == "ARMATURE")
for o in tgt_objs:
    if o.type == "MESH" and not o.data.materials: bpy.data.objects.remove(o) # stray helper spheres

# ---- bone map: Rigify DEF- names -> Unreal names
MAP = {"DEF-hips": "pelvis", "DEF-spine.001": "spine_01", "DEF-spine.002": "spine_02", "DEF-spine.003": "spine_03", "DEF-neck": "neck_01", "DEF-head": "Head"}
for s, t in (("L", "l"), ("R", "r")):
    MAP.update({f"DEF-shoulder.{s}": f"clavicle_{t}", f"DEF-upper_arm.{s}": f"upperarm_{t}", f"DEF-forearm.{s}": f"lowerarm_{t}", f"DEF-hand.{s}": f"hand_{t}",
                f"DEF-thigh.{s}": f"thigh_{t}", f"DEF-shin.{s}": f"calf_{t}", f"DEF-foot.{s}": f"foot_{t}", f"DEF-toe.{s}": f"ball_{t}"})
    for f in ("index", "middle", "ring", "pinky"):
        for i in (1, 2, 3): MAP[f"DEF-f_{f}.0{i}.{s}"] = f"{f}_0{i}_{t}"
    for i in (1, 2, 3): MAP[f"DEF-thumb.0{i}.{s}"] = f"thumb_0{i}_{t}"
MAP = {s: t for s, t in MAP.items() if s in src.data.bones and t in tgt.data.bones}
print("mapped bones:", len(MAP))

# target bones in hierarchy order (parents first)
order = []
def walk(b):
    order.append(b.name)
    for c in b.children: walk(c)
for b in tgt.data.bones:
    if b.parent is None: walk(b)
inv = {t: s for s, t in MAP.items()}
height_ratio = tgt.data.bones["pelvis"].head_local.z / src.data.bones["DEF-hips"].head_local.z

def rest_rot(arm, name): return arm.data.bones[name].matrix_local.to_quaternion()

src.animation_data_create(); tgt.animation_data_create()
for t in src.animation_data.nla_tracks: t.mute = True
for t in list(tgt.animation_data.nla_tracks): tgt.animation_data.nla_tracks.remove(t)
for pb in tgt.pose.bones: pb.rotation_mode = "QUATERNION"

for name in KEEP:
    act = bpy.data.actions.get(name)
    if not act: print("missing", name); continue
    src.animation_data.action = act
    if hasattr(src.animation_data, "action_slot") and len(getattr(act, "slots", [])): src.animation_data.action_slot = act.slots[0]
    out = bpy.data.actions.new(name)
    tgt.animation_data.action = out
    f0, f1 = int(act.frame_range[0]), int(act.frame_range[1])
    for f in range(f0, f1 + 1):
        scene.frame_set(f)
        world = {} # target bone -> desired rotation in armature space
        for tn in order:
            tb = tgt.data.bones[tn]
            pb = tgt.pose.bones[tn]
            sn = inv.get(tn)
            if sn:
                sp = src.pose.bones[sn]
                delta = sp.matrix.to_quaternion() @ rest_rot(src, sn).inverted() # the source bone's turn from its rest
                want = delta @ rest_rot(tgt, tn)
            else: # unmapped (root, finger tips): follow the parent, keep the rest offset
                want = (world[tb.parent.name] @ rest_rot(tgt, tb.parent.name).inverted() @ rest_rot(tgt, tn)) if tb.parent else rest_rot(tgt, tn)
            world[tn] = want
            parent_now = (world[tb.parent.name] @ rest_rot(tgt, tb.parent.name).inverted() @ rest_rot(tgt, tn)) if tb.parent else rest_rot(tgt, tn)
            pb.rotation_quaternion = parent_now.inverted() @ want
            pb.keyframe_insert("rotation_quaternion", frame=f)
            if tn == "pelvis": # the hips move: scaled to the new body
                sh = src.pose.bones["DEF-hips"]
                d = (sh.head - src.data.bones["DEF-hips"].head_local) * height_ratio
                pb.location = rest_rot(tgt, tn).inverted() @ Vector(d)
                pb.keyframe_insert("location", frame=f)
    track = tgt.animation_data.nla_tracks.new(); track.name = name
    track.strips.new(name, f0, out)
    tgt.animation_data.action = None
    print("retargeted", name, f1 - f0 + 1, "frames")

# remove the source rig and its mannequin
for o in src_objs: bpy.data.objects.remove(o, do_unlink=True)

# ---- hairstyles: onto the body's Head bone
for hf in HAIR_FILES:
    objs = import_gltf(os.path.join(HAIRS, hf + ".gltf"))
    for o in objs:
        if o.type == "MESH":
            o.name = hf
            mw = o.matrix_world.copy()
            o.parent = tgt; o.matrix_world = mw
            for m in o.modifiers:
                if m.type == "ARMATURE": m.object = tgt
            if not any(m.type == "ARMATURE" for m in o.modifiers):
                m = o.modifiers.new("Armature", "ARMATURE"); m.object = tgt
    for o in objs:
        if o.type != "MESH": bpy.data.objects.remove(o, do_unlink=True)

for o in bpy.data.objects: o.select_set(o == tgt or o.parent == tgt)
bpy.context.view_layer.objects.active = tgt
bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", use_selection=True, export_animations=True, export_animation_mode="NLA_TRACKS",
                          export_skins=True, export_morph=False, export_yup=True, export_image_format="AUTO")
print("exported", OUT)
