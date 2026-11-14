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
- To find appointments, use find_appointments. It returns numbered options. Offer option 1 first
  (provider, day and time, video or in person); mention option 2 only if they want something else.
  Say these are example openings in a demo.
- Ask once: "Should I book that?" The moment the caller agrees (yes, sure, book it, that works, okay),
  call book_appointment right away with that option_number. Do not ask again, do not wait.
- After book_appointment returns, tell them it's booked in one sentence (provider, day, time).
  If it says the time was taken, offer the next option.
- Use plain words: "Monday, November sixteenth at nine AM", never IDs or codes.

Style and safety:
- One or two short, plain sentences per reply. Ask one question at a time.
- Supportive, never blaming: "your next visit isn't booked yet", not "you forgot".
- You are an AI assistant, not a doctor or nurse. Never diagnose, never give dosing or medication advice,
  never promise a prescription will be renewed. For medical questions, suggest talking to their provider.
- If someone sounds like they are in crisis, tell them they can call or text 988 any time, right now.
- Don't say medication names out loud unless the caller says them first; say "your medication".`;

const greeting = "Greet the caller by name if you know it, in one short sentence: say you are Continuity, an AI care assistant, and ask how you can help with their care today.";

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
      }),
      execute: async ({ provider_type, video_only }) => {
        const data = await api(`/api/agent/slots?userId=${USER_ID}&type=${provider_type}${video_only ? '&telehealth=1' : ''}`);
        lastOptions = data.options || [];
        return {
          deadline: data.deadline,
          note: data.note,
          options: lastOptions.map((o, i) => ({
            option_number: i + 1, provider: o.provider, specialty: o.specialty, when: o.when, video_visit: o.video_visit,
          })),
        };
      },
    }),
    book_appointment: llm.tool({
      description: 'Book one of the options from find_appointments. Call this immediately when the caller agrees.',
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

    const session = new voice.AgentSession({
      llm: new RealtimeModel({
        apiKey: process.env.GOOGLE_API_KEY,
        model: process.env.GEMINI_MODEL || 'gemini-2.5-flash-native-audio-preview-12-2025',
        voice: 'Aoede',
      }),
    });
    ctx.addShutdownCallback(() => session.close());
    // Log every call to Tiger's call_log hypertable (never blocks the call)
    ctx.addShutdownCallback(async () => {
      try {
        await api('/api/agent/calls', {
          method: 'POST',
          body: JSON.stringify({ chertCallId, userId: USER_ID, durationSec: Math.round((Date.now() - startedAt) / 1000), outcome: 'ended' }),
        });
      } catch { /* logging is best-effort */ }
    });

    await session.start({
      room: ctx.room,
      agent: new voice.Agent({ instructions, tools: makeTools() }),
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
    // Greet once when Chert reports FaceTime is ready (the call ends if silent for 10 s after that).
    const stopGreeting = greetOnBridgeReady(ctx.room, () => session.generateReply({ instructions: greeting }));
    ctx.addShutdownCallback(async () => stopGreeting());
  },
});

export default agent;

runAgent(agent, { file: fileURLToPath(import.meta.url), agentName: process.env.AGENT_NAME || 'continuity-agent' });
