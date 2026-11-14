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
- To find appointments, use find_appointments. Offer at most two options at a time: provider, day and time,
  and whether it's a video visit. Say these are example openings in a demo.
- Before booking, read back the provider, day and time and ask "Should I book that?". Only call
  book_appointment after a clear yes. Then confirm in one sentence.
- Use plain words: "Monday, November sixteenth at nine AM", never IDs or codes.

Style and safety:
- One or two short, plain sentences per reply. Ask one question at a time.
- Supportive, never blaming: "your next visit isn't booked yet", not "you forgot".
- You are an AI assistant, not a doctor or nurse. Never diagnose, never give dosing or medication advice,
  never promise a prescription will be renewed. For medical questions, suggest talking to their provider.
- If someone sounds like they are in crisis, tell them they can call or text 988 any time, right now.
- Don't say medication names out loud unless the caller says them first; say "your medication".`;

const greeting = "Greet the caller by name if you know it, in one short sentence: say you are Continuity, an AI care assistant, and ask how you can help with their care today.";

const tools = {
  get_care_status: llm.tool({
    description: "Get the caller's care plan: days of medication left, when they must book their next psychiatry visit, therapy timing, and upcoming appointments.",
    parameters: z.object({}),
    execute: async () => api(`/api/agent/status?userId=${USER_ID}`),
  }),
  find_appointments: llm.tool({
    description: "Find in-network openings before the caller's deadline, soonest first. Returns up to 3 options, each with a slot_id.",
    parameters: z.object({
      provider_type: z.enum(['psychiatrist', 'therapist']).describe('psychiatrist for medication visits, therapist for therapy'),
      video_only: z.boolean().optional().describe('true if the caller only wants video visits'),
    }),
    execute: async ({ provider_type, video_only }) =>
      api(`/api/agent/slots?userId=${USER_ID}&type=${provider_type}${video_only ? '&telehealth=1' : ''}`),
  }),
  book_appointment: llm.tool({
    description: 'Book one opening. Only call this after the caller clearly said yes to that exact provider, day and time.',
    parameters: z.object({ slot_id: z.number().describe('slot_id from find_appointments') }),
    execute: async ({ slot_id }) =>
      api('/api/agent/book', { method: 'POST', body: JSON.stringify({ userId: USER_ID, slotId: slot_id }) }),
  }),
};

const agent = defineAgent({
  entry: async ctx => {
    await ctx.connect(undefined, AutoSubscribe.AUDIO_ONLY);
    // Join promptly, but wait for a caller before opening a paid model session.
    const caller = await ctx.waitForParticipant();
    const startedAt = Date.now();
    const chertCallId = caller.identity.replace(/^chert-bridge-/, '');

    const session = new voice.AgentSession({
      llm: new RealtimeModel({ apiKey: process.env.GOOGLE_API_KEY, model: 'gemini-2.5-flash-native-audio-preview-12-2025', voice: 'Aoede' }),
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
      agent: new voice.Agent({ instructions, tools }),
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
