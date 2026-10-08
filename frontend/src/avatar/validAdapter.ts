import * as T from "three";
import type { AvatarInputs } from "./rocketboxAdapter";

export const validCandidateUrls: Record<string, string> = {
  "valid-f1": "/assets/candidates/Asian_F_1_Busi.glb",
  "valid-f2": "/assets/candidates/Asian_F_2_Busi.glb",
  "valid-f3": "/assets/candidates/Asian_F_3_Busi.glb",
};

type MorphBinding = { mesh: T.Mesh; index: number };

const morph = {
  blinkLeft: "h_expressions.LeyeClose_h",
  blinkRight: "h_expressions.ReyeClose_h",
  mouthOpen: "h_expressions.MouthOpen_h",
  aa: "h_expressions.AE_AA_h",
  oh: "h_expressions.UH_OO_h",
  smileLeft: "h_expressions.LsmileClose_h",
  smileRight: "h_expressions.RsmileClose_h",
  smileOpenLeft: "h_expressions.LsmileOpen_h",
  smileOpenRight: "h_expressions.RsmileOpen_h",
  squintLeft: "h_expressions.Lsquint_h",
  squintRight: "h_expressions.Rsquint_h",
  browDownLeft: "h_expressions.LbrowDown_h",
  browDownRight: "h_expressions.RbrowDown_h",
  browUpLeft: "h_expressions.LbrowUp_h",
} as const;

function tuneBodyMaterial(material: T.Material) {
  if (!(material instanceof T.MeshStandardMaterial)) return material;
  const tuned = new T.MeshPhysicalMaterial();
  T.MeshStandardMaterial.prototype.copy.call(tuned, material);
  tuned.name = `${material.name}_studio`;
  tuned.roughness = 0.76;
  tuned.metalness = 0;
  tuned.envMapIntensity = 0.42;
  tuned.ior = 1.4;
  tuned.clearcoat = 0.035;
  tuned.clearcoatRoughness = 0.82;
  tuned.sheen = 0.07;
  tuned.sheenColor.set("#d8a28f");
  tuned.sheenRoughness = 0.9;
  if (tuned.normalScale) tuned.normalScale.multiplyScalar(0.46);
  tuned.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vStudioWorldPosition;")
      .replace("#include <project_vertex>", "vStudioWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;\n#include <project_vertex>");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vStudioWorldPosition;")
      .replace("#include <map_fragment>", `#include <map_fragment>
        float studioLuma = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
        float studioDark = 1.0 - smoothstep(0.12, 0.52, studioLuma);
        float studioClothing = 1.0 - smoothstep(1.40, 1.52, vStudioWorldPosition.y);
        float studioJacket = studioDark * studioClothing;
        float studioBlouse = smoothstep(0.018, 0.10, diffuseColor.b - diffuseColor.g) * studioClothing;
        vec3 studioBlue = vec3(0.25, 0.40, 0.57) * (0.84 + studioLuma * 0.55);
        vec3 studioIvory = vec3(0.62, 0.69, 0.76) * (0.91 + studioLuma * 0.18);
        diffuseColor.rgb = mix(diffuseColor.rgb, studioBlue, studioJacket * 0.91);
        diffuseColor.rgb = mix(diffuseColor.rgb, studioIvory, studioBlouse * 0.56);
        float studioSkin = smoothstep(1.48, 1.57, vStudioWorldPosition.y) * smoothstep(0.22, 0.48, studioLuma);
        vec3 studioWarmSkin = diffuseColor.rgb * vec3(1.018, 0.995, 0.978) + vec3(0.006, 0.002, 0.001);
        diffuseColor.rgb = mix(diffuseColor.rgb, studioWarmSkin, studioSkin * 0.38);
      `)
      .replace("#include <roughnessmap_fragment>", `#include <roughnessmap_fragment>
        float studioMicro = fract(sin(dot(vStudioWorldPosition.xy, vec2(12.9898, 78.233))) * 43758.5453);
        roughnessFactor = mix(roughnessFactor, 0.70 + (studioMicro - 0.5) * 0.055, studioSkin * 0.82);
      `);
  };
  tuned.customProgramCacheKey = () => "valid-studio-body-v2";
  tuned.needsUpdate = true;
  return tuned;
}

function tuneEyeMaterial(material: T.Material) {
  if (!(material instanceof T.MeshStandardMaterial)) return material;
  const eye = new T.MeshPhysicalMaterial();
  T.MeshStandardMaterial.prototype.copy.call(eye, material);
  eye.name = `${material.name}_eye`;
  eye.roughness = 0.08;
  eye.metalness = 0;
  eye.ior = 1.376;
  eye.clearcoat = 1;
  eye.clearcoatRoughness = 0.045;
  eye.envMapIntensity = 1.42;
  eye.needsUpdate = true;
  return eye;
}

function tuneHairMaterial(material: T.Material) {
  if (!(material instanceof T.MeshStandardMaterial)) return material;
  const hair = new T.MeshPhysicalMaterial();
  T.MeshStandardMaterial.prototype.copy.call(hair, material);
  hair.name = `${material.name}_studio`;
  hair.roughness = 0.77;
  hair.metalness = 0;
  hair.sheen = 0.12;
  hair.sheenColor.set("#8393a8");
  hair.sheenRoughness = 0.88;
  hair.anisotropy = 0.08;
  hair.anisotropyRotation = Math.PI / 2;
  hair.clearcoat = 0.025;
  hair.clearcoatRoughness = 0.9;
  hair.envMapIntensity = 0.35;
  if (hair.normalScale) hair.normalScale.multiplyScalar(0.72);
  hair.needsUpdate = true;
  return hair;
}

function disposeMaterial(material: T.Material) {
  for (const value of Object.values(material)) if (value instanceof T.Texture) value.dispose();
  material.dispose();
}

export class ValidAdapter {
  readonly scene: T.Group;
  private readonly morphs = new Map<string, MorphBinding[]>();
  private readonly actual = new Map<string, number>();
  private readonly rootPosition: T.Vector3;
  private readonly head: T.Bone;
  private readonly eyes: T.Bone[];
  private readonly headBase: T.Quaternion;
  private readonly headWorldBase: T.Quaternion;
  private readonly eyeBases: T.Quaternion[];
  private nextBlinkAt = performance.now() + 1000 + Math.random() * 2200;
  private blinkEndsAt = 0;

  constructor(scene: T.Group) {
    this.scene = scene;
    const bones = new Map<string, T.Bone>();
    scene.traverse((node) => {
      if (node instanceof T.Bone) bones.set(node.name, node);
      if (!(node instanceof T.Mesh)) return;
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      const tuned = materials.map((material) => {
        if (node.name === "H_DDS_HighRes") return tuneBodyMaterial(material);
        if (node.name === "h_wig") return tuneHairMaterial(material);
        if (node.name === "h_L_eye" || node.name === "h_R_eye" || node.name.includes("gland")) return tuneEyeMaterial(material);
        return material;
      });
      node.material = Array.isArray(node.material) ? tuned : tuned[0];
      if (!node.morphTargetDictionary) return;
      for (const [name, index] of Object.entries(node.morphTargetDictionary)) {
        const bindings = this.morphs.get(name) ?? [];
        bindings.push({ mesh: node, index });
        this.morphs.set(name, bindings);
      }
    });
    const required = Object.values(morph);
    const missing = required.filter((name) => !this.morphs.has(name));
    if (missing.length) throw new Error(`VALID 候选缺少关键 Morph Target：${missing.join(", ")}`);
    const head = bones.get("Head");
    const leftArm = bones.get("LeftArm");
    const rightArm = bones.get("RightArm");
    if (!head || !leftArm || !rightArm) throw new Error("VALID 候选缺少头部或上臂骨骼。");

    scene.updateMatrixWorld(true);
    const initialBox = new T.Box3().setFromObject(scene);
    const initialHeight = initialBox.max.y - initialBox.min.y;
    scene.scale.setScalar(1.78 / initialHeight);
    scene.updateMatrixWorld(true);
    const box = new T.Box3().setFromObject(scene);
    const center = box.getCenter(new T.Vector3());
    scene.position.set(-center.x - 0.08, -box.min.y, -center.z);
    scene.updateMatrixWorld(true);

    const relax = (bone: T.Bone, side: number) => {
      const child = bone.children.find((node): node is T.Bone => node instanceof T.Bone);
      if (!child) return;
      const start = bone.getWorldPosition(new T.Vector3());
      const direction = child.getWorldPosition(new T.Vector3()).sub(start).normalize();
      const target = new T.Vector3(side * 0.08, -1, 0).normalize();
      const turn = new T.Quaternion().setFromUnitVectors(direction, target);
      const world = bone.getWorldQuaternion(new T.Quaternion());
      const parent = bone.parent!.getWorldQuaternion(new T.Quaternion()).invert();
      bone.quaternion.slerp(parent.multiply(turn.multiply(world)), 0.9);
    };
    relax(leftArm, -1);
    relax(rightArm, 1);
    scene.updateMatrixWorld(true);

    this.head = head;
    this.eyes = [bones.get("LeftEye"), bones.get("RightEye")].filter((x): x is T.Bone => Boolean(x));
    this.headBase = head.quaternion.clone();
    this.headWorldBase = head.getWorldQuaternion(new T.Quaternion());
    this.eyeBases = this.eyes.map((eye) => eye.quaternion.clone());
    this.rootPosition = scene.position.clone();
  }

  private setTarget(name: string, value: number, smoothing: number) {
    const current = this.actual.get(name) ?? 0;
    const next = T.MathUtils.lerp(current, T.MathUtils.clamp(value, 0, 1), smoothing);
    this.actual.set(name, next);
    for (const binding of this.morphs.get(name) ?? []) {
      if (binding.mesh.morphTargetInfluences) binding.mesh.morphTargetInfluences[binding.index] = next;
    }
  }

  update(input: AvatarInputs, now: number, deltaSeconds: number) {
    const strength = T.MathUtils.clamp(input.strength, 0, 1);
    const alpha = 1 - Math.exp(-Math.min(deltaSeconds, 0.05) * 12);
    const target = new Map<string, number>();
    Object.values(morph).forEach((name) => target.set(name, 0));
    let pitch = Math.sin(now / 3700) * 0.012;
    let roll = Math.sin(now / 5100) * 0.009;
    let gaze = Math.sin(now / 4300) * 0.025;
    if (input.emotion === "smile") {
      target.set(morph.smileLeft, strength * 0.36);
      target.set(morph.smileRight, strength * 0.36);
      target.set(morph.smileOpenLeft, strength * 0.035);
      target.set(morph.smileOpenRight, strength * 0.035);
      target.set(morph.squintLeft, strength * 0.045);
      target.set(morph.squintRight, strength * 0.045);
    } else if (input.emotion === "serious") {
      target.set(morph.browDownLeft, strength * 0.14);
      target.set(morph.browDownRight, strength * 0.14);
      pitch += strength * 0.013;
      gaze *= 0.35;
    } else if (input.emotion === "curious") {
      target.set(morph.browUpLeft, strength * 0.52);
      roll += strength * 0.064;
      gaze += strength * 0.032;
    }
    if (now >= this.nextBlinkAt && !this.blinkEndsAt) this.blinkEndsAt = now + 120 + Math.random() * 60;
    if (this.blinkEndsAt > now) {
      const elapsed = 1 - (this.blinkEndsAt - now) / 180;
      const blink = Math.sin(T.MathUtils.clamp(elapsed, 0, 1) * Math.PI);
      target.set(morph.blinkLeft, blink);
      target.set(morph.blinkRight, blink);
    } else if (this.blinkEndsAt) {
      this.blinkEndsAt = 0;
      this.nextBlinkAt = now + 1800 + Math.random() * 3400;
    }
    const energy = T.MathUtils.clamp((input.mouth - 0.035) / 0.72, 0, 1);
    target.set(morph.mouthOpen, energy * 0.58);
    target.set(morph.aa, energy * 0.38);
    target.set(morph.oh, Math.max(0, energy - 0.28) * 0.22);
    for (const [name, value] of target) this.setTarget(name, value, alpha);

    this.scene.position.copy(this.rootPosition);
    this.scene.position.y += Math.sin(now / 1700) * 0.007;
    const motion = this.headWorldBase.clone().invert()
      .multiply(new T.Quaternion().setFromEuler(new T.Euler(pitch, 0, roll)))
      .multiply(this.headWorldBase);
    this.head.quaternion.copy(this.headBase).multiply(motion);
    this.eyes.forEach((eye, index) => eye.quaternion.copy(this.eyeBases[index]).multiply(
      new T.Quaternion().setFromEuler(new T.Euler(0, gaze, 0)),
    ));
  }

  dispose() {
    this.scene.traverse((node) => {
      if (!(node instanceof T.Mesh)) return;
      node.geometry.dispose();
      (Array.isArray(node.material) ? node.material : [node.material]).forEach(disposeMaterial);
    });
    this.scene.removeFromParent();
  }
}
