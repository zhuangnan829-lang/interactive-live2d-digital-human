import argparse
import json
import os
import sys

import bpy


def args_after_separator():
    return sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []


def object_summary():
    meshes = []
    armatures = []
    for obj in bpy.context.scene.objects:
        if obj.type == "MESH":
            meshes.append(
                {
                    "name": obj.name,
                    "vertices": len(obj.data.vertices),
                    "polygons": len(obj.data.polygons),
                    "shape_keys": list(obj.data.shape_keys.key_blocks.keys()) if obj.data.shape_keys else [],
                    "materials": [slot.material.name if slot.material else None for slot in obj.material_slots],
                    "armature_modifiers": [mod.object.name if mod.object else None for mod in obj.modifiers if mod.type == "ARMATURE"],
                }
            )
        if obj.type == "ARMATURE":
            armatures.append({"name": obj.name, "bones": [bone.name for bone in obj.data.bones]})
    return {"meshes": meshes, "armatures": armatures, "actions": [a.name for a in bpy.data.actions]}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--texture-dir", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--report", required=True)
    args = parser.parse_args(args_after_separator())

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=os.path.abspath(args.input), use_image_search=False)

    texture_dir = os.path.abspath(args.texture_dir)
    available = {name.lower(): os.path.join(texture_dir, name) for name in os.listdir(texture_dir)}
    remapped = []
    missing = []
    for image in bpy.data.images:
        wanted = os.path.basename(image.filepath).lower()
        candidate = available.get(wanted)
        if not candidate:
            missing.append({"image": image.name, "requested": image.filepath})
            continue
        image.filepath = candidate
        image.reload()
        remapped.append({"image": image.name, "path": candidate})

    before = object_summary()
    if missing:
        raise RuntimeError("Texture remap incomplete: " + json.dumps(missing))

    bpy.ops.file.pack_all()
    bpy.ops.export_scene.gltf(
        filepath=os.path.abspath(args.output),
        export_format="GLB",
        export_image_format="AUTO",
        export_animations=False,
        export_skins=True,
        export_morph=True,
        export_morph_normal=True,
        export_morph_tangent=False,
        export_materials="EXPORT",
    )

    report = {
        "source": os.path.abspath(args.input),
        "texture_dir": texture_dir,
        "output": os.path.abspath(args.output),
        "remapped_images": remapped,
        "before_export": before,
        "output_bytes": os.path.getsize(args.output),
    }
    with open(args.report, "w", encoding="utf-8") as handle:
        json.dump(report, handle, ensure_ascii=False, indent=2)
    print(json.dumps({"output": report["output"], "bytes": report["output_bytes"], "remapped": len(remapped)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
