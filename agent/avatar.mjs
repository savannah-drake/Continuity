// avatar.mjs: Continuity's face on FaceTime Video.
// Publishes a camera track from the agent (the participant that speaks), so the caller sees Continuity
// instead of the line's default picture. The ring around the mascot pulses while Continuity is talking.
//
// Mascot (from Ivy), one of:
//   agent/mascot/idle-1.png, idle-2.png ...   frames shown while listening (looped)
//   agent/mascot/talk-1.png, talk-2.png ...   frames shown while Continuity is talking (looped)
//   agent/mascot.png                          a single still image
// Square PNGs, ~512x512, transparent background. Run `npm install pngjs` once.
// Without any of these it draws the Continuity mark (plus in a circle).
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { LocalVideoTrack, TrackSource, VideoBufferType, VideoFrame, VideoSource } from '@livekit/rtc-node';

const W = 540, H = 960;                 // portrait, like a phone screen
const FPS = 10;
const BG = [0xEE, 0xF7, 0xFD];          // canvas
const BRAND = [0x5A, 0xA9, 0xD8];       // brand blue
const NAVY = [0x24, 0x50, 0x6E];
const MIST = [0xDC, 0xEE, 0xF9];
const CX = W / 2, CY = H * 0.44, R = 170; // mascot circle

const HERE = path.dirname(fileURLToPath(import.meta.url));

// Returns { idle: [png...], talk: [png...] } or null
async function loadMascot() {
  const dir = path.join(HERE, 'mascot');
  const single = path.join(HERE, 'mascot.png');
  const byNumber = (a, b) => (parseInt(a.match(/\d+/)?.[0] ?? '0') - parseInt(b.match(/\d+/)?.[0] ?? '0'));
  let idleFiles = [], talkFiles = [];
  if (existsSync(dir)) {
    const all = readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.png'));
    idleFiles = all.filter((f) => f.toLowerCase().startsWith('idle')).sort(byNumber).map((f) => path.join(dir, f));
    talkFiles = all.filter((f) => f.toLowerCase().startsWith('talk')).sort(byNumber).map((f) => path.join(dir, f));
  }
  if (!idleFiles.length && existsSync(single)) idleFiles = [single];
  if (!idleFiles.length && !talkFiles.length) return null;
  try {
    const { PNG } = await import('pngjs');
    const read = (f) => PNG.sync.read(readFileSync(f)); // { width, height, data (RGBA) }
    const idle = (idleFiles.length ? idleFiles : talkFiles.slice(0, 1)).map(read);
    const talk = talkFiles.length ? talkFiles.map(read) : idle;
    return { idle, talk };
  } catch (e) {
    console.warn('[avatar] mascot PNGs found but could not be read (run: npm install pngjs).', e.message);
    return null;
  }
}

function blend(buf, i, rgb, a) {
  buf[i] = buf[i] * (1 - a) + rgb[0] * a;
  buf[i + 1] = buf[i + 1] * (1 - a) + rgb[1] * a;
  buf[i + 2] = buf[i + 2] * (1 - a) + rgb[2] * a;
  buf[i + 3] = 255;
}

// The still image. Mascot: white background, the mascot fitted to the frame (Ivy's art has a white background).
// No mascot: the Continuity mark (brand circle + white plus) on the light blue canvas.
function drawBase(mascot) {
  const buf = new Uint8ClampedArray(W * H * 4);
  const bg = mascot ? [255, 255, 255] : BG;
  for (let p = 0; p < W * H; p++) { buf[p * 4] = bg[0]; buf[p * 4 + 1] = bg[1]; buf[p * 4 + 2] = bg[2]; buf[p * 4 + 3] = 255; }
  if (mascot) {
    const size = Math.min(W - 40, H - 160);           // square area for the mascot
    const left = Math.round((W - size) / 2), top0 = Math.round(H * 0.42 - size / 2);
    for (let y = 0; y < size; y++) {
      const sy = Math.floor((y / size) * mascot.height);
      for (let x = 0; x < size; x++) {
        const sx = Math.floor((x / size) * mascot.width);
        const j = (sy * mascot.width + sx) * 4, a = mascot.data[j + 3] / 255;
        if (a > 0) blend(buf, ((top0 + y) * W + (left + x)) * 4, [mascot.data[j], mascot.data[j + 1], mascot.data[j + 2]], a);
      }
    }
  } else {
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4, d = Math.hypot(x - CX, y - CY);
        const edge = Math.min(1, Math.max(0, R - d));
        if (edge > 0) blend(buf, i, BRAND, edge);
        const ax = Math.abs(x - CX), ay = Math.abs(y - CY);
        if (d < R - 4 && ((ax < 26 && ay < 100) || (ay < 26 && ax < 100))) blend(buf, i, [255, 255, 255], 1);
      }
    }
  }
  // Brand bar along the bottom
  for (let y = H - 70; y < H - 62; y++) for (let x = CX - 60; x < CX + 60; x++) blend(buf, (y * W + x) * 4, NAVY, 1);
  return buf;
}

// A pulse ring around the circle; level 0 = quiet, 1 = loud
function drawFrame(base, level) {
  const buf = new Uint8ClampedArray(base);
  if (level <= 0) return buf;
  const inner = R + 10, outer = R + 10 + 30 * level;
  for (let y = Math.floor(CY - outer); y <= CY + outer; y++) {
    for (let x = Math.floor(CX - outer); x <= CX + outer; x++) {
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const d = Math.hypot(x - CX, y - CY);
      if (d >= inner && d <= outer) blend(buf, (y * W + x) * 4, BRAND, 0.35 * (1 - (d - inner) / (outer - inner + 1)));
    }
  }
  return buf;
}

// Starts publishing; returns a stop() function. isSpeaking() says whether Continuity is talking right now.
export async function startAvatar(room, isSpeaking) {
  const mascot = await loadMascot();
  const STEPS = 8;
  // Pre-draw everything once, so each tick only sends a ready frame
  const markBase = mascot ? null : drawBase(null);
  const markFrames = markBase ? Array.from({ length: STEPS + 1 }, (_, k) => drawFrame(markBase, k / STEPS)) : null;
  const idleFrames = mascot ? mascot.idle.map((m) => drawBase(m)) : null;
  const talkFrames = mascot ? mascot.talk.map((m) => drawBase(m)) : null; // the mouth animation is the 'talking' cue

  const source = new VideoSource(W, H);
  // Same calls as Chert's examples/video-agent: one camera track, published by the agent that speaks
  const track = LocalVideoTrack.createVideoTrack('agent-video', source);
  await room.localParticipant.publishTrack(track, { source: TrackSource.SOURCE_CAMERA });

  let t = 0, level = 0, stopped = false;
  const timer = setInterval(() => {
    if (stopped) return;
    t += 1;
    let frame;
    if (mascot) {
      // Loop the talk frames while speaking, the idle frames while listening (~5 frames per second)
      const list = isSpeaking() ? talkFrames : idleFrames;
      frame = list[Math.floor(t / 2) % list.length];
    } else {
      const target = isSpeaking() ? 0.55 + 0.45 * Math.abs(Math.sin(t * 0.9)) : 0;
      level += (target - level) * 0.5;
      frame = markFrames[Math.round(level * STEPS)];
    }
    try { source.captureFrame(new VideoFrame(new Uint8Array(frame.buffer), W, H, VideoBufferType.RGBA)); } catch { /* room closing */ }
  }, 1000 / FPS);

  console.log(`[avatar] publishing ${mascot ? `mascot (${mascot.idle.length} idle + ${mascot.talk.length} talk frames)` : 'the Continuity mark'} as the agent's video`);
  return async () => {
    stopped = true;
    clearInterval(timer);
    try { await track.close(); } catch { /* ignore */ }
  };
}
