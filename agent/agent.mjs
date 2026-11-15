import { fileURLToPath } from 'node:url';
import { AutoSubscribe, defineAgent, llm, voice } from '@livekit/agents';
import * as google from '@livekit/agents-plugin-google';
import { z } from 'zod';
import { runAgent } from './chert-rooms.mjs';
import { greetOnBridgeReady } from './greet.mjs';

// Gemini Live: one model that listens and speaks.
const RealtimeModel = google.beta?.realtime?.RealtimeModel ?? google.realtime?.RealtimeModel;

// Continuity's web app (local while testing, the Vercel URL for the demo) + the shared secret for /api/agent/*
const API = (process.env.CONTINUITY_API_URL || 'http://localhost:3000').replace(/\/$/, '');
const AGENT_KEY = process.env.AGENT_API_KEY || '';
// Who is calling. Chert doesn't tell us the caller's account yet, so the demo uses one user (Maya).
const USER_ID = Number(process.env.CONTINUITY_USER_ID || 1);

async function api(path, init = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', 'x-agent-key': AGENT_KEY, ...(init.headers || {}) },
  });
  if (!res.ok) throw new Error(`Continuity API ${res.status}`);
  return res.json();
}

// Continuity's personality (Ivy owns this wording; keep replies short, it's a phone call).
const instructions = `You are Continuity, a calm, kind AI care assistant speaking over FaceTime.
You help people stay ahead of their mental-health care: knowing when to book psychiatry or therapy visits,
keeping medication refills on time, and finding in-network appointments that fit their schedule.

How to work:
- At the start of every call, use get_care_status before giving any dates. Never guess dates or appointments.
- To find appointments, use find_appointments. If the caller describes who they want in their own words
  ("a counselor", "someone for my ADHD meds", "una terapeuta", a provider's name), pass those 1-3 key words
  as in_their_words. Every option it returns is in-network for the caller's
  insurance plan. Offer option 1 first (provider, day and time, video or in person, and that they take
  the caller's plan by name); mention option 2 only if they want something else.
  Say these are example openings in a demo.
- Before you call find_appointments or book_appointment, say one short line first, like "One sec, I'm checking."
- You send appointment requests; the provider's office confirms. Ask once: "Want me to request that time?"
  The moment the caller agrees (yes, sure, do it, that works, okay), call book_appointment right away
  with that option_number. Do not ask again, do not wait.
- After book_appointment returns, say in one or two sentences: the request for (provider, day, time) is sent
  and that time is held for them; the office will confirm and check their coverage with their member ID.
  Never say "you're booked" or "confirmed". If it says the time was taken, offer the next option.
- Never ask for a member ID, insurance card, date of birth or other ID numbers. Continuity only uses
  the plan name; the office handles the rest.
- Use plain words: "Monday, November sixteenth at nine AM", never IDs or codes.
- Language: reply in the language the caller speaks (English or Spanish). If they speak Spanish, keep
  speaking Spanish, and if they want a Spanish-speaking provider, pass language: "Spanish" to find_appointments.

Style and safety:
- One or two short, plain sentences per reply. Ask one question at a time.
- Supportive, never blaming: "your next visit isn't booked yet", not "you forgot".
- You are an AI assistant, not a doctor or nurse. Never diagnose, never give dosing or medication advice,
  never promise a prescription will be renewed. For medical questions, suggest talking to their provider.
- If someone sounds like they are in crisis, tell them they can call or text 988 any time, right now.
- Don't say medication names out loud unless the caller says them first; say "your medication".`;

// Session-close event name (enum in @livekit/agents 1.x, plain string as a fallback).
const CLOSE_EVENT = voice.AgentSessionEventTypes?.Close ?? 'close';
// Used only after an automatic reconnect.
const RESUME_NOTE = "\n\nNote: the audio connection just dropped for a moment and you reconnected in the middle of this call. Any appointment options you listed earlier are still valid by their option number.";
const RESUME_LINE = "Say one short sentence: 'Sorry, I lost you for a second. Could you say that again?' In Spanish if the caller was speaking Spanish.";
const greeting = "Greet the caller by name if you know it, in one short sentence: say you are Continuity, an AI care assistant, and ask how you can help with their care today. Add: 'También hablo español.'";

// Tools are built per call so each call remembers the options it offered ("option 1" -> slot_id).
function makeTools() {
  let lastOptions = [];
  return {
    get_care_status: llm.tool({
      description: "Get the caller's care plan: days of medication left, when they must book their next psychiatry visit, therapy timing, and upcoming appointments.",
      parameters: z.object({}),
      execute: async () => api(`/api/agent/status?userId=${USER_ID}`),
    }),
    find_appointments: llm.tool({
      description: 'Find in-network openings before the caller\'s deadline, soonest first. Returns numbered options (1, 2, 3).',
      parameters: z.object({
        provider_type: z.enum(['psychiatrist', 'therapist']).describe('psychiatrist for medication visits, therapist for therapy'),
        video_only: z.boolean().optional().describe('true if the caller only wants video visits'),
        language: z.string().optional().describe('e.g. "Spanish" if they want a provider who speaks it'),
        in_their_words: z.string().optional().describe('1 to 3 key words the caller used for who they want, in their own language, e.g. "counselor", "shrink", "ADHD", "terapeuta", "Dr. Park". Leave out if they only said therapist or psychiatrist.'),
      }),
      execute: async ({ provider_type, video_only, language, in_their_words }) => {
        const qs = new URLSearchParams({ userId: String(USER_ID), type: provider_type });
        if (video_only) qs.set('telehealth', '1');
        if (language) qs.set('language', language);
        if (in_their_words) qs.set('q', in_their_words);
        const data = await api(`/api/agent/slots?${qs}`);
        lastOptions = data.options || [];
        return {
          deadline: data.deadline,
          note: data.note,
          ...(data.searched_for ? { searched_for: data.searched_for, matched_their_words: data.matched_their_words } : {}),
          options: lastOptions.map((o, i) => ({
            option_number: i + 1, provider: o.provider, specialty: o.specialty, when: o.when, video_visit: o.video_visit,
          })),
        };
      },
    }),
    book_appointment: llm.tool({
      description: 'Send an appointment request for one of the options from find_appointments (holds the time; the office confirms and checks coverage). Call this immediately when the caller agrees.',
      parameters: z.object({ option_number: z.number().describe('1, 2 or 3, from find_appointments') }),
      execute: async ({ option_number }) => {
        const option = lastOptions[Number(option_number) - 1];
        if (!option) return { booked: false, reason: 'unknown_option', hint: 'Call find_appointments first.' };
        return api('/api/agent/book', { method: 'POST', body: JSON.stringify({ userId: USER_ID, slotId: option.slot_id }) });
      },
    }),
  };
}

const agent = defineAgent({
  entry: async ctx => {
    await ctx.connect(undefined, AutoSubscribe.AUDIO_ONLY);
    // Join promptly, but wait for a caller before opening a paid model session.
    const caller = await ctx.waitForParticipant();
    const startedAt = Date.now();
    const chertCallId = caller.identity.replace(/^chert-bridge-/, '');

    // Tools are made once per call, so "option 2" still means the same slot after a reconnect.
    const tools = makeTools();
    const MAX_RECONNECTS = 3;
    let reconnects = 0;
    let shuttingDown = false;
    let session = null;

    const callerStillHere = () => ctx.room.remoteParticipants?.has?.(caller.identity) ?? true;

    // Gemini Live sometimes drops a session mid-call (error 1007, CONTENT_TYPE_AUDIO). Instead of
    // going silent, open a fresh session in the same room and pick the conversation back up.
    async function openSession({ resumed }) {
      const s = new voice.AgentSession({
        llm: new RealtimeModel({
          apiKey: process.env.GOOGLE_API_KEY,
          model: process.env.GEMINI_MODEL || 'gemini-2.5-flash-native-audio-preview-12-2025',
          voice: 'Aoede',
        }),
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

      await s.start({
        room: ctx.room,
        agent: new voice.Agent({ instructions: resumed ? instructions + RESUME_NOTE : instructions, tools }),
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

    session = await openSession({ resumed: false });
    // Greet once when Chert reports FaceTime is ready (the call ends if silent for 10 s after that).
    const stopGreeting = greetOnBridgeReady(ctx.room, () => session.generateReply({ instructions: greeting }));
    ctx.addShutdownCallback(async () => stopGreeting());
  },
});

export default agent;

runAgent(agent, { file: fileURLToPath(import.meta.url), agentName: process.env.AGENT_NAME || 'continuity-agent' });
