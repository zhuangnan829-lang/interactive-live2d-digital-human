import { useEffect, useRef } from "react";
import * as T from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { VRMLoaderPlugin, VRM, VRMExpressionPresetName } from "@pixiv/three-vrm";
import { AvatarInputs, RocketboxAdapter, rocketboxConfig } from "./avatar/rocketboxAdapter";
import { createRenderAudit } from "./avatar/renderAudit";
import { ValidAdapter, validCandidateUrls } from "./avatar/validAdapter";

const fallbackVrm = {
  url: "/assets/AvatarSample_A_1.0.vrm.glb",
  camera: new T.Vector3(0, 1.35, 2.2),
};

function createStudioBackground() {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 1024;
  const context = canvas.getContext("2d")!;
  const base = context.createLinearGradient(0, 0, 1024, 1024);
  base.addColorStop(0, "#dce8f2");
  base.addColorStop(0.48, "#9bb3c9");
  base.addColorStop(1, "#526f8c");
  context.fillStyle = base;
  context.fillRect(0, 0, 1024, 1024);
  const glow = context.createRadialGradient(375, 245, 20, 375, 245, 520);
  glow.addColorStop(0, "rgba(245,251,255,0.82)");
  glow.addColorStop(0.45, "rgba(199,220,239,0.34)");
  glow.addColorStop(1, "rgba(96,129,160,0)");
  context.fillStyle = glow;
  context.fillRect(0, 0, 1024, 1024);
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  return texture;
}

export function AvatarScene({ emotion, strength, mouth, onReady, onError }: {
  emotion: string;
  strength: number;
  mouth: number;
  onReady: () => void;
  onError: (message: string) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const inputs = useRef<AvatarInputs>({ emotion, strength, mouth });
  const readyRef = useRef(onReady);
  const errorRef = useRef(onError);
  inputs.current = { emotion, strength, mouth };
  readyRef.current = onReady;
  errorRef.current = onError;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const avatarMode = new URLSearchParams(window.location.search).get("avatar");
    const diagnosticVrm = avatarMode === "vrm";
    const validCandidateUrl = avatarMode ? validCandidateUrls[avatarMode] : undefined;
    const forcedMissing = avatarMode === "missing";
    const scene = new T.Scene();
    const studioBackground = validCandidateUrl ? createStudioBackground() : undefined;
    scene.background = studioBackground ?? new T.Color("#7f96aa");
    scene.fog = new T.Fog(validCandidateUrl ? "#6f8ba5" : "#7f96aa", 4.5, 9);
    const camera = new T.PerspectiveCamera(27, 1, 0.1, 100);
    camera.position.copy(diagnosticVrm ? fallbackVrm.camera : validCandidateUrl ? new T.Vector3(0.03, 1.5, 1.31) : rocketboxConfig.cameraPosition);
    camera.lookAt(diagnosticVrm ? new T.Vector3(0, 1.25, 0) : validCandidateUrl ? new T.Vector3(-0.08, 1.48, 0) : rocketboxConfig.cameraTarget);
    const renderer = new T.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = T.SRGBColorSpace;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = validCandidateUrl ? 0.81 : 1.05;
    host.appendChild(renderer.domElement);
    scene.add(new T.HemisphereLight(0xeaf5ff, 0x344a5f, validCandidateUrl ? 0.82 : 2.1));
    const key = new T.DirectionalLight(0xfff2e5, validCandidateUrl ? 1.6 : 2.7);
    key.position.set(2.3, 3.4, 3.1);
    scene.add(key);
    const fill = new T.DirectionalLight(0xc8ddff, validCandidateUrl ? 0.5 : 1.15);
    fill.position.set(-2.8, 2.25, 2.5);
    scene.add(fill);
    const faceFill = new T.DirectionalLight(0xfff5eb, validCandidateUrl ? 0.48 : 2.2);
    faceFill.position.set(0, 1.6, 4);
    scene.add(faceFill);
    const rim = new T.DirectionalLight(0xaed8ff, validCandidateUrl ? 1.45 : 1.25);
    rim.position.set(-2.6, 2.9, -2.2);
    scene.add(rim);
    if (validCandidateUrl) {
      const eyeCatch = new T.PointLight(0xe8f6ff, 4.5, 3.5, 2);
      eyeCatch.position.set(0.18, 1.62, 1.35);
      scene.add(eyeCatch);
      const eyeCatchSoft = new T.PointLight(0xffeee2, 2.2, 2.8, 2);
      eyeCatchSoft.position.set(-0.32, 1.69, 1.12);
      scene.add(eyeCatchSoft);
    }

    let vrm: VRM | undefined;
    let rocketbox: RocketboxAdapter | undefined;
    let valid: ValidAdapter | undefined;
    let rafId = 0;
    let lastFrame = performance.now();
    let blinkAt = performance.now() + 1500;
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    if (diagnosticVrm) loader.register((parser) => new VRMLoaderPlugin(parser));

    const resize = () => {
      const { width, height } = host.getBoundingClientRect();
      if (!width || !height) return;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();
    const audit = createRenderAudit(host, renderer);

    loader.load(
      diagnosticVrm ? fallbackVrm.url : validCandidateUrl ?? (forcedMissing ? "/assets/rocketbox/missing-for-test.glb" : rocketboxConfig.url),
      (gltf) => {
        try {
          if (diagnosticVrm) {
            vrm = gltf.userData.vrm as VRM;
            if (!vrm) throw new Error("VRM 插件未返回模型对象。");
            scene.add(vrm.scene);
            const left = vrm.humanoid?.getNormalizedBoneNode("leftUpperArm" as never);
            const right = vrm.humanoid?.getNormalizedBoneNode("rightUpperArm" as never);
            left?.rotation.set(0, 0, -0.8);
            right?.rotation.set(0, 0, 0.8);
            console.info("Diagnostic VRM fallback loaded by explicit ?avatar=vrm flag.");
          } else if (validCandidateUrl) {
            valid = new ValidAdapter(gltf.scene);
            scene.add(valid.scene);
            console.info("VALID young-female diagnostic candidate loaded", { avatarMode, url: validCandidateUrl, morphs: 65 });
          } else {
            rocketbox = new RocketboxAdapter(gltf.scene);
            scene.add(rocketbox.scene);
            console.info("Rocketbox Female_Adult_02 loaded", { url: rocketboxConfig.url, morphs: 175 });
          }
          readyRef.current();
        } catch (error) {
          errorRef.current(error instanceof Error ? error.message : "模型初始化失败。");
        }
      },
      undefined,
      (error) => errorRef.current(error instanceof Error ? error.message : "模型资源加载失败。"),
    );

    const render = (now: number) => {
      const delta = (now - lastFrame) / 1000;
      lastFrame = now;
      if (rocketbox) rocketbox.update(inputs.current, now, delta);
      if (valid) valid.update(inputs.current, now, delta);
      if (vrm) {
        const value = inputs.current;
        const active: Record<string, string> = { natural: "neutral", smile: "happy", serious: "angry", curious: "surprised" };
        (["neutral", "happy", "angry", "surprised"] as VRMExpressionPresetName[]).forEach((name) =>
          vrm!.expressionManager?.setValue(name, active[value.emotion] === name ? value.strength : 0),
        );
        vrm.expressionManager?.setValue("aa", Math.min(0.9, value.mouth));
        vrm.expressionManager?.setValue("oh", Math.min(0.65, value.mouth * 0.6));
        if (now > blinkAt) {
          vrm.expressionManager?.setValue("blink", 1);
          if (now > blinkAt + 120) {
            vrm.expressionManager?.setValue("blink", 0);
            blinkAt = now + 1800 + Math.random() * 3000;
          }
        }
        vrm.scene.position.y = Math.sin(now / 1000) * 0.01;
        vrm.update(delta);
      }
      renderer.render(scene, camera);
      audit?.frame(now, Boolean(rocketbox || valid || vrm), inputs.current.mouth, inputs.current.emotion);
      rafId = requestAnimationFrame(render);
    };
    rafId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(rafId);
      observer.disconnect();
      audit?.dispose();
      rocketbox?.dispose();
      valid?.dispose();
      vrm?.scene.removeFromParent();
      studioBackground?.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return <div className="avatar-canvas" ref={hostRef} />;
}
