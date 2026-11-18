// 슬터디 — 효과음(WebAudio)과 읽어 주기(speechSynthesis)
// 소리 파일 없이 만든다. Node에서 불러도 터지지 않게 window 접근은 모두 감싼다.

const W = typeof window !== 'undefined' ? window : null;
const store = {
  get(k) { try { return W.localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { W.localStorage.setItem(k, v); } catch { /* 저장 안 됨 */ } }
};

export const sfxOn = () => store.get('seulstudy.sfx') !== '0';
export const setSfxOn = (on) => store.set('seulstudy.sfx', on ? '1' : '0');
export const speechOn = () => store.get('seulstudy.speech') !== '0';
export const setSpeechOn = (on) => store.set('seulstudy.speech', on ? '1' : '0');

// ───────── 효과음 ─────────
let ctx = null;
let master = null;
function audio() {
  if (!W) return null;
  try {
    if (!ctx) {
      const AC = W.AudioContext || W.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      // 살짝 둥글게: 높은 소리를 조금 깎는다
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 6000;
      master.connect(lp).connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  } catch { return null; }
}

/** 음 하나: 사인 + 세모파를 섞고, 빠르게 올라가서 천천히 사라지는 소리 */
function note(freq, at, { dur = 0.35, vol = 0.22, tri = 0.35, glide = 0 } = {}) {
  const t0 = ctx.currentTime + at;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  g.connect(master);
  for (const [type, amt] of [['sine', 1 - tri], ['triangle', tri]]) {
    if (amt <= 0) continue;
    const o = ctx.createOscillator();
    const og = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (glide) o.frequency.exponentialRampToValueAtTime(freq * glide, t0 + dur);
    og.gain.value = amt;
    o.connect(og).connect(g);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }
}

const SOUNDS = {
  // 맑은 딩동 (두 음, 위로)
  good: () => { note(784, 0, { dur: 0.25, vol: 0.2 }); note(1175, 0.09, { dur: 0.5, vol: 0.2 }); note(2350, 0.09, { dur: 0.3, vol: 0.04, tri: 0 }); },
  // 부드럽고 낮은 두 음 (아래로)
  bad: () => { note(311, 0, { dur: 0.22, vol: 0.16, tri: 0.5 }); note(233, 0.14, { dur: 0.38, vol: 0.16, tri: 0.5, glide: 0.94 }); },
  // 레슨 끝 팡파레: 올라가는 아르페지오 + 화음
  done: () => {
    [523, 659, 784, 1047].forEach((f, i) => note(f, i * 0.1, { dur: 0.3, vol: 0.17 }));
    [523, 659, 784, 1047].forEach((f) => note(f, 0.45, { dur: 0.8, vol: 0.09, tri: 0.5 }));
    note(1568, 0.5, { dur: 0.7, vol: 0.05, tri: 0 });
  },
  tap: () => note(1320, 0, { dur: 0.06, vol: 0.06, tri: 0 }),
  select: () => note(990, 0, { dur: 0.05, vol: 0.07, tri: 0.6 }),
  // 반짝이며 올라가는 소리 (연속 정답)
  combo: () => [880, 1109, 1319, 1760].forEach((f, i) => note(f, i * 0.05, { dur: 0.2, vol: 0.09, tri: 0.2 })),
  heart: () => note(660, 0, { dur: 0.12, vol: 0.12, glide: 1.5 }),
  // 상자 열림: 반짝이며 올라간 뒤 동전 딸랑 여러 번
  chest: () => {
    note(392, 0, { dur: 0.35, vol: 0.1, tri: 0.5, glide: 2 });
    [1568, 1976, 2349, 1976, 2637].forEach((f, i) => note(f, 0.28 + i * 0.07, { dur: 0.16, vol: 0.07, tri: 0.1 }));
    note(3136, 0.65, { dur: 0.4, vol: 0.05, tri: 0 });
  },
  // 에너지 채움: 부드럽게 올라가는 소리
  energy: () => { note(330, 0, { dur: 0.6, vol: 0.12, tri: 0.3, glide: 2.4 }); note(495, 0.05, { dur: 0.6, vol: 0.06, tri: 0, glide: 2.4 }); },
  jump: () => note(440, 0, { dur: 0.18, vol: 0.12, tri: 0.4, glide: 2 })
};

export function sfx(kind) {
  if (!sfxOn() || !SOUNDS[kind]) return;
  if (!audio()) return;
  try { SOUNDS[kind](); } catch { /* 소리 없음 */ }
}

// ───────── 읽어 주기 ─────────
const synth = () => (W && W.speechSynthesis) || null;
let voicesReady = null;
function waitVoices() {
  const s = synth();
  if (!s) return Promise.resolve([]);
  const now = s.getVoices();
  if (now.length) return Promise.resolve(now);
  voicesReady ||= new Promise((resolve) => {
    const done = () => resolve(s.getVoices());
    try { s.addEventListener('voiceschanged', done, { once: true }); } catch { s.onvoiceschanged = done; }
    setTimeout(done, 1500);
  }).then((v) => { if (!v.length) voicesReady = null; return v; });
  return voicesReady;
}
if (synth()) waitVoices();

function bestVoice(voices, lang) {
  const L = String(lang || '').toLowerCase().replace('_', '-');
  const prefix = L.slice(0, 2);
  const norm = (v) => String(v.lang || '').toLowerCase().replace('_', '-');
  const exact = voices.filter((v) => norm(v) === L);
  const loose = exact.length ? exact : voices.filter((v) => norm(v).startsWith(prefix));
  if (!loose.length) return null;
  return loose.find((v) => /google|natural|online/i.test(v.name)) || loose.find((v) => v.localService === false) || loose[0];
}

export function hasVoice(lang) {
  const s = synth();
  if (!s) return false;
  try { return !!bestVoice(s.getVoices(), lang); } catch { return false; }
}

/** 읽어 주기. 실제로 소리가 나기 시작하면 true */
export async function speak(text, lang = 'en-US', rate = 0.9) {
  const s = synth();
  if (!s || !text || !speechOn()) return false;
  let voices = [];
  try { voices = await waitVoices(); } catch { /* 없음 */ }
  return new Promise((resolve) => {
    try {
      s.cancel();
      // 크롬: cancel 바로 뒤에 speak 하면 소리가 안 날 때가 있다
      setTimeout(() => {
        try {
          const u = new W.SpeechSynthesisUtterance(String(text));
          u.lang = lang;
          u.rate = rate;
          const v = bestVoice(voices, lang);
          if (v) u.voice = v; // 목소리가 없어도 lang만으로 시도 (안드로이드는 이걸로 되는 경우가 많다)
          let settled = false;
          const end = (ok) => { if (!settled) { settled = true; resolve(ok); } };
          u.onstart = () => end(true);
          u.onerror = () => end(false);
          setTimeout(() => end(false), 2000);
          if (s.paused) s.resume();
          s.speak(u);
        } catch { resolve(false); }
      }, 60);
    } catch { resolve(false); }
  });
}

/** 첫 터치·클릭 때 불러서 소리를 깨운다 (휴대폰 브라우저는 사용자 동작 뒤에만 소리를 허락) */
export function unlockAudio() {
  const c = audio();
  try {
    if (c) {
      // 아주 짧은 무음을 한 번 재생
      const b = c.createBuffer(1, 1, 22050);
      const src = c.createBufferSource();
      src.buffer = b;
      src.connect(c.destination);
      src.start(0);
    }
  } catch { /* 무시 */ }
  const s = synth();
  if (s && speechOn()) {
    try {
      const u = new W.SpeechSynthesisUtterance(' ');
      u.volume = 0;
      s.speak(u);
    } catch { /* 무시 */ }
  }
}
