# TOMNOOK Asian Business Woman FF2 isolated audit

## Current decision

TOMNOOK FF2 remains the preferred visual candidate, but **formal technical validation has not started because no licensed source package is present**. The model must not be bought, copied into the formal frontend, or described as technically passing based only on the listing.

Isolated workspace:

`C:\Users\a\AppData\Local\Temp\tomnook-ff2-audit-20261008`

## Verified from official public sources

| Item | Public evidence | Status |
|---|---|---|
| Source | ArtStation product `MOxRo` | verified |
| Author/publisher | TOMNOOK / TOMNOOK 3D PEOPLE | verified |
| Licence option | Extended Commercial License | verified on listing |
| Commercial Works | unlimited Works, no sales/view limit | supported by displayed tier |
| Formats | Blender 4.1, FBX, UE5.3.2, C4D 2024 | seller claim |
| PBR | 2K–4K PBR textures | seller claim |
| Facial controls | 52 ARKit Blendshapes | seller claim only |
| Rig | Blender rig; Auto-Rig Pro/FACEIT used | seller claim only |
| Animations | eight | seller claim only |
| GLB | not included | conversion required |
| LOD | absent | seller explicitly states no LOD |

Official page: https://www.artstation.com/marketplace/p/MOxRo/modular-character-asian-business-woman-3d-model-ff2-blender-ue5-c4d

## Missing source-file evidence

No `B_FF2.blend`, `B_FF2.fbx`, texture archive, or manual exists locally. The acceptance-material ZIP does not contain TOMNOOK files. Consequently these required outputs are **not tested**:

- exact file count, size, and SHA-256;
- Head/Neck/Spine/Shoulder/Arm bone names and bone count;
- EyeBlinkLeft/Right, JawOpen, AA/OH/EE/OU, Smile, BrowDown/Up and eye-control names;
- whether all 52 claimed ARKit shapes are included in the Blender and FBX variants;
- standard-PBR conversion fidelity and whether add-on-specific nodes must be baked;
- GLB size and SHA-256;
- GLTFLoader result, screenshots, expression/mouth tests, FPS, console, and network results.

## Prepared isolated workflow

The original combined audit/export script has been disabled. The isolated workflow now has a mandatory manual gate:

1. `scripts/audit_source.py` opens `.blend` or imports `.fbx` with Blender auto-execution disabled and writes only an inventory JSON;
2. the report records Blender version, source size/hash, meshes, triangles, materials, images, every armature/bone, every Shape Key, and conservative capability-name matches;
3. `AUDIT_GATE.md` requires manual review; the report stays `pending_manual_review` until the actual controls and PBR paths pass;
4. `scripts/export_after_gate.py` refuses to run unless the report is marked `approved_for_conversion` and the source SHA-256 still matches;
5. only then may it export one glTF 2.0 GLB with skins, Morph Targets, and animations and record output size/hash.

This script is prepared but has not been run. No Blender executable was found in `PATH` or the currently retained temporary folders, so an official portable/LTS Blender build must also be obtained or restored before conversion.

## VALID F3 comparison at this gate

| Item | VALID F3 | TOMNOOK FF2 |
|---|---|---|
| Young appearance | pass directionally, visual quality low | strong listing-level match; unverified in browser |
| Realism | fails final standard | promising product renders; unverified actual PBR |
| Skin / eyes / hair / clothing | verified and visually insufficient | no actual-file evidence |
| Facial Morphs | 65 verified | 52 ARKit claimed, names unverified |
| Mouth / TTS | verified | untested |
| Skeleton | Head/Neck/Eyes/Shoulders verified | rig claimed, exact names unverified |
| FPS | 87.19 at final 1920×1080 visual pass | untested; no LOD is a risk |
| File size | 2,103,076-byte GLB | source packages publicly listed as 20 MB Blender, 96 MB FBX, 350 MB textures; output unknown |
| Licence | MIT | Extended Commercial after purchase; web-delivery boundary needs care |
| Recommendation | retain as functional fallback | acquire only if the licence/web-delivery boundary is acceptable, then run isolated audit |

## Gate result

**Status: WAITING_FOR_LICENSED_SOURCE_FILES.**

The source/permission stage is sufficiently promising to continue, but there is no basis yet to report bone count, Morph list, conversion success, GLB hash, Three.js screenshots, mouth control, or FPS. Formal integration remains prohibited.
