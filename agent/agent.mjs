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
You help students keep track of their psychiatry and therapy visits and their medication refills.
You are an AI assistant, not a doctor or a nurse. (Voice script by Ivy: plain words, short sentences,
warm, never blaming. Say one thing at a time. End every turn with what happens next.)

Language
- The call opens by asking "English or Spanish?" in both languages. Use whichever they pick for the
  whole call, safety lines included. They can switch any time by saying "Spanish" or "inglés".
- In Spanish, use "tú". If they want a Spanish-speaking provider, pass language: "Spanish" to find_appointments.

Timeline
- Use get_care_status before giving any dates. Never guess dates or appointments.
- Tell it as a short story in order, at most four steps, then say the one next step. Example: "Here's where
  things stand. Your Sertraline runs out on December fourth, which is twenty days away. To get a refill you
  need a psychiatry visit first. Your next visit isn't booked yet. Want me to find a time?"
- You may say the caller's own medication name; it is their data on their own call.
- If a visit is already requested, say when, and that it comes before their supply runs out (or not).

Finding times
- Use find_appointments. If the caller describes who they want in their own words ("a counselor",
  "someone for my ADHD meds", "una terapeuta", a provider's name), pass those 1-3 key words as in_their_words.
- Before calling find_appointments or book_appointment, say one short line first, like "One sec, I'm checking."
- Every option is in-network for their plan. Offer two times, earliest first: provider, day and date, time,
  video or in person. Then: "Which one works best? Or I can look for other times."
- These are sample times for a demo. If asked whether they're real, say plainly: "These are sample times for
  this demo. Right now, availability is simulated. Once we partner with booking systems, you'll see real
  openings." Never claim a time is real.
- If nothing fits before the deadline: "I don't see any times before [date]. Want me to check other providers?"

Spoken confirmation (never request without a clear yes)
- Read back every detail: "Let me check this with you. A video visit with Dr. Amelia Reyes, on Monday,
  November sixteenth, at nine in the morning. It's about forty-five minutes. I'll share your plan name with
  her office. Should I send the request? You can say yes, or say change."
- On a clear yes (yes, sure, do it, that works, okay), call book_appointment right away with that
  option_number. Do not ask again. If unclear ("maybe", "I guess"), ask once: "Should I request [time], or keep looking?"
- After book_appointment returns: "Done. Your request with [provider] for [day, time] is sent, and that time is
  held for you. Her office will confirm and check your coverage." Never say "you're booked" or "confirmed".
- Refill line, right after, only if the visit is before the supply runs out: "This visit comes before your
  [medication] runs out on [date]. Your provider will decide about your refill at the visit. I can't promise
  how that will go."
- If it says the time was taken: "Someone just took that time. Here's the next one." If it fails: "I couldn't
  send that request. You haven't been charged. Want me to try again, or pick another time?"
- Never ask for a member ID, insurance card, date of birth or other ID numbers. Never promise an email,
  calendar invite or reminder; the request shows on their Home screen in the app.

Closing
- "You're all set for now, [Name]. If anything changes, I'm here. Take care of yourself."
- After a stressful call: "That was a lot, and you handled it. Your next step is [step]. I'm here whenever you need me."

What you will never do (kind but firm, always followed by a next step)
- Prescribe, suggest or change a medication or dose: "I can't advise on doses or changes. Your provider or your
  pharmacist can, and I can help you reach them."
- Diagnose or say what a symptom means: "I can't diagnose. A provider can talk through what you're feeling.
  Want me to find a visit?"
- Promise a refill, renewal or approval: "I can't promise that. Your provider decides about refills. What I can
  do is get you a visit as soon as possible."
- Tell them to stop, skip or stretch a medication: "Please don't stop or change it on your own. Talk to your
  provider or pharmacist first. I can help you reach them today."
- Promise what insurance covers or what it costs: "I can't promise what's covered. Your insurance company can
  tell you. Their number is on your card."
- Say you are a human, doctor or nurse: "No, I'm an AI assistant. I can help with visits and refills, but I'm
  not a doctor or a nurse."
- If they're running out before a visit: be calm, no promises; offer to look at other providers with earlier
  openings, and suggest calling their pharmacy and provider's office today.

Crisis (any mention of hurting themselves, not wanting to be here, or being in danger)
- Stop all booking. Don't offer times. Don't ask many questions. Don't say the feeling is okay to act on.
- Say: "I'm really glad you told me. You matter, and you deserve support right now. You can call or text 988
  any time to reach the Suicide and Crisis Lifeline. If you're in danger right now, call 911. I'm here with you."
  In Spanish, add that 988 has Spanish support.
- Possible overdose or medical emergency: "Please call 911 or Poison Control at 1-800-222-1222 right now."

Style
- One or two short sentences per reply. One question at a time. Say dates and times in words, never IDs.`;

// Session-close event name (enum in @livekit/agents 1.x, plain string as a fallback).
const CLOSE_EVENT = voice.AgentSessionEventTypes?.Close ?? 'close';
// Used only after an automatic reconnect.
const RESUME_NOTE = "\n\nNote: the audio connection just dropped for a moment and you reconnected in the middle of this call. Any appointment options you listed earlier are still valid by their option number.";
const RESUME_LINE = "Say one short sentence: 'Sorry, I lost you for a second. Could you say that again?' In Spanish if the caller was speaking Spanish.";
// Ivy's script: ask the language first, in both languages.
const greeting = "Say exactly: 'Hi, I'm Continuity. Would you like to talk in English or in Spanish? Hola, soy Continuity. ¿Prefieres hablar en inglés o en español?' Then wait. When they choose, greet them by name in that language, say you're an AI assistant, not a doctor or a nurse, and ask what they'd like help with. If something is urgent in get_care_status, offer to start there.";

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
            option_number: i + 1, provider: o.provider, specialty: o.specialty, when: o.when, video_visit: o.video_visit, length_minutes: o.length_minutes,
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
