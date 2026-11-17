// app/call/page.tsx: "Talk to Continuity". First a screen that shows what Continuity can help with, then either a
// voice call in the browser or a typed chat with the same agent. The browser joins a LiveKit room; the token
// dispatches the Continuity agent (Gemini Live) with this user's id and the mode, so it reads their own plan.
// Typed messages go to the agent on the "lk.chat" topic; what's said comes back on "lk.transcription".
// Needs the livekit-client package (npm install livekit-client).
"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useLang } from "@/lib/i18n";
import { useMe } from "@/lib/useMe";
import { Scallop, inkBtn, outlineBtn, smallOutlineBtn, toneBg, type Tone } from "@/components/ui";
import { MicIcon, MicOffIcon, HangUpIcon, ArrowIcon } from "@/components/icons";

const T = {
  en: {
    title: "Talk to Continuity", intro: "Ask out loud or type. Continuity knows your plan and can update it for you.",
    canHelp: "What I can help with", tapToTry: "Tap one to start a chat with it",
    uses: [
      { title: "Where things stand", ex: "When do I run out?" },
      { title: "Save a visit", ex: "I booked therapy Wednesday at 8" },
      { title: "Refills", ex: "I picked up my refill" },
      { title: "Send it to my phone", ex: "Send me the booking link" },
      { title: "Practice a call", ex: "Help me ask for an earlier visit" },
      { title: "Support", ex: "I'm not doing great today" },
    ],
    voice: "Start a voice call", type: "Type instead",
    connecting: "Connecting…", ended: "Chat ended", listening: "Listening", thinking: "Thinking", speaking: "Speaking", waiting: "Joining…",
    mute: "Mute", unmute: "Unmute", end: "End", again: "Start again", home: "Home",
    placeholder: "Type a message", send: "Send", soundOn: "Sound on", soundOff: "Sound off", switchType: "Type instead", switchTalk: "Talk instead",
    micBlocked: "Your browser blocked the microphone. Allow it in the address bar, or type instead.",
    failed: "Couldn't connect. Try again in a moment.",
    notConfigured: "Calls aren't set up on this server yet.",
    signIn: "Sign in to talk to Continuity.",
    you: "You",
    note: "Continuity is an AI assistant, not a medical professional. In a crisis, call or text 988.",
  },
  es: {
    title: "Habla con Continuity", intro: "Habla o escribe. Continuity conoce tu plan y puede actualizarlo por ti.",
    canHelp: "En qué te puedo ayudar", tapToTry: "Toca una para empezar un chat",
    uses: [
      { title: "Cómo vas", ex: "¿Cuándo se me acaba?" },
      { title: "Guardar una cita", ex: "Agendé terapia el miércoles a las 8" },
      { title: "Resurtidos", ex: "Ya recogí mi resurtido" },
      { title: "Enviarlo a mi teléfono", ex: "Mándame el enlace para agendar" },
      { title: "Practicar una llamada", ex: "Ayúdame a pedir una cita antes" },
      { title: "Apoyo", ex: "Hoy no me siento bien" },
    ],
    voice: "Iniciar llamada de voz", type: "Escribir",
    connecting: "Conectando…", ended: "Chat terminado", listening: "Escuchando", thinking: "Pensando", speaking: "Hablando", waiting: "Entrando…",
    mute: "Silenciar", unmute: "Activar micrófono", end: "Terminar", again: "Empezar otra vez", home: "Inicio",
    placeholder: "Escribe un mensaje", send: "Enviar", soundOn: "Sonido sí", soundOff: "Sonido no", switchType: "Escribir", switchTalk: "Hablar",
    micBlocked: "Tu navegador bloqueó el micrófono. Permítelo en la barra de direcciones o escribe.",
    failed: "No se pudo conectar. Inténtalo en un momento.",
    notConfigured: "Las llamadas aún no están configuradas en este servidor.",
    signIn: "Inicia sesión para hablar con Continuity.",
    you: "Tú",
    note: "Continuity es un asistente de IA, no un profesional médico. En una crisis, llama o escribe al 988.",
  },
  zh: {
    title: "和 Continuity 聊聊", intro: "可以说话，也可以打字。Continuity 了解你的计划，还能帮你更新。",
    canHelp: "我可以帮你做什么", tapToTry: "点一个，用它开始聊天",
    uses: [
      { title: "现在的情况", ex: "我的药什么时候用完？" },
      { title: "保存一次就诊", ex: "我预约了周三晚上 8 点的心理治疗" },
      { title: "续药", ex: "我已经取到续药了" },
      { title: "发到我的手机", ex: "把预约链接发给我" },
      { title: "练习打电话", ex: "帮我练习要求更早的预约" },
      { title: "支持", ex: "我今天状态不太好" },
    ],
    voice: "开始语音通话", type: "改为打字",
    connecting: "正在连接…", ended: "聊天已结束", listening: "正在听", thinking: "正在想", speaking: "正在说", waiting: "正在加入…",
    mute: "静音", unmute: "取消静音", end: "结束", again: "重新开始", home: "首页",
    placeholder: "输入消息", send: "发送", soundOn: "开声音", soundOff: "关声音", switchType: "改为打字", switchTalk: "改为说话",
    micBlocked: "浏览器阻止了麦克风。请在地址栏允许，或改为打字。",
    failed: "无法连接，请稍后再试。",
    notConfigured: "这个服务器还没有设置通话功能。",
    signIn: "登录后才能和 Continuity 聊天。",
    you: "你",
    note: "Continuity 是 AI 助手，不是医疗专业人员。如果处于危机中，请拨打 988，可以要求普通话翻译。",
  },
} as const;
const USE_TONES: Tone[] = ["butter", "lavender", "mint", "peach", "blush", "white"];

type Phase = "idle" | "connecting" | "live" | "ended" | "error";
type Mode = "voice" | "text";
type Msg = { id: string; who: "agent" | "user"; text: string };

export default function CallPage() {
  const lang = useLang();
  const L = T[lang];
  const { state } = useMe();
  const [phase, setPhase] = useState<Phase>("idle");
  const [mode, setMode] = useState<Mode>("voice");
  const [error, setError] = useState<string | null>(null);
  const [agentState, setAgentState] = useState<string>("waiting");
  const [muted, setMuted] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [hasVideo, setHasVideo] = useState(false);
  const [secs, setSecs] = useState(0);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const roomRef = useRef<any>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioBox = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (phase !== "live") return;
    const t = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [phase]);
  useEffect(() => () => { roomRef.current?.disconnect(); }, []);
  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" }); }, [msgs]);
  // Agent voice on or off (typed chats start quiet)
  useEffect(() => {
    audioBox.current?.querySelectorAll("audio").forEach((el) => { (el as HTMLAudioElement).muted = !soundOn; });
  }, [soundOn]);

  // Add or grow a message (transcripts stream in pieces under one segment id)
  const upsert = (id: string, who: Msg["who"], text: string, append: boolean) =>
    setMsgs((list) => {
      const i = list.findIndex((m) => m.id === id);
      if (i < 0) return [...list, { id, who, text }];
      const next = [...list];
      next[i] = { ...next[i], text: append ? next[i].text + text : text };
      return next;
    });

  async function start(m: Mode, prefill = "") {
    setMode(m);
    setError(null);
    setPhase("connecting");
    setSecs(0);
    setMsgs([]);
    setDraft(prefill);
    setAgentState("waiting");
    setSoundOn(m === "voice");
    try {
      const res = await fetch("/api/call/token", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ lang, mode: m }),
      });
      if (res.status === 503) throw new Error("not_configured");
      if (!res.ok) throw new Error("token");
      const { url, token } = await res.json();

      const { Room, RoomEvent, Track } = await import("livekit-client");
      const room = new Room({ adaptiveStream: true, dynacast: true });
      roomRef.current = room;

      room.on(RoomEvent.TrackSubscribed, (track: any) => {
        if (track.kind === Track.Kind.Audio) {
          const el = track.attach() as HTMLAudioElement;
          el.muted = m !== "voice";
          audioBox.current?.appendChild(el);
        } else if (track.kind === Track.Kind.Video && videoRef.current) {
          track.attach(videoRef.current);
          setHasVideo(true);
        }
      });
      room.on(RoomEvent.TrackUnsubscribed, (track: any) => { track.detach().forEach((el: HTMLElement) => el.remove?.()); });
      room.on(RoomEvent.ParticipantAttributesChanged, (_changed: any, participant: any) => {
        const s = participant?.attributes?.["lk.agent.state"];
        if (s) setAgentState(s);
      });
      room.on(RoomEvent.Disconnected, () => { setPhase((p) => (p === "error" ? p : "ended")); setHasVideo(false); });

      // What's said, as text: the agent's replies and (in voice calls) the caller's own words
      room.registerTextStreamHandler("lk.transcription", async (reader: any) => {
        const attrs = reader.info?.attributes ?? {};
        const id = attrs["lk.segment_id"] ?? reader.info?.id ?? String(Math.random());
        const mine = new Set([...room.localParticipant.trackPublications.values()].map((p: any) => p.trackSid));
        const who: Msg["who"] = mine.has(attrs["lk.transcribed_track_id"]) ? "user" : "agent";
        for await (const chunk of reader) upsert(id, who, chunk, true);
      });

      await room.connect(url, token);
      await room.startAudio();
      if (m === "voice") {
        try {
          await room.localParticipant.setMicrophoneEnabled(true);
        } catch {
          setError(L.micBlocked);
          setMode("text");
        }
      }
      setPhase("live");
    } catch (e) {
      setError(String((e as Error)?.message) === "not_configured" ? L.notConfigured : L.failed);
      roomRef.current?.disconnect();
      setPhase("error");
    }
  }

  async function send() {
    const text = draft.trim();
    const room = roomRef.current;
    if (!text || !room) return;
    setDraft("");
    upsert(`me-${Date.now()}`, "user", text, false);
    try { await room.localParticipant.sendText(text, { topic: "lk.chat" }); } catch { setError(L.failed); }
  }

  async function toggleMute() {
    const room = roomRef.current;
    if (!room) return;
    await room.localParticipant.setMicrophoneEnabled(muted);
    setMuted(!muted);
  }

  async function switchMode() {
    const room = roomRef.current;
    if (!room) return;
    if (mode === "voice") {
      await room.localParticipant.setMicrophoneEnabled(false);
      setMode("text");
    } else {
      try { await room.localParticipant.setMicrophoneEnabled(true); setMuted(false); setSoundOn(true); setMode("voice"); }
      catch { setError(L.micBlocked); }
    }
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
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 bg-canvas px-6">
        <p className="text-navy">{L.signIn}</p>
        <Link href="/" className={smallOutlineBtn}>{L.home}</Link>
      </main>
    );
  }

  const header = (
    <header className="mb-5 flex items-center justify-between gap-3">
      <Link href="/" className={smallOutlineBtn}>{L.home}</Link>
      <p className="text-[13px] font-semibold text-muted" aria-live="polite">{status}</p>
    </header>
  );

  // ---- Before the call: what Continuity can do, and how to start
  if (phase === "idle" || phase === "error" || phase === "ended") {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-canvas px-6 pb-8 pt-8">
        {header}
        <div className="mb-6 flex items-center gap-4">
          <Scallop size={92} tone="lavender">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/mascot-lavender.png" alt="" className="mascot-float h-[66px] w-[66px] object-contain" />
          </Scallop>
          <div>
            <h1 className="font-display text-[30px] font-semibold leading-[1.05] text-navy">{L.title}</h1>
            <p className="mt-1.5 text-[14px] leading-snug text-muted">{L.intro}</p>
          </div>
        </div>

        <h2 className="font-display text-[22px] font-semibold text-navy">{L.canHelp}</h2>
        <p className="mb-3 text-[13px] text-muted">{L.tapToTry}</p>
        <div className="mb-6 grid grid-cols-2 gap-2.5">
          {L.uses.map((u, i) => (
            <button key={u.title} type="button" onClick={() => start("text", u.ex)}
              className={`flex min-h-[112px] flex-col justify-between rounded-[24px] p-4 text-left transition hover:brightness-[0.97] ${toneBg[USE_TONES[i]]}`}>
              <span className="font-display text-[17px] font-semibold leading-tight text-navy">{u.title}</span>
              <span className="mt-2 text-[13px] leading-snug text-navy/75">“{u.ex}”</span>
            </button>
          ))}
        </div>

        {error && <p className="mb-3 rounded-2xl bg-rose px-4 py-3 text-sm font-semibold text-navy">{error}</p>}
        {phase === "ended" && msgs.length > 0 && (
          <div className="mb-4 max-h-56 space-y-2 overflow-y-auto rounded-[24px] bg-white p-4 text-[14px]">
            {msgs.map((m) => <p key={m.id} className={m.who === "user" ? "text-right text-navy" : "text-navy/80"}>{m.text}</p>)}
          </div>
        )}
        <div className="mt-auto flex flex-col gap-2.5">
          <button onClick={() => start("voice")} disabled={state !== "ready"} className={`${inkBtn} h-14 w-full text-[16px]`}>
            <MicIcon size={20} />{phase === "idle" ? L.voice : L.again}
          </button>
          <button onClick={() => start("text")} disabled={state !== "ready"} className={`${outlineBtn} h-14 w-full text-[16px]`}>{L.type}</button>
          <p className="mt-2 text-center text-[12px] text-muted">{L.note}</p>
        </div>
        <div ref={audioBox} className="hidden" />
      </main>
    );
  }

  // ---- During: voice (mascot + captions) or typed chat
  return (
    <main className="mx-auto flex h-dvh w-full max-w-md flex-col bg-canvas px-6 pb-6 pt-8">
      {header}

      {mode === "voice" ? (
        <div className="relative w-full shrink-0 overflow-hidden rounded-[30px] bg-lavender" style={{ aspectRatio: "4 / 3.4" }}>
          <video ref={videoRef} autoPlay playsInline muted className={`absolute inset-0 h-full w-full object-contain ${hasVideo ? "" : "hidden"}`} />
          {!hasVideo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src="/mascot-lavender.png" alt="" className={`absolute inset-0 m-auto h-2/3 w-2/3 object-contain ${phase === "connecting" ? "animate-pulse" : "mascot-float"}`} />
          )}
          {phase === "live" && agentState === "speaking" && (
            <span className="absolute bottom-4 left-1/2 h-1.5 w-16 -translate-x-1/2 rounded-full bg-navy/60" aria-hidden />
          )}
        </div>
      ) : (
        <div className="mb-1 flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/mascot-lavender.png" alt="" className="h-12 w-12 object-contain" />
          <h1 className="font-display text-[24px] font-semibold text-navy">{L.title}</h1>
        </div>
      )}

      {/* Conversation: captions in a voice call, the chat itself when typing */}
      <div ref={listRef} className={`mt-4 flex-1 space-y-2.5 overflow-y-auto ${mode === "voice" ? "max-h-48" : ""}`} aria-live="polite">
        {msgs.map((m) => (
          <div key={m.id} className={`flex ${m.who === "user" ? "justify-end" : "justify-start"}`}>
            <p className={`max-w-[85%] whitespace-pre-wrap rounded-3xl px-4 py-2.5 text-[15px] leading-snug ${m.who === "user" ? "rounded-br-lg bg-navy text-white" : "rounded-bl-lg bg-white text-navy"}`}>{m.text}</p>
          </div>
        ))}
      </div>
      <div ref={audioBox} className="hidden" />
      {error && <p className="mt-3 rounded-2xl bg-rose px-4 py-2.5 text-sm font-semibold text-navy">{error}</p>}

      <div className="mt-4 shrink-0">
        {mode === "text" && (
          <form className="mb-3 flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); send(); }}>
            <label className="sr-only" htmlFor="chat-input">{L.placeholder}</label>
            <textarea id="chat-input" rows={1} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={L.placeholder}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              className="max-h-32 min-h-[52px] flex-1 resize-none rounded-[26px] border border-line bg-white px-5 py-3.5 text-[15px] text-navy outline-none focus:border-navy" />
            <button type="submit" disabled={phase !== "live" || !draft.trim()} aria-label={L.send}
              className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full bg-navy text-white disabled:opacity-50">
              <ArrowIcon size={22} />
            </button>
          </form>
        )}
        <div className="flex flex-wrap items-center justify-center gap-2.5">
          {mode === "voice" ? (
            <button onClick={toggleMute} disabled={phase !== "live"} aria-label={muted ? L.unmute : L.mute}
              className={`flex h-14 w-14 items-center justify-center rounded-full border-[1.5px] border-navy ${muted ? "bg-navy text-white" : "bg-white text-navy"} disabled:opacity-50`}>
              {muted ? <MicOffIcon size={22} /> : <MicIcon size={22} />}
            </button>
          ) : (
            <button onClick={() => setSoundOn(!soundOn)} className={smallOutlineBtn}>{soundOn ? L.soundOff : L.soundOn}</button>
          )}
          <button onClick={switchMode} disabled={phase !== "live"} className={smallOutlineBtn}>{mode === "voice" ? L.switchType : L.switchTalk}</button>
          <button onClick={end} aria-label={L.end} className="flex h-14 w-14 items-center justify-center rounded-full bg-coral text-white">
            <HangUpIcon size={24} />
          </button>
        </div>
      </div>
    </main>
  );
}
