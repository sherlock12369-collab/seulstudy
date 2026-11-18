// 슬터디 개인 서버 — node server.mjs
//  - 화면(public/)을 보여 주고, 가입·로그인·학습 기록·AI 레슨을 맡는다.
//  - AI 키는 config.json에만 있고 화면(브라우저)으로는 절대 보내지 않는다.
//  - 기록은 data/db.json, AI가 만든 레슨은 data/lessons/ 에 저장한다. (다른 프로그램 설치 필요 없음)
import http from 'node:http';
import os from 'node:os';
import { readFile, writeFile, mkdir, rename, stat } from 'node:fs/promises';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { courseOf, LESSONS_PER_UNIT } from './public/courses.js';
import { builtinLesson, aiPrompt, cleanAiLesson } from './lessons.mjs';

const scrypt = promisify(scryptCb);
const ROOT = fileURLToPath(new URL('.', import.meta.url));
const PUBLIC = join(ROOT, 'public');
// 시험할 때는 환경 변수로 다른 폴더·설정 파일·포트를 쓸 수 있다 (tools/api-test.mjs)
const DATA = process.env.SEULSTUDY_DATA || join(ROOT, 'data');
const CONFIG_FILE = process.env.SEULSTUDY_CONFIG || join(ROOT, 'config.json');

// ───────── 설정 ─────────
const DEFAULT_CONFIG = {
  port: 5173,
  inviteCodes: ['SEUL-' + randomBytes(3).toString('hex').toUpperCase()],
  geminiKeys: [],
  geminiModels: ['gemini-3.8-flash', 'gemini-3.5-flash-lite'],
  grokKeys: [],
  grokModel: 'grok-4-fast',
  adminIds: [],
  allowGuest: true
};
if (!existsSync(CONFIG_FILE)) {
  writeFileSync(CONFIG_FILE, JSON.stringify(DEFAULT_CONFIG, null, 2) + '\n');
  console.log('config.json을 새로 만들었어요. 여기에 AI 키와 가입 코드를 넣으세요.');
}
let config = { ...DEFAULT_CONFIG, ...JSON.parse(readFileSync(CONFIG_FILE, 'utf8')) };
const reloadConfig = () => {
  try { config = { ...DEFAULT_CONFIG, ...JSON.parse(readFileSync(CONFIG_FILE, 'utf8')) }; } catch (err) { console.error('config.json 읽기 실패:', err.message); }
};

// ───────── 저장소 ─────────
await mkdir(join(DATA, 'lessons'), { recursive: true });
const DB_FILE = join(DATA, 'db.json');
const db = existsSync(DB_FILE) ? JSON.parse(readFileSync(DB_FILE, 'utf8')) : { users: {}, sessions: {} };
db.duels = db.duels || {};
const DUEL_KEEP_MS = 14 * 86400000;
function cleanDuels() {
  for (const [id, d] of Object.entries(db.duels)) if (Date.now() - d.created > DUEL_KEEP_MS) delete db.duels[id];
}
cleanDuels();
let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    const tmp = DB_FILE + '.tmp';
    await writeFile(tmp, JSON.stringify(db));
    await rename(tmp, DB_FILE);
  }, 300);
}

// ───────── 날짜 (한국 시간) ─────────
const dayOf = (t = Date.now()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(t);
const dayDiff = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
function weekStart(t = Date.now()) {
  // 이번 주 월요일 (한국 시간)
  const d = dayOf(t);
  const wd = (new Date(d + 'T00:00:00Z').getUTCDay() + 6) % 7;
  return new Date(Date.parse(d) - wd * 86400000).toISOString().slice(0, 10);
}

// ───────── 에너지 ─────────
// 문제 하나에 1씩 쓰고, 6분마다 1씩 찬다 (최대 25)
const MAX_ENERGY = 25;
const ENERGY_MS = 6 * 60 * 1000;
function energy(u) {
  // 예전 데이터(하트만 있음)면 가득 찬 에너지로 새로 만든다
  if (!u.energy) { u.energy = { n: MAX_ENERGY, t: Date.now() }; delete u.hearts; }
  const e = u.energy;
  if (e.n < MAX_ENERGY) {
    const gained = Math.floor((Date.now() - e.t) / ENERGY_MS);
    if (gained > 0) { e.n = Math.min(MAX_ENERGY, e.n + gained); e.t += gained * ENERGY_MS; }
  } else e.t = Date.now();
  return { n: e.n, max: MAX_ENERGY, next: e.n < MAX_ENERGY ? e.t + ENERGY_MS : null };
}

function streakOf(u) {
  const s = u.streak || { count: 0, last: null };
  // 어제도 오늘도 안 했으면 끊긴 것으로 보여 준다
  const alive = s.last && dayDiff(s.last, dayOf()) <= 1;
  return { count: alive ? s.count : 0, today: s.last === dayOf() };
}

function publicUser(u) {
  const week = weekStart();
  const weekXp = Object.entries(u.xpByDay || {}).filter(([d]) => d >= week).reduce((a, [, x]) => a + x, 0);
  return {
    id: u.id, nick: u.nick, xp: u.xp || 0, weekXp, todayXp: (u.xpByDay || {})[dayOf()] || 0,
    dailyGoal: u.dailyGoal || 20, streak: streakOf(u), energy: energy(u),
    progress: u.progress || {}, course: u.course || null, created: u.created, guest: !!u.guest, gems: u.gems || 0, chests: u.chests || {}
  };
}

// ───────── XP · 연속 학습일 (레슨·건너뛰기·연습이 함께 쓴다) ─────────
/** XP를 더하고 오늘 기록·연속 학습일을 갱신한다. 오늘 처음이면 true */
function addXp(u, xp) {
  const today = dayOf();
  u.xp = (u.xp || 0) + xp;
  u.xpByDay = u.xpByDay || {};
  u.xpByDay[today] = (u.xpByDay[today] || 0) + xp;
  const s = u.streak || { count: 0, last: null };
  let up = false;
  if (s.last !== today) {
    s.count = s.last && dayDiff(s.last, today) === 1 ? s.count + 1 : 1;
    s.last = today;
    up = true;
  }
  u.streak = s;
  return up;
}
const unitDone = (done, unit) => Array.from({ length: LESSONS_PER_UNIT }, (_, l) => done[`${unit}-${l}`]).every(Boolean);
/** from 단원부터 to 단원 앞까지의 레슨을 끝낸 것으로 표시 (이미 한 횟수는 그대로) */
function markUnits(prog, from, to) {
  for (let un = from; un < to; un++) for (let l = 0; l < LESSONS_PER_UNIT; l++) prog.done[`${un}-${l}`] ||= 1;
}

// ───────── 대결 도우미 ─────────
const BOT = { id: 'seul', nick: '슬' };
const isIn = (d, u) => d.from.id === u.id || d.to.id === u.id;
/** exercises는 빼고, 내가 아직 안 했으면 myTurn */
function duelView(d, u) {
  const { exercises, ...rest } = d;
  return { ...rest, total: exercises.length, myTurn: !d.results[u.id] };
}
/** 내가 끝낸 단원(없으면 단원 0)에서 레슨 2개를 뽑아 섞은 8문제 (짝 맞추기 빼고) */
function duelExercises(u, courseId) {
  const course = courseOf(courseId);
  const done = (u.progress[courseId] || {}).done || {};
  const usable = course.units.map((_, ui) => ui).filter((ui) => builtinLesson(courseId, ui, 0));
  let pool = usable.filter((ui) => unitDone(done, ui));
  if (!pool.length) pool = usable.includes(0) ? [0] : usable.slice(0, 1);
  const picks = [];
  for (let k = 0; k < 2; k++) {
    const ui = pool[Math.floor(Math.random() * pool.length)];
    const l = builtinLesson(courseId, ui, Math.floor(Math.random() * LESSONS_PER_UNIT), Math.floor(Math.random() * 1e6));
    if (l) picks.push(...l.exercises.filter((e) => e.type !== 'match'));
  }
  const seen = new Set();
  const uniq = picks.filter((e) => { const k = JSON.stringify(e); if (seen.has(k)) return false; seen.add(k); return true; });
  for (let i = uniq.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [uniq[i], uniq[j]] = [uniq[j], uniq[i]]; }
  return uniq.slice(0, 8);
}

// ───────── 비밀번호 ─────────
async function hashPass(pass, salt = randomBytes(16).toString('hex')) {
  const key = await scrypt(pass, salt, 32);
  return `${salt}:${key.toString('hex')}`;
}
async function checkPass(pass, stored) {
  const [salt, hex] = String(stored).split(':');
  const key = await scrypt(pass, salt, 32);
  const want = Buffer.from(hex, 'hex');
  return want.length === key.length && timingSafeEqual(want, key);
}

// ───────── AI (키 여러 개 돌려 쓰기 → Grok) ─────────
const cooldown = new Map(); // 키 → 이 시각까지 쉬기
const keyTag = (k) => '…' + String(k).slice(-4);
let keyTurn = 0;

async function geminiJSON(prompt) {
  const keys = (config.geminiKeys || []).filter(Boolean);
  if (!keys.length) throw new Error('Gemini 키 없음');
  const order = keys.map((_, i) => keys[(keyTurn + i) % keys.length]);
  keyTurn = (keyTurn + 1) % keys.length; // 다음 레슨은 다음 키부터 (고르게 쓰기)
  let last = null;
  for (const model of config.geminiModels) {
    for (const key of order) {
      if ((cooldown.get(key + model) || 0) > Date.now()) continue;
      try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: 'application/json', temperature: 0.9 }
          }),
          signal: AbortSignal.timeout(45000)
        });
        if (!res.ok) {
          const body = await res.text().catch(() => '');
          last = new Error(`Gemini ${model} ${keyTag(key)} HTTP ${res.status} ${body.slice(0, 120)}`);
          // 한도 초과(429)는 10분, 바쁨(5xx)은 1분, 키 문제(400/403)는 1시간 쉰다
          const wait = res.status === 429 ? 10 * 60e3 : res.status >= 500 ? 60e3 : 60 * 60e3;
          cooldown.set(key + model, Date.now() + wait);
          console.warn(last.message);
          continue;
        }
        const j = await res.json();
        const text = (j.candidates?.[0]?.content?.parts || []).filter((p) => !p.thought).map((p) => p.text || '').join('');
        return { data: JSON.parse(text), by: `gemini ${model} ${keyTag(key)}` };
      } catch (err) {
        last = err;
        console.warn(`Gemini ${model} ${keyTag(key)}:`, err.message);
      }
    }
  }
  throw last || new Error('쓸 수 있는 Gemini 키가 없음 (모두 쉬는 중)');
}

async function grokJSON(prompt) {
  const keys = (config.grokKeys || []).filter(Boolean);
  if (!keys.length) throw new Error('Grok 키 없음');
  let last = null;
  for (const key of keys) {
    if ((cooldown.get(key) || 0) > Date.now()) continue;
    try {
      const res = await fetch('https://api.x.ai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model: config.grokModel, messages: [{ role: 'user', content: prompt }], response_format: { type: 'json_object' } }),
        signal: AbortSignal.timeout(60000)
      });
      if (!res.ok) {
        last = new Error(`Grok ${keyTag(key)} HTTP ${res.status} ${(await res.text().catch(() => '')).slice(0, 120)}`);
        cooldown.set(key, Date.now() + (res.status === 429 ? 10 * 60e3 : 60e3));
        console.warn(last.message);
        continue;
      }
      const j = await res.json();
      return { data: JSON.parse(j.choices[0].message.content), by: `grok ${keyTag(key)}` };
    } catch (err) {
      last = err;
      console.warn(`Grok ${keyTag(key)}:`, err.message);
    }
  }
  throw last || new Error('쓸 수 있는 Grok 키가 없음');
}

async function aiJSON(prompt) {
  const errors = [];
  for (const fn of [geminiJSON, grokJSON]) {
    try { return await fn(prompt); } catch (err) { errors.push(err.message); }
  }
  throw new Error(errors.join(' / '));
}

// ───────── 레슨 가져오기 ─────────
// 같은 레슨은 한 번 만든 것을 저장해 두고 다시 쓴다 (AI 한도 아끼기). 다시 하기는 다른 판(v)을 만든다.
const making = new Map();
async function getLesson(courseId, unit, lesson, variant) {
  const course = courseOf(courseId);
  const file = join(DATA, 'lessons', `${courseId}-${unit}-${lesson}-${variant}.json`);
  if (existsSync(file)) return JSON.parse(await readFile(file, 'utf8'));
  // 내장 자료가 있으면 그걸 쓴다 (체스는 항상 내장)
  // 내장 레슨은 할 때마다 다르게 섞는다 (같은 문제가 자꾸 나오던 문제)
  const built = builtinLesson(courseId, unit, lesson, Math.floor(Math.random() * 1e9));
  if (built && (course.kind === 'chess' || variant === 0 || !hasAnyKey())) return built;
  if (making.has(file)) return making.get(file);
  const job = (async () => {
    try {
      const { data, by } = await aiJSON(aiPrompt(courseId, unit, lesson));
      const clean = cleanAiLesson(data, courseId);
      if (!clean) throw new Error('AI 문제 모양이 이상함');
      clean.by = by;
      await writeFile(file, JSON.stringify(clean));
      return clean;
    } catch (err) {
      console.warn(`레슨 ${courseId} ${unit}-${lesson}: AI 실패 →`, err.message);
      if (built) return built;
      const e = new Error('지금 AI가 바빠서 이 레슨을 만들 수 없어요. 잠시 뒤 다시 해 보세요.');
      e.status = 503;
      throw e;
    } finally {
      making.delete(file);
    }
  })();
  making.set(file, job);
  return job;
}
const hasAnyKey = () => (config.geminiKeys || []).some(Boolean) || (config.grokKeys || []).some(Boolean);

// ───────── HTTP ─────────
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon' };

function send(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}
async function body(req) {
  let s = '';
  for await (const chunk of req) { s += chunk; if (s.length > 1e5) throw Object.assign(new Error('너무 큼'), { status: 413 }); }
  try { return s ? JSON.parse(s) : {}; } catch { throw Object.assign(new Error('잘못된 요청'), { status: 400 }); }
}
function userOf(req) {
  const token = (req.headers.authorization || '').replace(/^Bearer /, '');
  const id = token && db.sessions[token];
  return id ? db.users[id] : null;
}
const fail = (status, message) => Object.assign(new Error(message), { status });

// 로그인 시도 제한 (아이디마다 10분에 10번)
const tries = new Map();
function limitTries(key) {
  const now = Date.now();
  const list = (tries.get(key) || []).filter((t) => now - t < 10 * 60e3);
  if (list.length >= 10) throw fail(429, '너무 많이 시도했어요. 10분 뒤 다시 해 주세요.');
  list.push(now);
  tries.set(key, list);
}

function newSession(u) {
  const token = randomBytes(24).toString('hex');
  db.sessions[token] = u.id;
  save();
  return token;
}

const routes = {
  async 'POST /api/signup'(req) {
    const { code, id: rawId, pass, nick } = await body(req);
    reloadConfig();
    limitTries('signup:' + (req.socket.remoteAddress || ''));
    if (!config.inviteCodes.map((c) => String(c).toUpperCase()).includes(String(code || '').trim().toUpperCase())) throw fail(400, '가입 코드가 맞지 않아요.');
    const id = String(rawId || '').trim().toLowerCase();
    if (!/^[a-z0-9_]{3,16}$/.test(id)) throw fail(400, '아이디는 영어 소문자·숫자·_ 로 3~16자예요.');
    if (db.users[id]) throw fail(400, '이미 있는 아이디예요.');
    if (String(pass || '').length < 4) throw fail(400, '비밀번호는 4자 이상이에요.');
    const name = String(nick || id).trim().slice(0, 12) || id;
    const u = { id, nick: name, pass: await hashPass(String(pass)), created: Date.now(), xp: 0, xpByDay: {}, progress: {}, energy: { n: MAX_ENERGY, t: Date.now() } };
    db.users[id] = u;
    return { token: newSession(u), user: publicUser(u) };
  },
  async 'POST /api/guest'(req) {
    reloadConfig();
    if (config.allowGuest === false) throw fail(403, '체험하기가 꺼져 있어요.');
    limitTries('guest:' + (req.socket.remoteAddress || ''));
    let id;
    do { id = 'guest_' + randomBytes(3).toString('hex'); } while (db.users[id]);
    const u = { id, nick: '체험', guest: true, pass: await hashPass(randomBytes(16).toString('hex')), created: Date.now(), xp: 0, xpByDay: {}, progress: {}, energy: { n: MAX_ENERGY, t: Date.now() } };
    db.users[id] = u;
    return { token: newSession(u), user: publicUser(u) };
  },
  async 'POST /api/login'(req) {
    const { id: rawId, pass } = await body(req);
    const id = String(rawId || '').trim().toLowerCase();
    limitTries('login:' + id);
    const u = db.users[id];
    if (!u || !(await checkPass(String(pass || ''), u.pass))) throw fail(400, '아이디나 비밀번호가 맞지 않아요.');
    return { token: newSession(u), user: publicUser(u) };
  },
  async 'POST /api/logout'(req) {
    const token = (req.headers.authorization || '').replace(/^Bearer /, '');
    delete db.sessions[token];
    save();
    return { ok: true };
  },
  async 'GET /api/me'(req, u) {
    return { user: publicUser(u) };
  },
  async 'POST /api/settings'(req, u) {
    const b = await body(req);
    if (b.course && courseOf(b.course)) u.course = b.course;
    if ([10, 20, 30, 50].includes(b.dailyGoal)) u.dailyGoal = b.dailyGoal;
    if (typeof b.nick === 'string' && b.nick.trim()) u.nick = b.nick.trim().slice(0, 12);
    save();
    return { user: publicUser(u) };
  },
  async 'GET /api/lesson'(req, u, url) {
    const courseId = url.searchParams.get('course');
    const mode = url.searchParams.get('mode') || 'normal';
    const course = courseOf(courseId);
    if (!course) throw fail(400, '없는 코스예요.');
    const done = (u.progress[courseId] || {}).done || {};
    if (mode === 'practice') {
      // 이미 끝낸 레슨 중 하나를 골라 연습 (하트 필요 없음)
      const keys = Object.keys(done).filter((k) => done[k]);
      if (!keys.length) throw fail(400, '먼저 레슨을 하나 끝내요!');
      const key = keys[Math.floor(Math.random() * keys.length)];
      const [unit, lesson] = key.split('-').map(Number);
      const variant = Math.floor(Math.random() * 3);
      return { ...(await getLesson(courseId, unit, lesson, variant)), unit, lesson };
    }
    const unit = Number(url.searchParams.get('unit'));
    if (!(unit >= 0 && unit < course.units.length)) throw fail(400, '없는 레슨이에요.');
    if (mode === 'jump') {
      // 단원 건너뛰기 시험: 그 단원의 복습 레슨 (하트 필요 없음)
      if (unitDone(done, unit)) throw fail(400, '이미 끝낸 단원이에요.');
      return { ...(await getLesson(courseId, unit, LESSONS_PER_UNIT - 1, 0)), unit, lesson: LESSONS_PER_UNIT - 1 };
    }
    const lesson = Number(url.searchParams.get('lesson'));
    if (!(lesson >= 0 && lesson < LESSONS_PER_UNIT)) throw fail(400, '없는 레슨이에요.');
    if (energy(u).n < 1) throw fail(403, '에너지가 없어요. 조금 쉬거나 보석으로 채워요!');
    // 다시 하는 레슨이면 다른 판을 준다 (0~2판 돌려 가며)
    const variant = (done[`${unit}-${lesson}`] || 0) % 3;
    return await getLesson(courseId, unit, lesson, variant);
  },
  async 'POST /api/energy'(req, u) {
    // 문제 하나 풀 때마다(맞든 틀리든) 1 쓴다
    const e = energy(u);
    if (e.n > 0) {
      if (e.n === MAX_ENERGY) u.energy.t = Date.now();
      u.energy.n -= 1;
    }
    save();
    return { energy: energy(u) };
  },
  async 'POST /api/complete'(req, u) {
    const { course: courseId, unit, lesson, mistakes = 0 } = await body(req);
    const course = courseOf(courseId);
    if (!course || !(unit >= 0 && unit < course.units.length) || !(lesson >= 0 && lesson < LESSONS_PER_UNIT)) throw fail(400, '없는 레슨이에요.');
    const prog = (u.progress[courseId] ||= { done: {} });
    const key = `${unit}-${lesson}`;
    const first = !prog.done[key];
    prog.done[key] = (prog.done[key] || 0) + 1;
    const xp = (first ? 10 : 5) + (mistakes === 0 ? 5 : 0);
    const gems = (first ? 5 : 2) + (mistakes === 0 ? 3 : 0);
    u.gems = (u.gems || 0) + gems;
    const streakUp = addXp(u, xp);
    u.course = courseId;
    save();
    return { xp, gems, first, streakUp, user: publicUser(u) };
  },
  async 'POST /api/placement'(req, u) {
    const { course: courseId, unit } = await body(req);
    const course = courseOf(courseId);
    if (!course) throw fail(400, '없는 코스예요.');
    if (!(Number.isInteger(unit) && unit >= 0 && unit < course.units.length)) throw fail(400, '없는 단원이에요.');
    const prog = (u.progress[courseId] ||= { done: {} });
    if (Object.values(prog.done).some(Boolean)) throw fail(400, '이미 시작한 코스예요.');
    markUnits(prog, 0, unit); // unit 앞 단원까지 끝낸 것으로 (XP 없음)
    u.course = courseId;
    save();
    return { user: publicUser(u) };
  },
  async 'POST /api/jump'(req, u) {
    const { course: courseId, unit, mistakes = 0 } = await body(req);
    const course = courseOf(courseId);
    if (!course || !(Number.isInteger(unit) && unit >= 0 && unit < course.units.length)) throw fail(400, '없는 단원이에요.');
    const prog = (u.progress[courseId] ||= { done: {} });
    const passed = Number(mistakes) <= 2;
    let xp = 0;
    let gems = 0;
    let streakUp = false;
    if (passed) {
      markUnits(prog, 0, unit + 1); // 이 단원까지 모두 끝낸 것으로
      xp = 10;
      gems = 5;
      u.gems = (u.gems || 0) + gems;
      streakUp = addXp(u, xp);
      u.course = courseId;
      save();
    }
    return { passed, xp, gems, streakUp, user: publicUser(u) };
  },
  async 'POST /api/practice'(req, u) {
    const { course: courseId } = await body(req);
    if (!courseOf(courseId)) throw fail(400, '없는 코스예요.');
    const e = energy(u);
    const gained = Math.min(5, MAX_ENERGY - e.n);
    u.energy.n += gained;
    const xp = 5;
    const streakUp = addXp(u, xp);
    save();
    return { xp, energy: gained, streakUp, user: publicUser(u) };
  },
  async 'POST /api/shop/energy'(req, u) {
    const e = energy(u);
    if (e.n >= MAX_ENERGY) throw fail(400, '에너지가 이미 가득해요.');
    if ((u.gems || 0) < 40) throw fail(400, '보석이 모자라요.');
    u.gems -= 40;
    u.energy = { n: MAX_ENERGY, t: Date.now() };
    save();
    return { user: publicUser(u) };
  },
  async 'POST /api/chest'(req, u) {
    // 단원마다 2번째 레슨 뒤에 있는 상자: 보석 10~30개, 한 번만
    const { course: courseId, unit } = await body(req);
    const course = courseOf(courseId);
    if (!course || !(Number.isInteger(unit) && unit >= 0 && unit < course.units.length)) throw fail(400, '없는 상자예요.');
    const done = (u.progress[courseId] || {}).done || {};
    if (!done[`${unit}-0`] || !done[`${unit}-1`]) throw fail(400, '앞 레슨을 먼저 끝내요!');
    u.chests = u.chests || {};
    const opened = (u.chests[courseId] ||= []);
    if (opened.includes(unit)) throw fail(400, '이미 연 상자예요.');
    opened.push(unit);
    const gems = 10 + Math.floor(Math.random() * 21);
    u.gems = (u.gems || 0) + gems;
    save();
    return { gems, user: publicUser(u) };
  },
  // ───── 대결 ─────
  async 'GET /api/users'(req, u) {
    const list = Object.values(db.users).filter((x) => !x.guest && x.id !== u.id).map(publicUser)
      .map((p) => ({ id: p.id, nick: p.nick, weekXp: p.weekXp }))
      .sort((a, b) => b.weekXp - a.weekXp || a.nick.localeCompare(b.nick)).slice(0, 50);
    return { list };
  },
  async 'POST /api/duel'(req, u) {
    const { opponent } = await body(req);
    let to = BOT;
    if (opponent && opponent !== BOT.id) {
      const o = db.users[String(opponent).toLowerCase()];
      if (!o) throw fail(400, '없는 아이디예요.');
      if (o.id === u.id) throw fail(400, '나 자신과는 대결할 수 없어요.');
      if (o.guest) throw fail(400, '체험 계정에는 도전할 수 없어요.');
      to = { id: o.id, nick: o.nick };
    }
    const courseId = courseOf(u.course) ? u.course : 'en';
    const exercises = duelExercises(u, courseId);
    if (exercises.length < 4) throw fail(400, '대결 문제를 만들지 못했어요.');
    cleanDuels();
    const duel = { id: randomBytes(6).toString('hex'), course: courseId, from: { id: u.id, nick: u.nick }, to, exercises, created: Date.now(), results: {}, status: 'waiting', winner: null };
    db.duels[duel.id] = duel;
    save();
    return { duel };
  },
  async 'POST /api/duel/finish'(req, u) {
    const { id, correct, ms } = await body(req);
    const d = db.duels[id];
    if (!d || !isIn(d, u)) throw fail(404, '없는 대결이에요.');
    if (d.results[u.id]) throw fail(400, '이미 끝낸 대결이에요.');
    const total = d.exercises.length;
    d.results[u.id] = { correct: Math.max(0, Math.min(total, Math.round(Number(correct) || 0))), ms: Math.max(0, Math.round(Number(ms) || 0)) };
    if (d.to.id === BOT.id && !d.results[BOT.id]) {
      d.results[BOT.id] = { correct: Math.min(total, 5 + Math.floor(Math.random() * 4)), ms: 25000 + Math.floor(Math.random() * 35001) };
    }
    const a = d.results[d.from.id];
    const b = d.results[d.to.id];
    if (a && b && d.status !== 'done') {
      d.status = 'done';
      const fromWins = a.correct !== b.correct ? a.correct > b.correct : a.ms <= b.ms;
      d.winner = fromWins ? d.from.id : d.to.id;
      const loser = fromWins ? d.to.id : d.from.id;
      const w = db.users[d.winner];
      if (w) { w.gems = (w.gems || 0) + 10; addXp(w, 10); }
      const l = db.users[loser];
      if (l) addXp(l, 3);
    }
    save();
    return { duel: duelView(d, u), won: d.status === 'done' ? d.winner === u.id : null, user: publicUser(u) };
  },
  async 'GET /api/duels'(req, u) {
    const list = Object.values(db.duels).filter((d) => isIn(d, u)).sort((a, b) => b.created - a.created).slice(0, 20).map((d) => duelView(d, u));
    return { list };
  },
  async 'GET /api/duel'(req, u, url) {
    const d = db.duels[url.searchParams.get('id')];
    if (!d || !isIn(d, u)) throw fail(404, '없는 대결이에요.');
    const v = duelView(d, u);
    if (v.myTurn) v.exercises = d.exercises;
    return { duel: v };
  },
  async 'GET /api/leaderboard'() {
    const list = Object.values(db.users).map(publicUser).map((p) => ({ id: p.id, nick: p.nick, weekXp: p.weekXp, streak: p.streak.count }))
      .sort((a, b) => b.weekXp - a.weekXp || a.nick.localeCompare(b.nick)).slice(0, 50);
    return { week: weekStart(), list };
  },
  async 'GET /api/status'() {
    return { ai: hasAnyKey(), gemini: (config.geminiKeys || []).filter(Boolean).length, grok: (config.grokKeys || []).filter(Boolean).length };
  }
};
const PUBLIC_ROUTES = new Set(['POST /api/signup', 'POST /api/login', 'POST /api/guest', 'GET /api/status']);

// GitHub 사이트(화면)에서 이 컴퓨터 서버를 부를 수 있게 허락할 주소들
const allowedOrigin = (origin) => {
  const list = config.allowOrigins || ['https://sherlock12369-collab.github.io'];
  return origin && (list.includes(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) ? origin : null;
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const origin = allowedOrigin(req.headers.origin);
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Max-Age', '600');
    // 크롬·엣지: 공개 사이트(github.io)가 이 컴퓨터(localhost)를 부를 때 필요한 허락
    if (req.headers['access-control-request-private-network']) res.setHeader('Access-Control-Allow-Private-Network', 'true');
  }
  if (req.method === 'OPTIONS') { res.writeHead(origin ? 204 : 403); res.end(); return; }
  try {
    if (url.pathname.startsWith('/api/')) {
      const name = `${req.method} ${url.pathname}`;
      const fn = routes[name];
      if (!fn) throw fail(404, '없는 주소예요.');
      const u = userOf(req);
      if (!PUBLIC_ROUTES.has(name) && !u) throw fail(401, '다시 로그인해 주세요.');
      return send(res, 200, await fn(req, u, url));
    }
    // 화면 파일
    let p = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
    if (!p || p.endsWith('/') || p.endsWith('\\')) p += 'index.html';
    let file = join(PUBLIC, p);
    if (!file.startsWith(PUBLIC)) throw fail(403, '안 돼요');
    if (!existsSync(file) || (await stat(file)).isDirectory()) file = join(PUBLIC, 'index.html');
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(await readFile(file));
  } catch (err) {
    if (!err.status) console.error(err);
    send(res, err.status || 500, { error: err.status ? err.message : '서버 오류가 났어요.' });
  }
});

const PORT = Number(process.env.PORT) || config.port;
server.listen(PORT, '0.0.0.0', () => {
  const lan = Object.values(os.networkInterfaces()).flat().filter((a) => a && a.family === 'IPv4' && !a.internal).map((a) => a.address);
  console.log(`\n  슬터디 서버가 켜졌어요!`);
  console.log(`  이 컴퓨터:  http://localhost:${PORT}`);
  for (const ip of lan) console.log(`  같은 와이파이의 폰:  http://${ip}:${PORT}`);
  console.log(`  가입 코드: ${config.inviteCodes.join(', ')}`);
  console.log(`  AI 키: Gemini ${(config.geminiKeys || []).filter(Boolean).length}개, Grok ${(config.grokKeys || []).filter(Boolean).length}개${hasAnyKey() ? '' : '  (없으면 내장 레슨만 돼요)'}\n`);
});
