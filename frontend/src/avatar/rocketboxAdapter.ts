import * as T from "three";

export type AvatarInputs = {
  emotion: string;
  strength: number;
  mouth: number;
};

export const rocketboxConfig = {
  url: "/assets/rocketbox/Female_Adult_02_facial.glb",
  position: new T.Vector3(-0.14, 0, 0),
  rotationY: 0,
  scale: 1,
  armRelaxation: 0.88,
  cameraPosition: new T.Vector3(0.02, 1.38, 2.35),
  cameraTarget: new T.Vector3(-0.1, 1.32, 0),
  bones: {
    head: "Bip01_Head",
    leftUpperArm: "Bip01_L_UpperArm",
    rightUpperArm: "Bip01_R_UpperArm",
  },
  morphs: {
    blinkLeft: "AK_09_EyeBlinkLeft",
    blinkRight: "AK_10_EyeBlinkRight",
    eyeLookOutLeft: "AK_15_EyeLookOutLeft",
    eyeLookInRight: "AK_14_EyeLookInRight",
    jawOpen: "AK_25_JawOpen",
    aa: "AA_VI_10_aa",
    oh: "AA_VI_13_O",
    smileLeft: "AK_44_MouthSmileLeft",
    smileRight: "AK_45_MouthSmileRight",
    browDownLeft: "AK_01_BrowDownLeft",
    browDownRight: "AK_02_BrowDownRight",
    browLowerer: "AU_04_BrowLowerer",
    browOuterUpLeft: "AK_04_BrowOuterUpLeft",
  },
} as const;

type MorphBinding = { mesh: T.Mesh; index: number };

function disposeMaterial(material: T.Material) {
  for (const value of Object.values(material)) {
    if (value instanceof T.Texture) value.dispose();
  }
  material.dispose();
}

export class RocketboxAdapter {
  readonly scene: T.Group;
  private readonly morphs = new Map<string, MorphBinding[]>();
  private readonly actual = new Map<string, number>();
  private readonly rootPosition: T.Vector3;
  private readonly head?: T.Bone;
  private readonly leftUpperArm?: T.Bone;
  private readonly rightUpperArm?: T.Bone;
  private readonly headBase?: T.Quaternion;
  private readonly headWorldBase: T.Quaternion;
  private readonly leftArmBase?: T.Quaternion;
  private readonly rightArmBase?: T.Quaternion;
  private nextBlinkAt = performance.now() + 1200 + Math.random() * 2000;
  private blinkEndsAt = 0;

  constructor(scene: T.Group) {
    this.scene = scene;
    this.scene.position.copy(rocketboxConfig.position);
    this.scene.rotation.y = rocketboxConfig.rotationY;
    this.scene.scale.setScalar(rocketboxConfig.scale);
    this.rootPosition = this.scene.position.clone();

    const bones = new Map<string, T.Bone>();
    this.scene.traverse((node) => {
      if (node instanceof T.Bone) bones.set(node.name, node);
      if (!(node instanceof T.Mesh) || !node.morphTargetDictionary) return;
      for (const [name, index] of Object.entries(node.morphTargetDictionary)) {
        const bindings = this.morphs.get(name) ?? [];
        bindings.push({ mesh: node, index });
        this.morphs.set(name, bindings);
      }
    });

    const required = [
      rocketboxConfig.morphs.blinkLeft,
      rocketboxConfig.morphs.blinkRight,
      rocketboxConfig.morphs.jawOpen,
      rocketboxConfig.morphs.aa,
      rocketboxConfig.morphs.smileLeft,
      rocketboxConfig.morphs.smileRight,
      rocketboxConfig.morphs.browDownLeft,
      rocketboxConfig.morphs.browOuterUpLeft,
    ];
    const missing = required.filter((name) => !this.morphs.has(name));
    if (missing.length) throw new Error(`Rocketbox 缺少关键 Morph Target：${missing.join(", ")}`);

    this.head = bones.get(rocketboxConfig.bones.head);
    this.leftUpperArm = bones.get(rocketboxConfig.bones.leftUpperArm);
    this.rightUpperArm = bones.get(rocketboxConfig.bones.rightUpperArm);
    if (!this.head || !this.leftUpperArm || !this.rightUpperArm) {
      throw new Error("Rocketbox 缺少头部或上臂骨骼，无法初始化自然姿态。");
    }
    this.headBase = this.head.quaternion.clone();
    // FBX upper arms run along local X; rotating X only twists the sleeve.
    // Aim the bone toward world-down, then convert back into parent space.
    this.scene.updateMatrixWorld(true);
    this.headWorldBase = this.head.getWorldQuaternion(new T.Quaternion());
    const relaxedArm = (bone: T.Bone) => {
      const base = bone.quaternion.clone();
      const world = bone.getWorldQuaternion(new T.Quaternion());
      const direction = new T.Vector3(1, 0, 0).applyQuaternion(world).normalize();
      const turn = new T.Quaternion().setFromUnitVectors(direction, new T.Vector3(0, -1, 0));
      const parent = bone.parent!.getWorldQuaternion(new T.Quaternion());
      const relaxed = parent.invert().multiply(turn.multiply(world));
      return base.slerp(relaxed, rocketboxConfig.armRelaxation);
    };
    this.leftArmBase = relaxedArm(this.leftUpperArm);
    this.rightArmBase = relaxedArm(this.rightUpperArm);
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
    const put = (name: string, value: number) => target.set(name, value);
    const m = rocketboxConfig.morphs;

    [
      m.blinkLeft, m.blinkRight, m.eyeLookOutLeft, m.eyeLookInRight,
      m.jawOpen, m.aa, m.oh, m.smileLeft, m.smileRight,
      m.browDownLeft, m.browDownRight, m.browLowerer, m.browOuterUpLeft,
    ].forEach((name) => put(name, 0));

    let headPitch = Math.sin(now / 3700) * 0.012;
    let headRoll = Math.sin(now / 5300) * 0.009;
    const glance = Math.sin(now / 4200) * 0.045;
    put(m.eyeLookOutLeft, Math.max(0, glance));
    put(m.eyeLookInRight, Math.max(0, glance));

    if (input.emotion === "smile") {
      put(m.smileLeft, strength * 0.72);
      put(m.smileRight, strength * 0.72);
    } else if (input.emotion === "serious") {
      put(m.browDownLeft, strength * 0.28);
      put(m.browDownRight, strength * 0.28);
      put(m.browLowerer, strength * 0.18);
      headPitch += strength * 0.035;
    } else if (input.emotion === "curious") {
      put(m.browOuterUpLeft, strength * 0.9);
      put(m.eyeLookOutLeft, Math.max(target.get(m.eyeLookOutLeft) ?? 0, strength * 0.12));
      headRoll += strength * 0.18;
    }

    if (now >= this.nextBlinkAt && this.blinkEndsAt === 0) this.blinkEndsAt = now + 110 + Math.random() * 70;
    if (this.blinkEndsAt > now) {
      const elapsed = 1 - (this.blinkEndsAt - now) / 180;
      const blink = Math.sin(T.MathUtils.clamp(elapsed, 0, 1) * Math.PI);
      put(m.blinkLeft, blink);
      put(m.blinkRight, blink);
    } else if (this.blinkEndsAt) {
      this.blinkEndsAt = 0;
      this.nextBlinkAt = now + 1800 + Math.random() * 3600;
    }

    const energy = T.MathUtils.clamp((input.mouth - 0.035) / 0.72, 0, 1);
    put(m.jawOpen, energy * 0.62);
    put(m.aa, energy * 0.42);
    put(m.oh, Math.max(0, energy - 0.3) * 0.25);
    for (const [name, value] of target) this.setTarget(name, value, alpha);

    this.scene.position.copy(this.rootPosition);
    this.scene.position.y += Math.sin(now / 1700) * 0.008;
    const headMotion = this.headWorldBase.clone().invert()
      .multiply(new T.Quaternion().setFromEuler(new T.Euler(headPitch, 0, headRoll)))
      .multiply(this.headWorldBase);
    this.head?.quaternion.copy(this.headBase!).multiply(headMotion);
    this.leftUpperArm?.quaternion.copy(this.leftArmBase!);
    this.rightUpperArm?.quaternion.copy(this.rightArmBase!);
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
