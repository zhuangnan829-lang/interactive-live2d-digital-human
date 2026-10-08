import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";
import { AvatarScene } from "./AvatarScene";
type Emotion = "natural" | "smile" | "serious" | "curious";
type Status = "loading" | "ready" | "speaking" | "stopping" | "error" | "empty";
const defaults = { version: 1, emotion: "natural" as Emotion, strength: 0.55 };
function loadSettings() {
  try {
    const x = JSON.parse(
      localStorage.getItem("digitalHuman.settings.v1") || "null",
    );
    return x?.version === 1 &&
      ["natural", "smile", "serious", "curious"].includes(x.emotion) &&
      x.strength >= 0 &&
      x.strength <= 1
      ? x
      : defaults;
  } catch {
    return defaults;
  }
}
function App() {
  const [settings, setSettings] = useState(loadSettings);
  const [text, setText] = useState(
    "欢迎来到数字人讲解页面。请在这里输入任意中文内容。",
  );
  const [status, setStatus] = useState<Status>("loading");
  const [message, setMessage] = useState("正在初始化数字人渲染环境…");
  const [fps, setFps] = useState(0);
  const [fps60, setFps60] = useState<number | null>(null);
  const [modelReady, setModelReady] = useState(false);
  const [modelAttempt, setModelAttempt] = useState(0);
  const [mouth, setMouth] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const urlRef = useRef<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const raf = useRef(0);
  const requestRef = useRef(0);
  useEffect(() => {
    localStorage.setItem("digitalHuman.settings.v1", JSON.stringify(settings));
  }, [settings]);
  useEffect(() => {
    let frames = 0,
      last = performance.now(),
      sampleStarted = last,
      sampleFrames = 0,
      measured = false,
      id = 0;
    const tick = (now: number) => {
      frames++;
      sampleFrames++;
      if (now - last > 1000) {
        setFps(Math.round((frames * 1000) / (now - last)));
        frames = 0;
        last = now;
      }
      if (!measured && now - sampleStarted >= 60000) {
        measured = true;
        setFps60(Math.round((sampleFrames * 1000) / (now - sampleStarted)));
      }
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(id);
      stop(false);
    };
  }, []);
  const releasePlayback = () => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    if (raf.current) cancelAnimationFrame(raf.current);
    raf.current = 0;
    audioRef.current?.pause();
    if (audioRef.current) audioRef.current.currentTime = 0;
    audioRef.current = null;
    sourceRef.current?.disconnect();
    sourceRef.current = null;
    analyserRef.current?.disconnect();
    analyserRef.current = null;
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
    setMouth(0);
  };
  const stop = (show = true) => {
    requestRef.current++;
    setStatus(show ? "stopping" : "ready");
    releasePlayback();
    if (show)
      setTimeout(() => {
        setStatus("ready");
        setMessage("已停止播报，口型已复位。");
      }, 180);
  };
  const speak = async () => {
    if (!text.trim()) {
      setStatus("empty");
      setMessage("请输入需要讲解的中文文字。");
      return;
    }
    stop(false);
    const current = ++requestRef.current;
    const controller = new AbortController();
    controllerRef.current = controller;
    setStatus("loading");
    setMessage("正在生成真实中文语音…");
    try {
      const r = await fetch("/api/tts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: text.trim() }),
        signal: controller.signal,
      });
      if (!r.ok)
        throw new Error(
          (await r.json().catch(() => null))?.detail || "语音服务暂不可用",
        );
      const blob = await r.blob();
      if (current !== requestRef.current) return;
      const url = URL.createObjectURL(blob), a = new Audio(url);
      urlRef.current = url;
      audioRef.current = a;
      const ctx = ctxRef.current || new AudioContext();
      ctxRef.current = ctx;
      const source = ctx.createMediaElementSource(a),
        analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyser.connect(ctx.destination);
      sourceRef.current = source;
      analyserRef.current = analyser;
      const data = new Uint8Array(analyser.frequencyBinCount);
      const animate = () => {
        analyser.getByteTimeDomainData(data);
        let energy = 0;
        for (const v of data) energy += Math.abs(v - 128);
        energy /= data.length;
        setMouth(Math.min(1, Math.max(0, (energy - 2) / 20)));
        raf.current = requestAnimationFrame(animate);
      };
      a.onended = () => {
        if (current === requestRef.current && audioRef.current === a) {
          if (raf.current) cancelAnimationFrame(raf.current);
          raf.current = 0;
          source.disconnect();
          analyser.disconnect();
          sourceRef.current = null;
          analyserRef.current = null;
          audioRef.current = null;
          if (urlRef.current === url) {
            URL.revokeObjectURL(url);
            urlRef.current = null;
          }
          setMouth(0);
          setStatus("ready");
          setMessage("播报完成。");
        }
      };
      await ctx.resume();
      await a.play();
      if (current !== requestRef.current) return;
      setStatus("speaking");
      setMessage("正在播报，口型由实时音频驱动。");
      animate();
    } catch (e) {
      if (current !== requestRef.current || (e instanceof DOMException && e.name === "AbortError")) return;
      setStatus("error");
      setMessage(
        `语音生成失败：${e instanceof Error ? e.message : "未知错误"}。请检查服务后重试。`,
      );
    }
  };
  const reset = () => {
    setSettings(defaults);
    setMessage("已恢复默认表情与强度。");
  };
  const retryModel = () => {
    stop(false);
    setModelReady(false);
    setStatus("loading");
    setMessage("正在重新加载 Rocketbox 数字人模型…");
    setModelAttempt((attempt) => attempt + 1);
  };
  return (
    <main>
      <section className="stage">
        <AvatarScene key={modelAttempt} emotion={settings.emotion} strength={settings.strength} mouth={mouth} onReady={() => { setModelReady(true); setStatus("ready"); setMessage("数字人模型已真实加载。") }} onError={(error) => { setModelReady(false); setStatus("error"); setMessage(`Rocketbox 加载失败：${error}`) }} />
        <div className="badge">{status.toUpperCase()}</div>
        <p className="status">{message}</p>
        <small>渲染监测：{fps} FPS{fps60 !== null ? ` · 60秒平均 ${fps60} FPS` : ""} · 测试模式</small>
      </section>
      <section className="panel">
        <header>
          <p>INTERACTIVE DIGITAL HUMAN</p>
          <h1>让讲解更有表达力</h1>
          <span>输入内容，选择情绪，开始一次自然的中文讲解。</span>
        </header>
        <label>
          讲解文字
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={500}
          />
        </label>
        <div className="controls">
          <div>
            <b>表达方式</b>
            <div className="emotions">
              {(
                [
                  ["natural", "自然"],
                  ["smile", "微笑"],
                  ["serious", "认真"],
                  ["curious", "疑惑"],
                ] as [Emotion, string][]
              ).map(([v, n]) => (
                <button
                  className={settings.emotion === v ? "selected" : ""}
                  onClick={() => setSettings({ ...settings, emotion: v })}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
          <label>
            强度 <output>{Math.round(settings.strength * 100)}%</output>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={settings.strength}
              onChange={(e) =>
                setSettings({ ...settings, strength: +e.target.value })
              }
            />
          </label>
        </div>
        <div className="actions">
          <button
            className="primary"
            disabled={
              !modelReady || status === "loading" || status === "stopping"
            }
            onClick={speak}
          >
            开始播报
          </button>
          <button disabled={status !== "speaking"} onClick={() => stop()}>
            停止
          </button>
          <button onClick={reset}>恢复默认</button>
          {status === "error" && <button onClick={retryModel}>重试加载模型</button>}
        </div>
        <p className="notice">
          语音由后端生成；若服务不可用会显示错误信息，可修复后重新点击播报。
        </p>
      </section>
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
