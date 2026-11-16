import { fileURLToPath } from 'node:url';
import { AutoSubscribe, defineAgent, llm, voice } from '@livekit/agents';
import * as google from '@livekit/agents-plugin-google';
import { z } from 'zod';
import { runAgent } from './chert-rooms.mjs';
import { startAvatar } from './avatar.mjs';
import { instructions } from './persona.mjs'; // shared with iMessage

// Gemini Live: one model that listens and speaks.
const RealtimeModel = google.beta?.realtime?.RealtimeModel ?? google.realtime?.RealtimeModel;

// Continuity's web app (local while testing, the Vercel URL when live) + the shared secret for /api/agent/*
const API = (process.env.CONTINUITY_API_URL || 'http://localhost:3000').replace(/\/$/, '');
const AGENT_KEY = process.env.AGENT_API_KEY || '';
// Who is calling. Web calls (the "Talk to Continuity" button) carry the signed-in user's id in the job metadata.
// A call without a signed-in user (none in the app today) only gets general help: no care plan, no saving visits.
const FALLBACK_USER_ID = Number(process.env.CONTINUITY_USER_ID || 0) || null;
function callInfo(ctx) {
  try {
    const m = JSON.parse(ctx.job?.metadata || '{}');
    if (Number.isInteger(m.userId) && m.userId > 0) return { userId: m.userId, channel: m.channel || 'web', lang: LANG_NAMES[m.lang] ? m.lang : 'en', name: m.name || null };
  } catch { /* not JSON: a Chert call */ }
  return { userId: FALLBACK_USER_ID, channel: 'other', lang: null, name: null };
}

async function api(path, init = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', 'x-agent-key': AGENT_KEY, ...(init.headers || {}) },
  });
  if (!res.ok) throw new Error(`Continuity API ${res.status}`);
  return res.json();
}

// Continuity's personality (Ivy owns this wording; keep replies short, it's a phone call).


// Session-close event name (enum in @livekit/agents 1.x, plain string as a fallback).
const CLOSE_EVENT = voice.AgentSessionEventTypes?.Close ?? 'close';
const STATE_EVENT = voice.AgentSessionEventTypes?.AgentStateChanged ?? 'agent_state_changed';
const USER_STATE_EVENT = voice.AgentSessionEventTypes?.UserStateChanged ?? 'user_state_changed';
// Used only after an automatic reconnect.
const RESUME_NOTE = "\n\nNote: the audio connection just dropped for a moment and you reconnected in the middle of this call.";
const RESUME_LINE = "Say one short sentence: 'Sorry, I lost you for a second. Could you say that again?' In Spanish if the caller was speaking Spanish.";

// Languages the app offers (codes match web/lib/copy.ts LANGS)
const LANG_NAMES = { en: 'English', es: 'Spanish', zh: 'Mandarin Chinese' };

// Web calls: the person already picked their language in the app. Hold to it for the whole call.
function languageLock(lang) {
  const name = LANG_NAMES[lang] || 'English';
  const crisis = lang === 'zh'
    ? "\n- Crisis lines: 988 counselors speak English and Spanish. For Mandarin, tell them to call 988 and say \"Mandarin\" to get a free interpreter (phone calls only, not texts). 911 also provides interpreters."
    : '';
  return `\n\nLanguage for this call (this overrides the Language section above)
- The person chose ${name} in the Continuity app. Speak only ${name} for the entire call: greetings, questions, dates, numbers and safety lines.
- Do not ask which language they want. Do not switch because of a single word, a name or an accent.
- Switch only if they clearly ask you to (for example "can we talk in Spanish?"), then stay in the new language.${crisis}`;
}

const webGreeting = (lang) => lang === 'zh'
  ? "用平静、温和、缓慢的语气说普通话。先不要调用任何工具：使用你已经拿到的照护状态。用对方的名字打招呼，说明你是 AI 助手，不是医生或护士，然后问对方需要什么帮助。如果有紧急的事，提出先处理那件事。"
  : lang === 'es'
  ? "Habla en voz baja y con calma. No llames a ninguna herramienta todavía: usa el estado de atención que ya tienes. Saluda por su nombre en español, di que eres una asistente de IA, no médica ni enfermera, y pregunta en qué le puedes ayudar. Si algo es urgente, ofrece empezar por ahí. Puede cambiar a inglés cuando quiera."
  : "Speak softly and calmly. Don't call any tools yet: use the care status you already have. Greet them by name in English, say you're an AI assistant, not a doctor or a nurse, and ask what they'd like help with. If something is urgent, offer to start there. They can switch to Spanish any time.";

function makeTools(USER_ID) {
  return {
    get_care_status: llm.tool({
      description: "Get the caller's care plan: days of medication left, when they must book their next psychiatry visit, therapy timing, and upcoming appointments.",
      parameters: z.object({}),
      execute: async () => (USER_ID ? api(`/api/agent/status?userId=${USER_ID}`) : { signed_in: false, note: 'No care plan on this call. Offer general help and find_support.' }),
    }),
    find_support: llm.tool({
      description: "Find the best-fit help line for what the caller describes (Typesense search over a vetted list: 988, 911, Poison Control, Crisis Text Line, Trevor Project, Emory CAPS and on-call lines). Crisis-related needs always return 988 first.",
      parameters: z.object({
        what_they_need: z.string().describe('the caller\'s situation in a few words, e.g. "wants to die", "ran out of meds on a weekend", "LGBTQ and scared", "prefers texting", "friend took too many pills"'),
        spanish: z.boolean().optional().describe('true if the caller is speaking Spanish'),
      }),
      execute: async ({ what_they_need, spanish }) => {
        const res = await fetch(`${API}/api/support?${new URLSearchParams({ q: what_they_need, lang: spanish ? 'es' : 'en', student: '1', limit: '3' })}`);
        const data = await res.json().catch(() => ({ resources: [] }));
        return {
          crisis: data.crisis,
          resources: (data.resources || []).map((r) => ({ name: spanish ? r.name_es : r.name, how: spanish ? r.how_es : r.how, open_24_7: r.available_24_7 })),
        };
      },
    }),
    add_visit: llm.tool({
      description: "Save a visit the caller says they already booked (with their therapist or psychiatrist, on Zocdoc, Grow, by phone, anywhere). It goes in the app and on their Google Calendar. Use today's date from get_care_status to turn \"Tuesday at 4\" into a date. Repeat back the day and time first, then call this when they say yes.",
      parameters: z.object({
        role: z.enum(['therapist', 'psychiatrist']).describe('therapist for therapy/counseling, psychiatrist for medication visits'),
        who: z.string().optional().describe("the provider's name if they said it, e.g. \"Dr. Holt\""),
        date: z.string().describe('YYYY-MM-DD'),
        time: z.string().describe('24-hour HH:MM, Eastern time, e.g. "16:00"'),
        length_minutes: z.number().optional().describe('only if they said; default 50'),
        video: z.boolean().optional().describe('true for a video visit'),
        repeat_every_weeks: z.number().optional().describe('1 for weekly, 2 for every two weeks; leave out for a one-time visit'),
      }),
      execute: async ({ role, who, date, time, length_minutes, video, repeat_every_weeks }) => {
        if (!USER_ID) return { added: false, say: 'Say you can only save visits for people signed in to the Continuity app, and they can add it under My care.' };
        try {
          return await api('/api/agent/visits', { method: 'POST', body: JSON.stringify({ userId: USER_ID, role, who, date, time, durationMin: length_minutes, video, repeatEveryWeeks: repeat_every_weeks }) });
        } catch {
          return { added: false, say: "Say you couldn't save it just now, and they can add it in the app under My care." };
        }
      },
    }),
  };
}

const agent = defineAgent({
  entry: async ctx => {
    await ctx.connect(undefined, AutoSubscribe.AUDIO_ONLY);
    const call = callInfo(ctx);
    const USER_ID = call.userId;
    // Fetch the caller's status while waiting for the caller (no delay once they join), so the greeting needs no tool call (early tool calls trip Gemini's 1007)
    let statusNote = '';
    try {
      if (!USER_ID) throw new Error('no signed-in user on this call');
      const st = await api(`/api/agent/status?userId=${USER_ID}`, { signal: AbortSignal.timeout(4000) });
      statusNote = `\n\nThe caller's care status, already fetched for you (use it for the greeting; call get_care_status only if they ask for an update later): ${JSON.stringify(st)}`;
      console.log('[continuity] status prefetched for user', USER_ID);
      if (!call.lang && LANG_NAMES[st?.preferred_language]) call.lang = st.preferred_language;
    } catch (e) { console.warn('[continuity] could not prefetch status', e?.message || e); }
    // Join promptly, but wait for a caller before opening a paid model session.
    const caller = await ctx.waitForParticipant();
    const startedAt = Date.now();
    const chertCallId = call.channel === 'web' ? `web-${ctx.room.name}` : caller.identity.replace(/^chert-bridge-/, '');
    console.log(`[continuity] ${call.channel} call for user ${USER_ID}`);

    // Tools are made once per call, so "option 2" still means the same slot after a reconnect.
    const tools = makeTools(USER_ID);
    const MAX_RECONNECTS = 3;
    let reconnects = 0;
    let shuttingDown = false;
    let session = null;
    let speaking = false; // drives the mascot's talking animation on FaceTime Video

    // ---- Guardrails so the caller never sits in silence ----
    // a) A tool that fails returns a sentence to say instead of throwing (a thrown tool left the agent silent).
    // b) After any tool finishes, if Continuity hasn't started talking within 3.5 s, make it say the result.
    // c) If both sides are quiet for 9 s after Continuity spoke, check in gently (twice at most, Ivy's script).
    let agentState = 'initializing', userState = 'listening';
    let greeted = false, lastSpeechEnd = Date.now(), nudges = 0;
    let pendingTool = null; // { name, result, doneAt }
    for (const [name, t] of Object.entries(tools)) {
      if (typeof t?.execute !== 'function') continue;
      const run = t.execute.bind(t);
      try {
        t.execute = async (...args) => {
          let result;
          try { result = await run(...args); }
          catch (e) {
            console.warn(`[guard] ${name} failed:`, e?.message || e);
            result = { ok: false, say: "Say: Sorry, I couldn't get that just now. Want me to try again?" };
          }
          pendingTool = { name, result, doneAt: Date.now() };
          return result;
        };
      } catch { /* tool object not writable: keep the original */ }
    }
    const say = (instructions) => { try { session?.generateReply({ instructions }); } catch (e) { console.warn('[guard] generateReply failed', e?.message || e); } };
    const watchdog = setInterval(() => {
      const now = Date.now();
      if (pendingTool && agentState !== 'speaking' && now - pendingTool.doneAt > 3500) {
        const { name, result } = pendingTool;
        pendingTool = null;
        console.log(`[guard] no reply after ${name}; prompting the agent to say the result`);
        say(`You just ran ${name} and haven't told the caller the result yet. Say it now in one or two short, calm sentences, in the caller's language, then ask the next question. Result: ${JSON.stringify(result).slice(0, 1500)}`);
        lastSpeechEnd = now;
        return;
      }
      if (greeted && !pendingTool && agentState === 'listening' && userState !== 'speaking' && now - lastSpeechEnd > 9000 && nudges < 2) {
        nudges += 1;
        lastSpeechEnd = now;
        console.log(`[guard] silence check-in ${nudges}/2`);
        say(nudges === 1
          ? "The caller has been quiet. Gently say, in their language: 'Take your time. I'm still here.' Then repeat your last question in fewer words. Never book anything without a clear yes."
          : "Still quiet. Say once, softly, in their language: 'No rush. I'll be right here whenever you're ready.' Then wait without asking anything else.");
      }
    }, 500);
    ctx.addShutdownCallback(async () => clearInterval(watchdog));

    const callerStillHere = () => ctx.room.remoteParticipants?.has?.(caller.identity) ?? true;

    // Gemini Live sometimes drops a session mid-call (error 1007, CONTENT_TYPE_AUDIO). Instead of
    // going silent, open a fresh session in the same room and pick the conversation back up.
    async function openSession({ resumed }) {
      const s = new voice.AgentSession({
        llm: new RealtimeModel({
          apiKey: process.env.GOOGLE_API_KEY,
          model: process.env.GEMINI_MODEL || 'gemini-2.5-flash-native-audio-preview-12-2025',
          // Calm, warm voice (try Achernar = soft, Vindemiatrix = gentle; Aoede was the old, brighter one)
        voice: process.env.GEMINI_VOICE || 'Sulafat',
        }),
      });

      s.on(STATE_EVENT, ev => {
        if (s !== session) return;
        const prev = agentState;
        agentState = ev?.newState ?? agentState;
        speaking = agentState === 'speaking';
        if (prev !== agentState) console.log(`[state] agent ${prev} -> ${agentState}`); // mouth moves while 'speaking'
        if (speaking) { greeted = true; pendingTool = null; }
        if (prev === 'speaking' && !speaking) lastSpeechEnd = Date.now();
      });
      s.on(USER_STATE_EVENT, ev => {
        if (s !== session) return;
        userState = ev?.newState ?? userState;
        if (userState === 'speaking') { nudges = 0; lastSpeechEnd = Date.now(); }
        else lastSpeechEnd = Date.now();
      });
      s.on(CLOSE_EVENT, async ev => {
        if (s !== session || shuttingDown) return;
        const reason = String(ev?.reason ?? '');
        if (reason !== 'error' || !callerStillHere()) return;
        if (reconnects >= MAX_RECONNECTS) { console.error('[continuity] Gemini dropped again; giving up after', reconnects, 'reconnects'); return; }
        reconnects += 1;
        console.warn(`[continuity] Gemini session dropped (${ev?.error?.error?.body?.code ?? 'unknown'}); reconnecting ${reconnects}/${MAX_RECONNECTS}`);
        try {
          session = await openSession({ resumed: true });
        } catch (e) {
          console.error('[continuity] reconnect failed', e);
        }
      });

      if (resumed) { try { ctx.room.unregisterByteStreamHandler('lk.agent.session'); } catch {} }
      await s.start({
        room: ctx.room,
        agent: new voice.Agent({ instructions: instructions + statusNote + languageLock(call.lang) + (resumed ? RESUME_NOTE : ''), tools }),
        record: false,
        inputOptions: {
          participantIdentity: caller.identity,
          audioEnabled: true,
          videoEnabled: false,
          textEnabled: false,
          closeOnDisconnect: true,
          deleteRoomOnClose: false,
        },
        outputOptions: { audioEnabled: true, transcriptionEnabled: false },
      });
      if (resumed) s.generateReply({ instructions: RESUME_LINE });
      return s;
    }

    ctx.addShutdownCallback(async () => { shuttingDown = true; await session?.close(); });
    // Log every call to Tiger's call_log hypertable (never blocks the call)
    ctx.addShutdownCallback(async () => {
      try {
        await api('/api/agent/calls', {
          method: 'POST',
          body: JSON.stringify({ chertCallId, userId: USER_ID, durationSec: Math.round((Date.now() - startedAt) / 1000), outcome: reconnects ? `ended_after_${reconnects}_reconnects` : 'ended' }),
        });
      } catch { /* logging is best-effort */ }
    });

    // Show Continuity on FaceTime Video before the session starts (like Chert's video-agent example),
    // so the face is ready when FaceTime is. Never let video break the call.
    try {
      const stopAvatar = await startAvatar(ctx.room, () => speaking);
      ctx.addShutdownCallback(async () => stopAvatar());
    } catch (e) {
      console.warn('[avatar] could not publish video, continuing audio-only:', e?.message || e);
    }
    session = await openSession({ resumed: false });
    // The caller is connected and listening: greet right away, in the language they picked in the app
    session.generateReply({ instructions: webGreeting(call.lang) });
  },
});

export default agent;

runAgent(agent, { file: fileURLToPath(import.meta.url), agentName: process.env.AGENT_NAME || 'continuity-agent' });
