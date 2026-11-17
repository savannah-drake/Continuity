// app/call/page.tsx: "Talk to Continuity", a voice call in the browser (no FaceTime, no Chert).
// The browser joins a LiveKit room; the token dispatches the same Continuity voice agent (Gemini Live) with
// this user's id, so it reads their own plan. The agent's video track shows the mascot.
// Needs the livekit-client package (npm install livekit-client).
"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useLang } from "@/lib/i18n";
import { useMe } from "@/lib/useMe";
import { MicIcon, MicOffIcon, HangUpIcon } from "@/components/icons";

const T = {
  en: {
    title: "Talk to Continuity", start: "Start call", connecting: "Connecting…", ended: "Call ended",
    listening: "Listening", thinking: "Thinking", speaking: "Speaking", waiting: "Joining…",
    mute: "Mute", unmute: "Unmute", end: "End call", again: "Call again", home: "Back to home",
    micBlocked: "Your browser blocked the microphone. Allow it in the address bar, then start again.",
    failed: "The call couldn't connect. Try again in a moment.",
    notConfigured: "Calls aren't set up on this server yet.",
    signIn: "Sign in to talk to Continuity.",
    note: "Continuity is an AI assistant, not a medical professional. In a crisis, call or text 988.",
    help: "Ask about your refills, find a time that fits your week, or get support.",
  },
  es: {
    title: "Habla con Continuity", start: "Iniciar llamada", connecting: "Conectando…", ended: "Llamada terminada",
    listening: "Escuchando", thinking: "Pensando", speaking: "Hablando", waiting: "Entrando…",
    mute: "Silenciar", unmute: "Activar micrófono", end: "Colgar", again: "Llamar otra vez", home: "Volver al inicio",
    micBlocked: "Tu navegador bloqueó el micrófono. Permítelo en la barra de direcciones y vuelve a empezar.",
    failed: "No se pudo conectar la llamada. Inténtalo en un momento.",
    notConfigured: "Las llamadas aún no están configuradas en este servidor.",
    signIn: "Inicia sesión para hablar con Continuity.",
    note: "Continuity es un asistente de IA, no un profesional médico. En una crisis, llama o escribe al 988.",
    help: "Pregunta por tus resurtidos, busca un horario que te funcione o pide apoyo.",
  },
  zh: {
    title: "和 Continuity 说话", start: "开始通话", connecting: "正在连接…", ended: "通话已结束",
    listening: "正在听", thinking: "正在想", speaking: "正在说", waiting: "正在加入…",
    mute: "静音", unmute: "取消静音", end: "挂断", again: "再打一次", home: "返回首页",
    micBlocked: "浏览器阻止了麦克风。请在地址栏允许麦克风，然后重新开始。",
    failed: "通话无法连接，请稍后再试。",
    notConfigured: "这个服务器还没有设置通话功能。",
    signIn: "登录后才能和 Continuity 说话。",
    note: "Continuity 是 AI 助手，不是医疗专业人员。如果处于危机中，请拨打 988，可以要求普通话翻译。",
    help: "可以问续药的事、找适合你的时间，或寻求支持。",
  },
} as const;

type Phase = "idle" | "connecting" | "live" | "ended" | "error";

export default function CallPage() {
  const lang = useLang();
  const L = T[lang];
  const { me, state } = useMe();
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [agentState, setAgentState] = useState<string>("waiting");
  const [muted, setMuted] = useState(false);
  const [hasVideo, setHasVideo] = useState(false);
  const [secs, setSecs] = useState(0);
  const roomRef = useRef<any>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioBox = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (phase !== "live") return;
    const t = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [phase]);

  // Leave the room if the page closes
  useEffect(() => () => { roomRef.current?.disconnect(); }, []);

  async function start() {
    setError(null);
    setPhase("connecting");
    setSecs(0);
    setAgentState("waiting");
    try {
      const res = await fetch("/api/call/token", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ lang }),
      });
      if (res.status === 503) throw new Error("not_configured");
      if (!res.ok) throw new Error("token");
      const { url, token } = await res.json();

      const { Room, RoomEvent, Track } = await import("livekit-client");
      const room = new Room({ adaptiveStream: true, dynacast: true });
      roomRef.current = room;

      room.on(RoomEvent.TrackSubscribed, (track: any) => {
        if (track.kind === Track.Kind.Audio) {
          const el = track.attach();
          audioBox.current?.appendChild(el);
        } else if (track.kind === Track.Kind.Video && videoRef.current) {
          track.attach(videoRef.current);
          setHasVideo(true);
        }
      });
      room.on(RoomEvent.TrackUnsubscribed, (track: any) => { track.detach().forEach((el: HTMLElement) => el.remove?.()); });
      // LiveKit agents publish their state as a participant attribute
      room.on(RoomEvent.ParticipantAttributesChanged, (_changed: any, participant: any) => {
        const s = participant?.attributes?.["lk.agent.state"];
        if (s) setAgentState(s);
      });
      room.on(RoomEvent.Disconnected, () => { setPhase((p) => (p === "error" ? p : "ended")); setHasVideo(false); });

      await room.connect(url, token);
      await room.startAudio(); // inside the tap, so the agent's voice can play
      try {
        await room.localParticipant.setMicrophoneEnabled(true);
      } catch {
        setError(L.micBlocked);
        room.disconnect();
        setPhase("error");
        return;
      }
      setPhase("live");
    } catch (e) {
      setError(String((e as Error)?.message) === "not_configured" ? L.notConfigured : L.failed);
      roomRef.current?.disconnect();
      setPhase("error");
    }
  }

  async function toggleMute() {
    const room = roomRef.current;
    if (!room) return;
    await room.localParticipant.setMicrophoneEnabled(muted);
    setMuted(!muted);
  }

  function end() {
    roomRef.current?.disconnect();
    setPhase("ended");
  }

  const mm = String(Math.floor(secs / 60)).padStart(2, "0");
  const ss = String(secs % 60).padStart(2, "0");
  const status = phase === "connecting" ? L.connecting
    : phase === "live" ? `${(L as any)[agentState] ?? L.waiting} · ${mm}:${ss}`
    : phase === "ended" ? L.ended : "";

  if (state === "none") {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 bg-surface px-6">
        <p className="text-navy">{L.signIn}</p>
        <Link href="/" className="text-sm font-semibold text-brand">{L.home}</Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-surface px-6 pb-8 pt-6">
      <header className="mb-4 flex items-center justify-between">
        <Link href="/" className="text-sm font-semibold text-muted">{L.home}</Link>
        <p className="text-sm text-muted" aria-live="polite">{status}</p>
      </header>

      <h1 className="text-[22px] font-bold text-navy">{L.title}</h1>
      {me?.user.display_name && phase === "idle" && <p className="mt-1 text-sm text-muted">{L.help}</p>}

      {/* The agent's video (the mascot) once it arrives; a still mascot before that */}
      <div className="relative mt-6 aspect-[3/4] w-full overflow-hidden rounded-3xl bg-white">
        <video ref={videoRef} autoPlay playsInline muted className={`absolute inset-0 h-full w-full object-contain ${hasVideo ? "" : "hidden"}`} />
        {!hasVideo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src="/mascot-lavender.png" alt="" className={`absolute inset-0 m-auto h-2/3 w-2/3 object-contain ${phase === "connecting" ? "animate-pulse" : ""}`} />
        )}
        {phase === "live" && agentState === "speaking" && (
          <span className="absolute bottom-4 left-1/2 h-1.5 w-16 -translate-x-1/2 rounded-full bg-brand/70" aria-hidden />
        )}
      </div>
      <div ref={audioBox} className="hidden" />

      {error && <p className="mt-4 text-sm text-attn-text">{error}</p>}

      <div className="mt-auto pt-8">
        {phase === "live" || phase === "connecting" ? (
          <div className="flex items-center justify-center gap-6">
            <button onClick={toggleMute} disabled={phase !== "live"} aria-label={muted ? L.unmute : L.mute}
              className={`flex h-14 w-14 items-center justify-center rounded-full border ${muted ? "border-navy bg-navy text-white" : "border-line bg-white text-navy"} disabled:opacity-50`}>
              {muted ? <MicOffIcon size={22} /> : <MicIcon size={22} />}
            </button>
            <button onClick={end} aria-label={L.end}
              className="flex h-14 w-14 items-center justify-center rounded-full bg-coral text-white">
              <HangUpIcon size={24} />
            </button>
          </div>
        ) : (
          <button onClick={start} disabled={state !== "ready"}
            className="h-12 w-full rounded-full bg-navy text-[15px] font-bold text-white disabled:opacity-60">
            {phase === "ended" || phase === "error" ? L.again : L.start}
          </button>
        )}
        <p className="mt-4 text-center text-[11px] text-muted">{L.note}</p>
      </div>
    </main>
  );
}
