// imessage.mjs: Continuity over iMessage (backup channel for FaceTime).
// Same brain and tools as the FaceTime agent, but text: Gemini (text model) + Continuity's /api/agent/* routes,
// replies sent through Chert's messaging API.
//
// Run (from the agent folder):
//   node --env-file=.env.local imessage.mjs          listen for texts and reply
//   node --env-file=.env.local imessage.mjs remind   send Maya a proactive "book your visit" text, then listen
//
// .env.local needs: GOOGLE_API_KEY, CHERT_SIGNING_SECRET, CONTINUITY_PHONE (+1..., the demo phone),
//                   CONTINUITY_API_URL, AGENT_API_KEY, CONTINUITY_USER_ID
// Optional: GEMINI_TEXT_MODEL (default gemini-2.5-flash), CHERT_API_BASE (default https://console.trychert.com/api/v1)
import { GoogleGenAI } from '@google/genai';
import { instructions, TEXTING_RULES } from './persona.mjs';

const CHERT = (process.env.CHERT_API_BASE || 'https://console.trychert.com/api/v1').replace(/\/$/, '');
const CHERT_SECRET = process.env.CHERT_SIGNING_SECRET || '';
const API = (process.env.CONTINUITY_API_URL || 'http://localhost:3000').replace(/\/$/, '');
const AGENT_KEY = process.env.AGENT_API_KEY || '';
const USER_ID = Number(process.env.CONTINUITY_USER_ID || 1);
const DEMO_PHONE = process.env.CONTINUITY_PHONE || '';
const MODEL = process.env.GEMINI_TEXT_MODEL || 'gemini-2.5-flash';

if (!CHERT_SECRET) { console.error('Missing CHERT_SIGNING_SECRET in .env.local'); process.exit(1); }
const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });

// ---- Continuity API (same routes the FaceTime agent uses)
async function api(path, init = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', 'x-agent-key': AGENT_KEY, ...(init.headers || {}) },
  });
  if (!res.ok) throw new Error(`Continuity API ${res.status}`);
  return res.json();
}

// ---- Chert messaging
async function sendText(phone, body) {
  const res = await fetch(`${CHERT}/send`, {
    method: 'POST',
    headers: { authorization: `Bearer ${CHERT_SECRET}`, 'content-type': 'application/json' },
    body: JSON.stringify({ phone, body }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) console.error(`Chert send failed (${res.status}):`, data);
  else console.log(`→ sent to ${mask(phone)}: ${body}`);
  return data;
}
const mask = (p) => (p ? `${String(p).slice(0, 2)}…${String(p).slice(-4)}` : '?');

// ---- Personality (texting version of the FaceTime instructions)
// Same persona as FaceTime (persona.mjs), plus texting rules
const systemInstruction = instructions + TEXTING_RULES;

const functionDeclarations = [
  { name: 'get_care_status', description: "Get the person's care plan: days of medication left, when to book the next psychiatry visit, therapy timing, upcoming appointments.", parameters: { type: 'object', properties: {} } },
  { name: 'find_appointments', description: 'Find in-network openings before their deadline, soonest first. Returns numbered options.',
    parameters: { type: 'object', properties: {
      provider_type: { type: 'string', enum: ['psychiatrist', 'therapist'] },
      video_only: { type: 'boolean' },
      language: { type: 'string', description: 'e.g. Spanish' },
      in_their_words: { type: 'string', description: '1-3 key words they used for who they want, e.g. counselor, shrink, ADHD, terapeuta, Dr. Reyes' } }, required: ['provider_type'] } },
  { name: 'find_support', description: 'Find the best-fit help line for their situation (vetted list: 988, 911, Poison Control, Crisis Text Line, Trevor Project, Emory CAPS). Crisis needs always return 988 first.',
    parameters: { type: 'object', properties: { what_they_need: { type: 'string' }, spanish: { type: 'boolean' } }, required: ['what_they_need'] } },
  { name: 'book_appointment', description: 'Send an appointment request for one of the numbered options (holds the time; the office confirms). Call as soon as they agree.',
    parameters: { type: 'object', properties: { option_number: { type: 'number' } }, required: ['option_number'] } },
];

// ---- One conversation per phone number (kept in memory while this runs)
const convos = new Map(); // phone -> { contents: [], lastOptions: [] }
const convo = (phone) => convos.get(phone) ?? convos.set(phone, { contents: [], lastOptions: [] }).get(phone);

async function runTool(c, name, args) {
  if (name === 'get_care_status') return api(`/api/agent/status?userId=${USER_ID}`);
  if (name === 'find_appointments') {
    const qs = new URLSearchParams({ userId: String(USER_ID), type: args.provider_type });
    if (args.video_only) qs.set('telehealth', '1');
    if (args.language) qs.set('language', args.language);
    if (args.in_their_words) qs.set('q', args.in_their_words);
    const data = await api(`/api/agent/slots?${qs}`);
    c.lastOptions = data.options || [];
    return { deadline: data.deadline, note: data.note,
      options: c.lastOptions.map((o, i) => ({ option_number: i + 1, provider: o.provider, when: o.when, video_visit: o.video_visit, length_minutes: o.length_minutes, fits_your_calendar: o.fits_your_calendar })) };
  }
  if (name === 'find_support') {
    const r = await fetch(`${API}/api/support?${new URLSearchParams({ q: args.what_they_need, lang: args.spanish ? 'es' : 'en', student: '1', limit: '3' })}`);
    const data = await r.json().catch(() => ({ resources: [] }));
    return { crisis: data.crisis, resources: (data.resources || []).map((x) => ({ name: args.spanish ? x.name_es : x.name, how: args.spanish ? x.how_es : x.how })) };
  }
  if (name === 'book_appointment') {
    const option = c.lastOptions[Number(args.option_number) - 1];
    if (!option) return { booked: false, reason: 'unknown_option', hint: 'Call find_appointments first.' };
    return api('/api/agent/book', { method: 'POST', body: JSON.stringify({ userId: USER_ID, slotId: option.slot_id }) });
  }
  return { error: `unknown tool ${name}` };
}

async function reply(phone, text) {
  const c = convo(phone);
  c.contents.push({ role: 'user', parts: [{ text }] });
  for (let step = 0; step < 5; step++) {
    const res = await ai.models.generateContent({
      model: MODEL, contents: c.contents,
      config: { systemInstruction, tools: [{ functionDeclarations }] },
    });
    const calls = res.functionCalls ?? [];
    const modelContent = res.candidates?.[0]?.content;
    if (modelContent) c.contents.push(modelContent);
    if (!calls.length) return (res.text || '').trim();
    const parts = [];
    for (const call of calls) {
      console.log(`  tool: ${call.name}`, call.args ?? {});
      let result;
      try { result = await runTool(c, call.name, call.args ?? {}); } catch (e) { result = { error: String(e.message || e) }; }
      parts.push({ functionResponse: { name: call.name, response: { result } } });
    }
    c.contents.push({ role: 'user', parts });
  }
  return "Sorry, I got stuck there. Could you say that again?";
}

// ---- Inbound: Chert's live event stream (message.received)
// The payload shape isn't fully documented, so read the common field names defensively.
function readInbound(evt) {
  const type = evt.type || evt.event || evt.name;
  if (type && !String(type).includes('message.received')) return null;
  const d = evt.data ?? evt.payload ?? evt;
  const m = d.message ?? d;
  const text = m.body ?? m.text ?? (Array.isArray(m.parts) ? m.parts.map((p) => p.text).filter(Boolean).join(' ') : undefined);
  const phone = m.from ?? m.phone ?? d.from ?? d.phone ?? d.lead?.phone ?? d.chat?.handle ?? m.sender?.phone;
  const id = m.id ?? m.message_id ?? d.id;
  return text && phone ? { text: String(text), phone: String(phone), id } : null;
}

const seen = new Set();
async function handle(evt) {
  const msg = readInbound(evt);
  if (!msg) { console.log('event (not a text we handle):', JSON.stringify(evt).slice(0, 300)); return; }
  if (msg.id && seen.has(msg.id)) return;
  if (msg.id) seen.add(msg.id);
  console.log(`← from ${mask(msg.phone)}: ${msg.text}`);
  try {
    const answer = await reply(msg.phone, msg.text);
    if (answer) await sendText(msg.phone, answer);
  } catch (e) {
    console.error('reply failed:', e.message || e);
    await sendText(msg.phone, "Sorry, something went wrong on our side. Please try again in a moment.");
  }
}

async function listen() {
  console.log('Listening for iMessages via Chert…');
  for (;;) {
    try {
      const res = await fetch(`${CHERT}/events/stream`, {
        headers: { authorization: `Bearer ${CHERT_SECRET}`, accept: 'text/event-stream' },
      });
      if (!res.ok || !res.body) throw new Error(`stream ${res.status}`);
      const decoder = new TextDecoder();
      let buf = '';
      for await (const chunk of res.body) {
        buf += decoder.decode(chunk, { stream: true });
        let i;
        while ((i = buf.indexOf('\n\n')) !== -1) {
          const block = buf.slice(0, i); buf = buf.slice(i + 2);
          const eventName = block.match(/^event:\s*(.*)$/m)?.[1];
          const data = block.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim()).join('\n');
          if (!data) continue;
          try { const evt = JSON.parse(data); handle(eventName && !evt.type ? { type: eventName, data: evt } : evt); }
          catch { console.log('non-JSON event:', data.slice(0, 200)); }
        }
      }
    } catch (e) {
      console.error('stream error, reconnecting in 3 s:', e.message || e);
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
}

// ---- Proactive reminder (the demo opener)
async function remind() {
  if (!DEMO_PHONE) { console.error('Set CONTINUITY_PHONE in .env.local'); return; }
  const status = await api(`/api/agent/status?userId=${USER_ID}`);
  const name = status.name || 'there';
  const by = status.medication?.book_psychiatry_visit_by;
  const text = by
    ? `Hi ${name}, it's Continuity. Your next psychiatry visit isn't booked yet. Booking by ${by} keeps your refill on track. Want me to find a time? Reply YES.`
    : `Hi ${name}, it's Continuity. You're all set for now. Text me anytime if you need a visit or a refill.`;
  convo(DEMO_PHONE).contents.push({ role: 'model', parts: [{ text }] });
  await sendText(DEMO_PHONE, text);
}

if (process.argv[2] === 'remind') await remind();
await listen();
