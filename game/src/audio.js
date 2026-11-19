// SOLMAR HEAT — all sound is WebAudio synthesis: no audio files, no network.
// Engine hum, two-tone siren, impacts, pickups, and a small music loop.
let ctx = null;
let master = null;
let engineOsc = null;
let engineGain = null;
let engineFilter = null;
let sirenOsc = null;
let sirenGain = null;
let sirenTimer = null;
let musicTimer = null;
let musicStep = 0;
let muted = false;

function ensure() {
  if (ctx) return true;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.5;
    master.connect(ctx.destination);
    // Engine: sawtooth through a lowpass, pitch follows speed.
    engineOsc = ctx.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 55;
    engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 320;
    engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    engineOsc.connect(engineFilter);
    engineFilter.connect(engineGain);
    engineGain.connect(master);
    engineOsc.start();
    // Siren: square wave alternating 660 / 880 Hz.
    sirenOsc = ctx.createOscillator();
    sirenOsc.type = 'square';
    sirenOsc.frequency.value = 660;
    sirenGain = ctx.createGain();
    sirenGain.gain.value = 0;
    sirenOsc.connect(sirenGain);
    sirenGain.connect(master);
    sirenOsc.start();
    return true;
  } catch (e) {
    ctx = null;
    return false;
  }
}

function blip(freq, dur, type, vol, slideTo) {
  if (!ctx || muted) return;
  try {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, ctx.currentTime);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + dur);
    g.gain.setValueAtTime(vol || 0.25, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    o.connect(g);
    g.connect(master);
    o.start();
    o.stop(ctx.currentTime + dur + 0.02);
  } catch (e) { /* audio is best-effort */ }
}

function noiseBurst(dur, vol, low) {
  if (!ctx || muted) return;
  try {
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = low || 900;
    const g = ctx.createGain();
    g.gain.value = vol || 0.3;
    src.connect(f);
    f.connect(g);
    g.connect(master);
    src.start();
  } catch (e) { /* audio is best-effort */ }
}

// Simple bass + lead loop in A minor, scheduled a bar ahead.
const BASS = [55, 0, 55, 0, 65.41, 0, 55, 0, 49, 0, 49, 0, 61.74, 0, 73.42, 0];
const LEAD = [220, 261.63, 329.63, 261.63, 220, 196, 246.94, 293.66, 220, 261.63, 329.63, 392, 329.63, 261.63, 246.94, 220];
function musicTick() {
  if (!ctx || muted) return;
  const step = musicStep % 16;
  const t = ctx.currentTime + 0.05;
  if (BASS[step]) {
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.type = 'triangle'; o.frequency.value = BASS[step];
    g.gain.setValueAtTime(0.16, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.24);
  }
  if (LEAD[step] && musicStep % 2 === 0) {
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.type = 'sine'; o.frequency.value = LEAD[step];
    g.gain.setValueAtTime(0.07, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.22);
  }
  musicStep++;
}

export const AudioSys = {
  ensure,
  setMuted(m) {
    muted = m;
    if (master) master.gain.value = m ? 0 : 0.5;
    if (m) { this.setSiren(false); }
  },
  isMuted() { return muted; },
  // speed: 0..1 of max speed; on: player is driving.
  setEngine(speed, on) {
    if (!ctx || muted) return;
    const target = on ? 0.05 + speed * 0.075 : 0;
    engineGain.gain.setTargetAtTime(target, ctx.currentTime, 0.08);
    engineOsc.frequency.setTargetAtTime(52 + speed * 150, ctx.currentTime, 0.08);
    engineFilter.frequency.setTargetAtTime(280 + speed * 900, ctx.currentTime, 0.1);
  },
  setSiren(on) {
    if (!ctx) return;
    if (on && !sirenTimer) {
      let hi = false;
      sirenGain.gain.setTargetAtTime(muted ? 0 : 0.045, ctx.currentTime, 0.1);
      sirenTimer = setInterval(() => {
        if (!ctx) return;
        hi = !hi;
        sirenOsc.frequency.setValueAtTime(hi ? 880 : 660, ctx.currentTime);
      }, 380);
    } else if (!on && sirenTimer) {
      clearInterval(sirenTimer);
      sirenTimer = null;
      sirenGain.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
    }
  },
  startMusic() {
    if (!ctx || musicTimer) return;
    musicTimer = setInterval(musicTick, 190);
  },
  stopMusic() {
    if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
  },
  honk() { blip(370, 0.22, 'square', 0.12, 340); },
  thud() { noiseBurst(0.18, 0.4, 500); blip(90, 0.15, 'sine', 0.3, 50); },
  punch() { noiseBurst(0.1, 0.3, 1200); },
  pickup() { blip(880, 0.12, 'sine', 0.22); setTimeout(() => blip(1318, 0.16, 'sine', 0.2), 90); },
  cash() { blip(988, 0.1, 'triangle', 0.22); setTimeout(() => blip(1319, 0.18, 'triangle', 0.22), 80); },
  missionDone() {
    [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => blip(f, 0.25, 'triangle', 0.25), i * 120));
  },
  fail() { blip(220, 0.5, 'sawtooth', 0.2, 110); },
  click() { blip(660, 0.06, 'sine', 0.15); },
};
