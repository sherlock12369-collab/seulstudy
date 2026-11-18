// 슬터디 — 화면 전체 틀 (로그인, 레슨 길, 레슨 진행, 끝 화면, 순위, 내 정보)
// 문제 하나하나의 화면은 exercises.js, 소리는 sound.js 가 맡는다.
import { COURSES, courseOf, LESSONS_PER_UNIT, lessonKey } from './courses.js';
import { mountExercise } from './exercises.js';
import { sfx, speak, sfxOn, setSfxOn, speechOn, setSpeechOn, hasVoice, unlockAudio } from './sound.js';

const $ = (s, r = document) => r.querySelector(s);
const app = $('#app');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = {
  get(k) { try { return localStorage.getItem('seulstudy.' + k); } catch { return null; } },
  set(k, v) { try { v == null ? localStorage.removeItem('seulstudy.' + k) : localStorage.setItem('seulstudy.' + k, v); } catch { /* 저장 안 됨 */ } }
};
const S = { token: store.get('token'), user: null, tab: 'learn' };
const CHEST_AFTER = 1; // 단원마다 이 레슨 뒤에 상자
const ENERGY_PRICE = 40;

document.addEventListener('pointerdown', () => unlockAudio(), { once: true });

// ───────── 서버 주소 ─────────
// 이 컴퓨터 서버에서 열면 같은 곳. GitHub 사이트에서 열면 server.json에 적힌 주소(이 컴퓨터로 가는 터널).
let API = '';
async function findServer() {
  const manual = new URLSearchParams(location.search).get('server');
  if (manual) store.set('server', manual.replace(/\/$/, ''));
  if (store.get('server')) { API = store.get('server'); return; }
  if (!location.hostname.endsWith('github.io')) return;
  try {
    const j = await (await fetch('server.json?_=' + Date.now(), { cache: 'no-store' })).json();
    API = String(j.url || '').replace(/\/$/, '');
  } catch { /* 없음 */ }
}

async function api(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(API + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(S.token ? { Authorization: 'Bearer ' + S.token } : {}) },
      body: body ? JSON.stringify(body) : undefined
    });
  } catch {
    throw new Error('서버에 연결하지 못했어요. 서버 컴퓨터가 켜져 있는지 확인해 주세요.');
  }
  const j = await res.json().catch(() => ({}));
  if (res.status === 401 && S.token) { logout(); throw new Error(j.error || '다시 로그인해 주세요.'); }
  if (!res.ok) throw Object.assign(new Error(j.error || '서버에 연결하지 못했어요.'), { status: res.status });
  return j;
}
function logout() {
  if (S.token) fetch(API + '/api/logout', { method: 'POST', headers: { Authorization: 'Bearer ' + S.token } }).catch(() => {});
  S.token = null; S.user = null; store.set('token', null);
  render();
}
function signedIn({ token, user }) {
  S.token = token; S.user = user; store.set('token', token); S.tab = 'learn';
  render();
  if (!user.course) setTimeout(openCourses, 300);
}

// ───────── 그림 ─────────
function robot(mood = 'happy', style = '') {
  const mouth = mood === 'sad' ? 'M88 124 Q100 114 112 124' : mood === 'think' ? 'M90 120 h20' : 'M86 114 Q100 132 114 114';
  const eyes = mood === 'wow'
    ? '<path d="M68 96 q10-14 20 0" stroke="#1d2a3a" stroke-width="6" fill="none" stroke-linecap="round"/><path d="M112 96 q10-14 20 0" stroke="#1d2a3a" stroke-width="6" fill="none" stroke-linecap="round"/>'
    : '<ellipse cx="78" cy="94" rx="9" ry="12" fill="#1d2a3a"/><ellipse cx="122" cy="94" rx="9" ry="12" fill="#1d2a3a"/><circle cx="81" cy="89" r="3" fill="#fff"/><circle cx="125" cy="89" r="3" fill="#fff"/>';
  return `<svg class="robot ${mood}" viewBox="0 0 200 200" aria-hidden="true" style="${style}">
    <line x1="100" y1="38" x2="100" y2="18" stroke="#2f74d0" stroke-width="5" stroke-linecap="round"/>
    <circle class="antenna" cx="100" cy="15" r="9" fill="#ffc94a"/>
    <rect x="30" y="38" width="140" height="118" rx="56" fill="#4f9cf9"/>
    <rect x="18" y="80" width="16" height="32" rx="8" fill="#2f74d0"/><rect x="166" y="80" width="16" height="32" rx="8" fill="#2f74d0"/>
    <rect x="48" y="58" width="104" height="78" rx="38" fill="#eaf4ff"/>
    ${eyes}
    <ellipse cx="64" cy="114" rx="8" ry="5" fill="#ff9fb0"/><ellipse cx="136" cy="114" rx="8" ry="5" fill="#ff9fb0"/>
    <path d="${mouth}" fill="${mood === 'wow' ? '#ff7a8a' : 'none'}" stroke="#1d2a3a" stroke-width="4" stroke-linecap="round"/>
    <rect x="70" y="160" width="60" height="26" rx="13" fill="#2f74d0"/></svg>`;
}
const I = {
  fire: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2c1 3.5 5 6 5 11a5 5 0 0 1-10 0c0-2.2 1-3.8 2.2-5 .2 1.6 1 2.6 2 3 0-3.2-.6-6.2.8-9z"/></svg>',
  bolt: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></svg>',
  gem: '<svg viewBox="0 0 24 24"><path d="M6 3h12l4 6-10 12L2 9z" fill="#4fc3f7"/><path d="M2 9h20L12 21z" fill="#29a8e0"/><path d="M6 3l3 6h6l3-6" fill="#8ad8fb"/></svg>',
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"><path d="M4 11 12 4l8 7v9h-5v-6H9v6H4z"/></svg>',
  trophy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 20h8"/></svg>',
  user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="8" r="4"/><path d="M4 21c1-4.5 4.5-6 8-6s7 1.5 8 6"/></svg>',
  shop: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"><path d="M4 9h16l-1 11H5zM8 9V7a4 4 0 0 1 8 0v2"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  star: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="m12 2.5 2.9 6 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.2 1.3-6.6-4.9-4.6 6.6-.8z"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
  lock: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 10V8a5 5 0 0 1 10 0v2h1v11H6V10zm2 0h6V8a3 3 0 0 0-6 0z"/></svg>',
  crown: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 7l4.5 4L12 4l4.5 7L21 7l-2 12H5z"/></svg>',
  swords: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 17.5 3 6V3h3l11.5 11.5M13 19l6-6M16 16l4 4M19 21l2-2M9.5 6.5 14 2h3v3l-4.5 4.5M5 14l4 4M7 17l-3 3M3 19l2 2"/></svg>',
  dumbbell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 7v10M3 9v6M18 7v10M21 9v6M6 12h12"/></svg>',
  skip: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 5l9 7-9 7zM13 5l9 7-9 7z"/></svg>',
  speaker: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 8a5 5 0 0 1 0 8M18.5 5.5a8.5 8.5 0 0 1 0 13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  full: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
  nofull: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/></svg>'
};
const CHEST = (open) => `<svg viewBox="0 0 64 64" aria-hidden="true">
  ${open ? '<path d="M8 22 L12 8 H52 L56 22Z" fill="#c98a2b"/><path d="M14 10h36l3 10H11z" fill="#e8a83a"/>' : '<path d="M8 28 Q8 12 32 12 Q56 12 56 28Z" fill="#e8a83a"/><path d="M8 28 Q8 12 32 12 Q56 12 56 28" fill="none" stroke="#b7791f" stroke-width="3"/>'}
  <rect x="8" y="28" width="48" height="26" rx="4" fill="#d9952f"/><rect x="8" y="28" width="48" height="6" fill="#b7791f"/>
  <rect x="28" y="26" width="8" height="12" rx="2" fill="#ffd866"/>
  ${open ? '<circle cx="24" cy="20" r="5" fill="#4fc3f7"/><circle cx="38" cy="18" r="5" fill="#8ad8fb"/><circle cx="31" cy="22" r="4" fill="#29a8e0"/>' : ''}</svg>`;

function toast(msg, ms = 2600) {
  document.querySelectorAll('.toast').forEach((t) => t.remove());
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.append(t);
  setTimeout(() => t.remove(), ms);
}
function sheet(html, { onClose } = {}) {
  const bg = document.createElement('div');
  bg.className = 'sheet-bg';
  bg.innerHTML = `<div class="sheet">${html}</div>`;
  const close = () => { bg.remove(); onClose && onClose(); };
  bg.onclick = (e) => { if (e.target === bg) close(); };
  document.body.append(bg);
  return { el: bg, close };
}
const mins = (ms) => Math.max(1, Math.ceil(ms / 60000));

// ───────── 전체 화면 ─────────
const canFull = () => !!document.documentElement.requestFullscreen;
async function toggleFull() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
  } catch { toast('이 브라우저는 전체 화면을 지원하지 않아요. 메뉴에서 “홈 화면에 추가”를 해 보세요.'); }
}
document.addEventListener('fullscreenchange', () => { const b = $('#btn-full'); if (b) b.innerHTML = document.fullscreenElement ? I.nofull : I.full; });

// ───────── 그리기 ─────────
function render() {
  document.onkeydown = null;
  if (!S.token) return renderAuth();
  if (!S.user) {
    app.innerHTML = `<div class="center"><div class="spinner"></div></div>`;
    api('/api/me').then((j) => { S.user = j.user; render(); if (!j.user.course) setTimeout(openCourses, 300); }).catch((err) => {
      app.innerHTML = `<div class="center">${robot('sad', 'width:120px;margin:0 auto')}<p>${esc(err.message)}</p><button class="btn" id="retry">다시 시도</button></div>`;
      $('#retry').onclick = render;
    });
    return;
  }
  renderShell();
}

// ───────── 로그인 · 가입 · 체험 ─────────
function renderAuth(mode = 'login') {
  app.innerHTML = `
  <div class="auth">
    ${robot('happy')}
    <h1>슬터디</h1>
    <p class="lead">슬이랑 하루 5분, 영어·일본어·체스까지</p>
    <div class="tabs"><button data-m="login" class="${mode === 'login' ? 'on' : ''}">로그인</button><button data-m="signup" class="${mode === 'signup' ? 'on' : ''}">가입하기</button></div>
    <form id="auth-form" class="field" style="gap:12px" autocomplete="on">
      ${mode === 'signup' ? `<label class="field"><span>가입 코드</span><input class="input" name="code" required autocomplete="off" placeholder="받은 가입 코드"></label>` : ''}
      <label class="field"><span>아이디</span><input class="input" name="id" required autocapitalize="none" autocomplete="username" placeholder="영어 소문자·숫자 3~16자"></label>
      <label class="field"><span>비밀번호</span><input class="input" name="pass" type="password" required autocomplete="${mode === 'signup' ? 'new-password' : 'current-password'}" placeholder="4자 이상"></label>
      ${mode === 'signup' ? `<label class="field"><span>이름 (순위표에 보여요)</span><input class="input" name="nick" maxlength="12" placeholder="예: 슬기"></label>` : ''}
      <div class="err" id="auth-err"></div>
      <button class="btn" type="submit">${mode === 'signup' ? '가입하고 시작하기' : '로그인'}</button>
    </form>
    <button class="btn ghost" id="guest">가입 없이 체험하기</button>
  </div>`;
  app.querySelectorAll('.tabs button').forEach((b) => { b.onclick = () => renderAuth(b.dataset.m); });
  $('#auth-form').onsubmit = async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    const btn = e.target.querySelector('button[type=submit]');
    btn.disabled = true;
    try { signedIn(await api(mode === 'signup' ? '/api/signup' : '/api/login', { method: 'POST', body: f })); }
    catch (err) { $('#auth-err').textContent = err.message; btn.disabled = false; }
  };
  $('#guest').onclick = async () => {
    try { signedIn(await api('/api/guest', { method: 'POST' })); toast('체험 계정이에요. 로그아웃하면 이 기록은 다시 못 찾아요.'); }
    catch (err) { $('#auth-err').textContent = err.message; }
  };
}

// ───────── 위 막대 · 아래 탭 ─────────
const currentCourse = () => courseOf(S.user.course) || COURSES[0];
const energyOf = () => S.user.energy || { n: 0, max: 25, next: null };
function renderShell() {
  const u = S.user;
  const c = currentCourse();
  const e = energyOf();
  app.innerHTML = `
    <div class="topbar">
      <button class="course-chip" id="course-chip" title="코스 바꾸기"><span class="badge" style="background:${c.color}">${esc(c.badge)}</span></button>
      <span class="spacer"></span>
      <button class="stat fire ${u.streak.today ? '' : 'off'}" title="연속 학습일" data-tab="me">${I.fire}${u.streak.count}</button>
      <button class="stat gemst" title="보석" data-tab="shop">${I.gem}${u.gems || 0}</button>
      <button class="stat energy ${e.n <= 5 ? 'low' : ''}" title="에너지" id="top-energy">${I.bolt}${e.n}</button>
      ${canFull() ? `<button class="icon-btn" id="btn-full" title="전체 화면">${document.fullscreenElement ? I.nofull : I.full}</button>` : ''}
    </div>
    <div class="main" id="main"></div>
    <nav class="nav" style="--tabs:5">
      <button data-tab="learn" class="${S.tab === 'learn' ? 'on' : ''}">${I.home}배우기</button>
      <button data-tab="duel" class="${S.tab === 'duel' ? 'on' : ''}">${I.swords}대결</button>
      <button data-tab="rank" class="${S.tab === 'rank' ? 'on' : ''}">${I.trophy}리그</button>
      <button data-tab="shop" class="${S.tab === 'shop' ? 'on' : ''}">${I.shop}상점</button>
      <button data-tab="me" class="${S.tab === 'me' ? 'on' : ''}">${I.user}나</button>
    </nav>`;
  app.querySelectorAll('[data-tab]').forEach((b) => { b.onclick = () => { S.tab = b.dataset.tab; renderShell(); }; });
  $('#course-chip').onclick = openCourses;
  $('#top-energy').onclick = energySheet;
  if ($('#btn-full')) $('#btn-full').onclick = toggleFull;
  ({ learn: renderPath, duel: renderDuel, rank: renderRank, shop: renderShop, me: renderMe })[S.tab]($('#main'));
}

function energySheet() {
  const e = energyOf();
  const s = sheet(`
    <div style="display:flex;gap:14px;align-items:center"><span class="big-ico energy">${I.bolt}</span><div><h2 class="display" style="margin:0">에너지 ${e.n} / ${e.max}</h2>
    <small class="muted">문제 하나에 1칸 써요. ${e.next ? `${mins(e.next - Date.now())}분 뒤에 1칸 차요.` : '가득 찼어요!'}</small></div></div>
    <div class="meter"><div style="width:${Math.round((e.n / e.max) * 100)}%"></div></div>
    <button class="btn" id="es-fill" ${e.n >= e.max ? 'disabled' : ''}>${I.gem.replace('<svg', '<svg style="width:22px;height:22px;vertical-align:-5px"')} ${ENERGY_PRICE}개로 가득 채우기</button>
    <button class="btn ghost" id="es-practice">${I.dumbbell.replace('<svg', '<svg style="width:22px;height:22px;vertical-align:-5px"')} 연습해서 에너지 +5 받기</button>`);
  $('#es-fill', s.el).onclick = async () => { s.close(); await buyEnergy(); };
  $('#es-practice', s.el).onclick = () => { s.close(); startPractice(); };
}
async function buyEnergy() {
  try {
    S.user = (await api('/api/shop/energy', { method: 'POST' })).user;
    sfx('energy');
    toast('에너지가 가득 찼어요! ⚡');
    renderShell();
  } catch (err) { toast(err.message); }
}

// ───────── 코스 고르기 · 수준 고르기 ─────────
function openCourses() {
  const u = S.user;
  const s = sheet(`<h2 class="display" style="margin:0 0 4px">무엇을 배울까요?</h2>${COURSES.map((c) => {
    const done = Object.keys((u.progress[c.id] || {}).done || {}).length;
    const total = c.units.length * LESSONS_PER_UNIT;
    return `<button class="course-opt ${u.course && c.id === currentCourse().id ? 'on' : ''}" data-c="${c.id}"><span class="badge" style="background:${c.color}">${esc(c.badge)}</span><span style="flex:1"><b class="display" style="font-size:1.15rem">${esc(c.name)}</b><br><small class="muted">${done ? `레슨 ${done} / ${total}` : '새로 시작'}</small></span></button>`;
  }).join('')}`);
  s.el.querySelectorAll('[data-c]').forEach((b) => {
    b.onclick = () => {
      s.close();
      const id = b.dataset.c;
      const started = Object.keys((u.progress[id] || {}).done || {}).length > 0;
      if (!started) return placement(id);
      chooseCourse(id);
    };
  });
}
function chooseCourse(id) {
  S.user.course = id;
  S.tab = 'learn';
  renderShell();
  api('/api/settings', { method: 'POST', body: { course: id } }).then((j) => { S.user = j.user; }).catch(() => {});
}
function placement(id) {
  const c = courseOf(id);
  const n = c.units.length;
  const levels = [
    { unit: 0, t: `${c.name}를 처음 배워요`, d: '처음부터 차근차근', bars: 1 },
    { unit: Math.min(2, n - 1), t: '조금 알아요', d: `단원 ${Math.min(2, n - 1) + 1}부터 시작`, bars: 2 },
    { unit: Math.min(4, n - 1), t: '꽤 알아요', d: `단원 ${Math.min(4, n - 1) + 1}부터 시작`, bars: 3 }
  ];
  const s = sheet(`
    <div class="say">${robot('happy')}<div class="speech">${esc(c.name)}를 얼마나 알아요?</div></div>
    ${levels.map((l, i) => `<button class="course-opt" data-i="${i}"><span class="lvl">${[1, 2, 3].map((k) => `<i class="${k <= l.bars ? 'on' : ''}"></i>`).join('')}</span><span style="flex:1"><b class="display" style="font-size:1.1rem">${esc(l.t)}</b><br><small class="muted">${esc(l.d)}</small></span></button>`).join('')}
    <small class="muted" style="text-align:center">나중에 레슨 길에서 “건너뛰기” 시험으로 더 앞으로 갈 수도 있어요.</small>`);
  s.el.querySelectorAll('[data-i]').forEach((b) => {
    b.onclick = async () => {
      s.close();
      const lv = levels[Number(b.dataset.i)];
      try {
        if (lv.unit > 0) S.user = (await api('/api/placement', { method: 'POST', body: { course: id, unit: lv.unit } })).user;
        chooseCourse(id);
      } catch (err) { toast(err.message); chooseCourse(id); }
    };
  });
}

// ───────── 레슨 길 ─────────
function renderPath(host) {
  const c = currentCourse();
  const done = (S.user.progress[c.id] || {}).done || {};
  const opened = ((S.user.chests || {})[c.id]) || [];
  let current = -1;
  c.units.some((u, ui) => { for (let l = 0; l < LESSONS_PER_UNIT; l++) if (!done[lessonKey(ui, l)]) { current = ui * LESSONS_PER_UNIT + l; return true; } return false; });
  const curUnit = current < 0 ? c.units.length : Math.floor(current / LESSONS_PER_UNIT);
  const anyDone = Object.keys(done).length > 0;
  let step = 0;
  const wave = () => Math.round(Math.sin((step++) * 1.05) * 72);

  const html = c.units.map((unit, ui) => {
    const builtIn = c.kind === 'chess' || !!unit.vocab;
    const unitLocked = ui > curUnit;
    const items = [];
    for (let l = 0; l < LESSONS_PER_UNIT; l++) {
      const idx = ui * LESSONS_PER_UNIT + l;
      const isDone = !!done[lessonKey(ui, l)];
      const isCur = idx === current;
      const locked = !isDone && !isCur;
      const last = l === LESSONS_PER_UNIT - 1;
      const icon = isDone ? (last ? I.crown : I.check) : locked ? I.lock : last ? I.trophy : I.star;
      items.push(`<div style="translate:${wave()}px 0"><button class="node ${isDone ? 'done' : ''} ${isCur ? 'current' : ''} ${locked ? 'locked' : ''}" data-u="${ui}" data-l="${l}" style="--c:${c.color}" aria-label="${esc(unit.title)} 레슨 ${l + 1}">${isCur ? `<span class="bubble">${idx === 0 ? '시작!' : '시작'}</span>` : ''}${icon}</button></div>`);
      if (l === CHEST_AFTER) {
        const ready = !!done[lessonKey(ui, 0)] && !!done[lessonKey(ui, 1)];
        const isOpen = opened.includes(ui);
        items.push(`<div style="translate:${wave()}px 0"><button class="chest ${isOpen ? 'open' : ready ? 'ready' : 'shut'}" data-chest="${ui}" aria-label="보물 상자">${CHEST(isOpen)}</button></div>`);
      }
    }
    return `<div class="unit-card" style="background:${c.color}">
        <div style="flex:1"><p class="unit-no">단원 ${ui + 1}</p><h2>${esc(unit.title)}</h2><p>${esc(unit.desc)}</p></div>
        ${unitLocked ? `<button class="jump" data-jump="${ui}" title="이 단원으로 건너뛰기">${I.skip}<span>건너뛰기</span></button>` : builtIn ? '' : '<span class="ai-tag">AI 레슨</span>'}
      </div><div class="nodes">${items.join('')}</div>`;
  }).join('');
  host.innerHTML = `<div class="path">
    ${anyDone ? `<button class="practice-card" id="practice">${I.dumbbell}<span><b>연습하기</b><small>끝낸 레슨 복습 · 에너지 +5</small></span></button>` : ''}
    ${html}
    ${current < 0 ? `<div class="center">${robot('wow', 'width:120px;margin:0 auto')}<p class="display">이 코스를 다 끝냈어요! 대단해요!</p></div>` : ''}</div>`;

  host.querySelectorAll('.node').forEach((b) => {
    b.onclick = () => {
      if (b.classList.contains('locked')) { sfx('tap'); toast('앞 레슨을 먼저 끝내거나 “건너뛰기” 시험을 봐요!'); return; }
      lessonSheet(c, Number(b.dataset.u), Number(b.dataset.l), b.classList.contains('done'));
    };
  });
  host.querySelectorAll('[data-chest]').forEach((b) => { b.onclick = () => openChest(c.id, Number(b.dataset.chest), b); });
  host.querySelectorAll('[data-jump]').forEach((b) => { b.onclick = () => jumpSheet(c, Number(b.dataset.jump)); });
  if ($('#practice', host)) $('#practice', host).onclick = startPractice;
  const cur = host.querySelector('.node.current');
  if (cur) cur.scrollIntoView({ block: 'center' });
}

function lessonSheet(c, unit, lesson, isDone) {
  const u = c.units[unit];
  const s = sheet(`
    <div class="lesson-pop" style="--c:${c.color}">
      <h2 class="display">${esc(u.title)}</h2>
      <p>레슨 ${lesson + 1} / ${LESSONS_PER_UNIT}${lesson === LESSONS_PER_UNIT - 1 ? ' · 단원 복습' : ''}</p>
      <button class="btn white" id="ls-go">${isDone ? '다시 하기 · +5 XP' : '시작하기 · +10 XP'}</button>
    </div>`);
  $('#ls-go', s.el).onclick = () => { s.close(); startLesson(c.id, unit, lesson); };
}

async function openChest(courseId, unit, btn) {
  if (btn.classList.contains('open')) { toast('이미 연 상자예요.'); return; }
  if (!btn.classList.contains('ready')) { sfx('tap'); toast('앞의 두 레슨을 끝내면 열 수 있어요!'); return; }
  try {
    const r = await api('/api/chest', { method: 'POST', body: { course: courseId, unit } });
    S.user = r.user;
    sfx('chest');
    const s = sheet(`<div class="reward">${CHEST(true)}<h2 class="display">보물 상자!</h2><p class="gem-big">${I.gem} +${r.gems}</p><button class="btn" id="rw-ok">좋아요</button></div>`, { onClose: renderShell });
    $('#rw-ok', s.el).onclick = s.close;
  } catch (err) { toast(err.message); }
}

function jumpSheet(c, unit) {
  const s = sheet(`
    <div class="say">${robot('think')}<div class="speech">단원 ${unit + 1}로 건너뛸까요?</div></div>
    <p class="muted" style="margin:0">“${esc(c.units[unit].title)}” 시험을 봐요. <b>3번 틀리면</b> 끝나요. 통과하면 이 단원까지 모두 열려요. 에너지는 안 써요.</p>
    <button class="btn" id="js-go">시험 보기</button><button class="btn ghost" id="js-no">다음에</button>`);
  $('#js-go', s.el).onclick = () => { s.close(); startLesson(c.id, unit, LESSONS_PER_UNIT - 1, 'jump'); };
  $('#js-no', s.el).onclick = s.close;
}

// ───────── 레슨 진행 ─────────
function loadingScreen(text) {
  app.innerHTML = `<div class="center">${robot('think', 'width:120px;margin:0 auto')}<div class="spinner"></div><p class="muted">${esc(text)}</p></div>`;
}
function errorScreen(msg, extra = '') {
  app.innerHTML = `<div class="center">${robot('sad', 'width:120px;margin:0 auto')}<p>${esc(msg)}</p>${extra}<button class="btn" id="back">돌아가기</button></div>`;
  $('#back').onclick = render;
}

async function startLesson(courseId, unit, lesson, mode = 'normal') {
  if (mode === 'normal' && energyOf().n <= 0) { energySheet(); return; }
  document.onkeydown = null;
  loadingScreen(mode === 'jump' ? '시험 문제를 준비하고 있어요…' : '슬이 문제를 준비하고 있어요…');
  try {
    const data = await api(`/api/lesson?course=${courseId}&unit=${unit}&lesson=${lesson}${mode === 'normal' ? '' : '&mode=' + mode}`);
    runLesson({ courseId, unit, lesson, mode, exercises: data.exercises });
  } catch (err) {
    errorScreen(err.message);
  }
}
async function startPractice() {
  const c = currentCourse();
  loadingScreen('복습할 문제를 고르고 있어요…');
  try {
    const data = await api(`/api/lesson?course=${c.id}&mode=practice&unit=0&lesson=0`);
    runLesson({ courseId: c.id, unit: data.unit, lesson: data.lesson, mode: 'practice', exercises: data.exercises });
  } catch (err) { errorScreen(err.message); }
}

function runLesson(L) {
  const total = L.exercises.length;
  const queue = L.exercises.slice();
  const MAX_MISS = 3; // 건너뛰기 시험
  let right = 0;
  let mistakes = 0;
  let combo = 0;
  let bestCombo = 0;
  let ctrl = null;
  let phase = 'answer';
  const started = Date.now();

  const topRight = () => L.mode === 'jump'
    ? `<span class="tries">${Array.from({ length: MAX_MISS }, (_, i) => `<i class="${i < MAX_MISS - mistakes ? 'on' : ''}"></i>`).join('')}</span>`
    : L.mode === 'practice' ? `<span class="tag-practice">${I.dumbbell}연습</span>`
      : `<span class="stat energy">${I.bolt}<span id="energy-n">${energyOf().n}</span></span>`;

  app.innerHTML = `
    <div class="lesson ${L.mode}">
      <div class="lesson-top">
        <button class="icon-btn" id="quit" title="그만하기">${I.x}</button>
        <div class="progress"><div id="bar" style="width:0"></div><span class="combo-tag" id="combo-tag"></span></div>
        <span id="top-right">${topRight()}</span>
      </div>
      <div class="q" id="q"></div>
      <div class="foot" id="foot"></div>
    </div>`;
  const q = $('#q');
  const foot = $('#foot');
  $('#quit').onclick = () => {
    const s = sheet(`<div class="say">${robot('sad')}<div class="speech">정말 그만할까요? 지금까지 한 건 저장되지 않아요.</div></div><button class="btn" id="qt-stay">계속 배우기</button><button class="btn ghost" id="qt-leave" style="color:var(--bad-d)">그만하기</button>`);
    $('#qt-stay', s.el).onclick = s.close;
    $('#qt-leave', s.el).onclick = () => { s.close(); document.onkeydown = null; render(); };
  };
  const setBar = () => {
    $('#bar').style.width = `${Math.round((right / total) * 100)}%`;
    const tag = $('#combo-tag');
    tag.textContent = combo >= 2 ? `${combo}연속!` : '';
    tag.classList.toggle('on', combo >= 2);
  };

  function next() {
    if (!queue.length) return finish();
    if (L.mode === 'normal' && energyOf().n <= 0) return outOfEnergy();
    phase = 'answer';
    const ex = queue[0];
    foot.className = 'foot';
    foot.innerHTML = `<button class="btn ghost skip-btn" id="skip">건너뛰기</button><button class="btn" id="go" disabled>확인</button>`;
    $('#go').onclick = check;
    $('#skip').onclick = () => { if (phase === 'answer') feedback(false, ctrl.check().solution, true); };
    ctrl = mountExercise(ex, q, {
      speak,
      sfx,
      robotSvg: robot('happy'),
      setReady: (ready) => { if (phase === 'answer' && $('#go')) $('#go').disabled = !ready; },
      finish: (r) => { if (phase === 'answer') { mistakes += ctrl.mistakes || 0; feedback(!!r.correct, r.solution || ''); } }
    });
    if (ctrl.auto) foot.innerHTML = `<button class="btn ghost" disabled>짝을 모두 맞추면 넘어가요</button>`;
    q.scrollTop = 0;
  }

  function check() {
    if (phase !== 'answer' || !ctrl) return;
    const r = ctrl.check();
    feedback(r.correct, r.solution, false, r.speakAfter);
  }

  function spendEnergy() {
    if (L.mode !== 'normal') return;
    S.user.energy = { ...energyOf(), n: Math.max(0, energyOf().n - 1) };
    if ($('#energy-n')) $('#energy-n').textContent = S.user.energy.n;
    api('/api/energy', { method: 'POST' }).then((j) => { S.user.energy = j.energy; if ($('#energy-n')) $('#energy-n').textContent = j.energy.n; }).catch(() => {});
  }

  function feedback(correct, solution, skipped = false, speakAfter = null) {
    phase = 'feedback';
    try { ctrl.lock(); } catch { /* 이미 잠김 */ }
    const ex = queue.shift();
    spendEnergy();
    if (correct) {
      right++;
      combo++;
      bestCombo = Math.max(bestCombo, combo);
      if (combo >= 3 && combo % 2 === 1) { sfx('combo'); showCombo(combo); } else sfx('good');
      if (speakAfter && speakAfter.text) setTimeout(() => speak(speakAfter.text, speakAfter.lang), 250);
    } else {
      mistakes++;
      combo = 0;
      queue.push(ex); // 틀린 문제는 뒤에서 다시
      sfx('bad');
      if (L.mode === 'jump') $('#top-right').innerHTML = topRight();
    }
    setBar();
    const praise = ['좋아요!', '멋져요!', '정답!', '완벽해요!', '잘했어요!', '대단해요!'][Math.floor(Math.random() * 6)];
    foot.className = 'foot ' + (correct ? 'good' : 'bad');
    foot.innerHTML = `
      <div class="verdict"><span class="ico">${correct ? I.check : I.x}</span><div><b>${correct ? praise : skipped ? '다음에 다시 나와요' : '정답은:'}</b>${!correct && solution ? `<div class="detail">${esc(solution)}</div>` : ''}</div></div>
      <button class="btn ${correct ? 'good' : 'bad'}" id="go">계속</button>`;
    $('#go').onclick = () => {
      if (L.mode === 'jump' && mistakes >= MAX_MISS) return jumpFailed();
      next();
    };
    $('#go').focus({ preventScroll: true });
  }

  function showCombo(n) {
    const b = document.createElement('div');
    b.className = 'combo-pop';
    b.innerHTML = `${robot('wow', 'width:64px')}<b>${n}연속 정답!</b>`;
    app.append(b);
    setTimeout(() => b.remove(), 1400);
  }

  function outOfEnergy() {
    document.onkeydown = null;
    app.innerHTML = `<div class="result">${robot('sad')}<h1 style="color:var(--blue-d)">에너지가 다 떨어졌어요</h1>
      <p class="muted">에너지는 6분마다 1칸씩 차요. 보석으로 바로 채우거나 연습으로 받을 수 있어요.</p>
      <button class="btn" id="oe-buy">${I.gem.replace('<svg', '<svg style="width:22px;height:22px;vertical-align:-5px"')} ${ENERGY_PRICE}개로 채우고 계속하기</button>
      <button class="btn ghost" id="oe-back">그만하기</button></div>`;
    $('#oe-buy').onclick = async () => {
      try {
        S.user = (await api('/api/shop/energy', { method: 'POST' })).user;
        sfx('energy');
        runLessonResume();
      } catch (err) { toast(err.message); }
    };
    $('#oe-back').onclick = render;
  }
  function runLessonResume() { runLesson({ ...L, exercises: queue }); }

  function jumpFailed() {
    document.onkeydown = null;
    sfx('bad');
    app.innerHTML = `<div class="result">${robot('sad')}<h1 style="color:var(--bad-d)">아쉬워요!</h1><p class="muted">3번 틀려서 시험이 끝났어요. 앞 단원부터 차근차근 해 봐요. 언제든 다시 볼 수 있어요.</p><button class="btn" id="back">돌아가기</button></div>`;
    $('#back').onclick = render;
  }

  async function finish() {
    document.onkeydown = null;
    app.innerHTML = `<div class="center"><div class="spinner"></div></div>`;
    let r;
    try {
      if (L.mode === 'jump') r = await api('/api/jump', { method: 'POST', body: { course: L.courseId, unit: L.unit, mistakes } });
      else if (L.mode === 'practice') r = await api('/api/practice', { method: 'POST', body: { course: L.courseId, mistakes } });
      else r = await api('/api/complete', { method: 'POST', body: { course: L.courseId, unit: L.unit, lesson: L.lesson, mistakes } });
    } catch (err) { toast(err.message); render(); return; }
    S.user = r.user;
    if (L.mode === 'jump' && !r.passed) return jumpFailed();
    sfx('done');
    const acc = Math.round((total / (total + mistakes)) * 100);
    const secs = Math.round((Date.now() - started) / 1000);
    const time = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
    const title = L.mode === 'jump' ? `단원 ${L.unit + 1}까지 열었어요!` : L.mode === 'practice' ? '연습 완료!' : mistakes === 0 ? '완벽한 레슨!' : '레슨 완료!';
    app.innerHTML = `
      <div class="result">
        <div class="confetti" aria-hidden="true">${Array.from({ length: 24 }, (_, i) => `<i style="--x:${(i * 37) % 100}%;--d:${(i % 6) * 0.12}s;--c:${['#ffc94a', '#4f9cf9', '#ff6b8a', '#2fbf71', '#8a6cf0'][i % 5]}"></i>`).join('')}</div>
        ${robot('wow')}
        <h1>${title}</h1>
        ${r.streakUp ? `<p class="streak-up">${I.fire}<b>연속 ${r.user.streak.count}일째!</b></p>` : ''}
        <div class="cards">
          <div class="mini" style="--c:var(--gold-d)"><div class="h">얻은 XP</div><div class="v" data-count="${r.xp || 0}">+0</div></div>
          <div class="mini" style="--c:var(--good)"><div class="h">${acc >= 100 ? '완벽!' : '정확도'}</div><div class="v">${acc}%</div></div>
          <div class="mini" style="--c:#8a6cf0"><div class="h">시간</div><div class="v">${time}</div></div>
        </div>
        <div class="rewards">
          ${r.gems ? `<span>${I.gem}+${r.gems}</span>` : ''}
          ${r.energy ? `<span class="energy">${I.bolt}+${r.energy}</span>` : ''}
          ${bestCombo >= 3 ? `<span class="combo">최고 ${bestCombo}연속</span>` : ''}
        </div>
        <button class="btn" id="go">계속</button>
      </div>`;
    const v = app.querySelector('[data-count]');
    const goal = Number(v.dataset.count);
    let k = 0;
    const tick = setInterval(() => { k = Math.min(goal, k + Math.max(1, Math.ceil(goal / 15))); v.textContent = '+' + k; if (k >= goal) clearInterval(tick); }, 45);
    $('#go').onclick = () => { S.tab = 'learn'; render(); };
    $('#go').focus();
  }

  document.onkeydown = (e) => {
    if (e.key !== 'Enter' || e.isComposing) return;
    const go = $('#go');
    if (phase === 'feedback' && go) { e.preventDefault(); go.click(); }
    else if (phase === 'answer' && go && !go.disabled && !ctrl?.auto) { e.preventDefault(); check(); }
  };

  setBar();
  next();
}

// ───────── 대결 ─────────
// 같은 8문제를 둘이 따로 풀고, 맞힌 수(같으면 빠른 쪽)로 이긴다. 상대가 없으면 슬(봇)과 대결.
const DUEL_SECONDS = 90;
async function renderDuel(host) {
  host.innerHTML = `<div class="page">
    <div class="duel-hero">${I.swords.replace('<svg', '<svg style="width:40px;height:40px"')}<h1>대결</h1><p>같은 문제 8개, ${DUEL_SECONDS}초! 더 많이 맞히면 이겨요. 이기면 보석 +10</p>
      <div class="grid2"><button class="btn white" id="duel-seul" style="--c:#8a6cf0">슬과 대결</button><button class="btn white" id="duel-friend" style="--c:#ff6b8a">친구에게 도전</button></div></div>
    <h2 class="display" style="margin:4px 0 0">내 대결</h2>
    <div id="duel-list"><div class="spinner"></div></div></div>`;
  $('#duel-seul', host).onclick = () => newDuel(null);
  $('#duel-friend', host).onclick = pickOpponent;
  try {
    const { list } = await api('/api/duels');
    const me = S.user.id;
    $('#duel-list', host).innerHTML = list.length ? list.map((d) => {
      const other = d.from.id === me ? d.to : d.from;
      const mine = d.results[me];
      const theirs = d.results[other.id];
      const st = d.myTurn ? '<span class="st turn">내 차례!</span>'
        : d.status !== 'done' ? '<span class="st">기다리는 중</span>'
          : d.winner === me ? '<span class="st win">이겼어요</span>' : '<span class="st lose">졌어요</span>';
      return `<button class="duel-card ${d.myTurn ? 'turn' : ''}" data-d="${esc(d.id)}" data-turn="${d.myTurn ? 1 : 0}">
        <span class="avatar" style="background:${other.id === 'seul' ? '#4f9cf9' : avColor(other.id)}">${esc([...other.nick][0] || '?')}</span>
        <span style="flex:1"><b>${esc(other.nick)}</b> <span class="vs">${esc(courseOf(d.course)?.name || '')}</span><br>
        <small class="muted">${mine ? `나 ${mine.correct}개` : '나 아직'} · ${theirs ? `${esc(other.nick)} ${theirs.correct}개` : `${esc(other.nick)} 아직`}</small></span>${st}</button>`;
    }).join('') : '<p class="muted">아직 대결이 없어요. 슬과 먼저 겨뤄 봐요!</p>';
    host.querySelectorAll('[data-d]').forEach((b) => {
      b.onclick = async () => {
        if (b.dataset.turn !== '1') { toast('상대가 아직 안 풀었어요. 다 풀면 결과가 나와요!'); return; }
        loadingScreen('대결 준비 중…');
        try { runDuel((await api('/api/duel?id=' + encodeURIComponent(b.dataset.d))).duel); } catch (err) { errorScreen(err.message); }
      };
    });
  } catch (err) { $('#duel-list', host).innerHTML = `<p>${esc(err.message)}</p>`; }
}

async function pickOpponent() {
  let list = [];
  try { list = (await api('/api/users')).list; } catch (err) { toast(err.message); return; }
  if (S.user.guest) { toast('체험 계정은 슬하고만 대결할 수 있어요. 가입하면 친구와 대결해요!'); return; }
  const s = sheet(`<h2 class="display" style="margin:0">누구에게 도전할까요?</h2>
    ${list.length ? list.map((p) => `<button class="course-opt" data-o="${esc(p.id)}"><span class="avatar" style="background:${avColor(p.id)}">${esc([...p.nick][0] || '?')}</span><span style="flex:1"><b>${esc(p.nick)}</b><br><small class="muted">이번 주 ${p.weekXp} XP</small></span>${I.swords.replace('<svg', '<svg style="width:24px;height:24px;color:#ff6b8a"')}</button>`).join('') : '<p class="muted">아직 다른 사람이 없어요. 가입 코드를 친구에게 알려 줘요!</p>'}`);
  s.el.querySelectorAll('[data-o]').forEach((b) => { b.onclick = () => { s.close(); newDuel(b.dataset.o); }; });
}

async function newDuel(opponent) {
  loadingScreen('대결 문제를 고르고 있어요…');
  try { runDuel((await api('/api/duel', { method: 'POST', body: opponent ? { opponent } : {} })).duel); }
  catch (err) { errorScreen(err.message); }
}

function runDuel(duel) {
  const me = S.user.id;
  const other = duel.from.id === me ? duel.to : duel.from;
  // 시작 화면 (누구 vs 누구)
  app.innerHTML = `<div class="result">
    <div class="versus"><div><span class="avatar" style="background:${avColor(me)}">${esc([...S.user.nick][0] || '?')}</span><b>${esc(S.user.nick)}</b></div>
      <span class="vs-big">VS</span>
      <div><span class="avatar" style="background:${other.id === 'seul' ? '#4f9cf9' : avColor(other.id)}">${esc([...other.nick][0] || '?')}</span><b>${esc(other.nick)}</b></div></div>
    <p class="muted">${duel.exercises.length}문제 · ${DUEL_SECONDS}초 · 틀려도 다시 안 나와요</p>
    <button class="btn" id="go">시작!</button><button class="btn ghost" id="back">나중에</button></div>`;
  $('#back').onclick = () => { S.tab = 'duel'; render(); };
  $('#go').onclick = () => play();

  function play() {
    const list = duel.exercises;
    let i = 0;
    let correct = 0;
    let ctrl = null;
    let phase = 'answer';
    let over = false;
    const t0 = Date.now();
    app.innerHTML = `<div class="lesson duel">
      <div class="lesson-top"><span class="tag-practice" style="color:#ff6b8a">${I.swords}<span id="cnt">0</span></span><div class="timer" style="flex:1"><div id="tbar" style="width:100%"></div></div><b class="display" id="secs">${DUEL_SECONDS}</b></div>
      <div class="q" id="q"></div><div class="foot" id="foot"></div></div>`;
    const tick = setInterval(() => {
      const left = Math.max(0, DUEL_SECONDS - Math.floor((Date.now() - t0) / 1000));
      if (!$('#secs')) { clearInterval(tick); return; }
      $('#secs').textContent = left;
      $('#tbar').style.width = `${(left / DUEL_SECONDS) * 100}%`;
      if (left <= 0) end();
    }, 250);
    const next = () => {
      if (over) return;
      if (i >= list.length) return end();
      phase = 'answer';
      $('#foot').className = 'foot';
      $('#foot').innerHTML = `<button class="btn" id="go" disabled>확인</button>`;
      $('#go').onclick = check;
      ctrl = mountExercise(list[i], $('#q'), {
        speak, sfx, robotSvg: robot('happy'),
        setReady: (r) => { if (phase === 'answer' && $('#go')) $('#go').disabled = !r; },
        finish: (r) => { if (phase === 'answer') done(!!r.correct, ''); }
      });
      if (ctrl.auto) $('#foot').innerHTML = '';
    };
    const check = () => { if (phase === 'answer' && ctrl) { const r = ctrl.check(); done(r.correct, r.solution); } };
    const done = (ok, solution) => {
      phase = 'feedback';
      try { ctrl.lock(); } catch { /* 잠김 */ }
      i++;
      if (ok) { correct++; sfx('good'); } else sfx('bad');
      $('#cnt').textContent = correct;
      $('#foot').className = 'foot ' + (ok ? 'good' : 'bad');
      $('#foot').innerHTML = `<div class="verdict"><span class="ico">${ok ? I.check : I.x}</span><div><b>${ok ? '정답!' : '아쉬워요'}</b>${!ok && solution ? `<div class="detail">${esc(solution)}</div>` : ''}</div></div><button class="btn ${ok ? 'good' : 'bad'}" id="go">다음</button>`;
      $('#go').onclick = next;
      $('#go').focus({ preventScroll: true });
    };
    async function end() {
      if (over) return;
      over = true;
      clearInterval(tick);
      document.onkeydown = null;
      const ms = Math.min(DUEL_SECONDS * 1000, Date.now() - t0);
      loadingScreen('결과를 보내는 중…');
      let r;
      try { r = await api('/api/duel/finish', { method: 'POST', body: { id: duel.id, correct, ms } }); } catch (err) { errorScreen(err.message); return; }
      S.user = r.user;
      const theirs = r.duel.results[other.id];
      if (r.won === true) sfx('done'); else if (r.won === false) sfx('bad');
      app.innerHTML = `<div class="result">
        ${r.won ? `<div class="confetti" aria-hidden="true">${Array.from({ length: 24 }, (_, k) => `<i style="--x:${(k * 37) % 100}%;--d:${(k % 6) * 0.12}s;--c:${['#ffc94a', '#ff6b8a', '#8a6cf0', '#2fbf71'][k % 4]}"></i>`).join('')}</div>` : ''}
        ${robot(r.won === false ? 'sad' : 'wow')}
        <h1 style="color:${r.won === false ? 'var(--bad-d)' : r.won ? 'var(--gold-d)' : 'var(--blue-d)'}">${r.won === true ? '이겼어요!' : r.won === false ? '졌어요…' : '다 풀었어요!'}</h1>
        <div class="versus"><div><div class="score">${correct}</div><small>${esc(S.user.nick)} · ${Math.round(ms / 1000)}초</small></div><span class="vs-big">:</span>
          <div><div class="score">${theirs ? theirs.correct : '?'}</div><small>${esc(other.nick)}${theirs ? ` · ${Math.round(theirs.ms / 1000)}초` : ''}</small></div></div>
        <p class="muted">${r.won === null ? `${esc(other.nick)}이(가) 풀면 결과가 나와요.` : r.won ? '보석 +10, XP +10을 받았어요!' : 'XP +3. 다음엔 이길 수 있어요!'}</p>
        <button class="btn" id="go">확인</button></div>`;
      $('#go').onclick = () => { S.tab = 'duel'; render(); };
    }
    document.onkeydown = (e) => {
      if (e.key !== 'Enter' || e.isComposing) return;
      const go = $('#go');
      if (go && !go.disabled) { e.preventDefault(); phase === 'feedback' ? go.click() : check(); }
    };
    next();
  }
}

// ───────── 리그 (이번 주 순위) ─────────
const AV = ['#4f9cf9', '#ff6b8a', '#f2a93b', '#2fbf71', '#8a6cf0', '#e85d4a'];
const avColor = (id) => AV[[...id].reduce((a, ch) => a + ch.charCodeAt(0), 0) % AV.length];
async function renderRank(host) {
  host.innerHTML = `<div class="page"><div class="league-head">${I.trophy}<h1>이번 주 리그</h1></div><div class="spinner"></div></div>`;
  try {
    const { list } = await api('/api/leaderboard');
    const daysLeft = 7 - ((new Date().getDay() + 6) % 7);
    host.innerHTML = `<div class="page"><div class="league-head">${I.trophy}<div><h1>이번 주 리그</h1><small class="muted">${daysLeft}일 남음 · 월요일에 새로 시작해요</small></div></div>
      ${list.map((p, i) => `<div class="row ${p.id === S.user.id ? 'me' : ''}"><span class="rank r${i + 1}">${i + 1}</span><span class="avatar" style="background:${avColor(p.id)}">${esc([...p.nick][0] || '?')}</span><span style="flex:1"><b>${esc(p.nick)}</b>${p.streak ? ` <small style="color:var(--fire)">🔥${p.streak}</small>` : ''}</span><b class="display">${p.weekXp} XP</b></div>`).join('') || '<p class="muted">아직 아무도 없어요.</p>'}</div>`;
  } catch (err) {
    host.innerHTML = `<div class="page"><p>${esc(err.message)}</p></div>`;
  }
}

// ───────── 상점 ─────────
function renderShop(host) {
  const u = S.user;
  const e = energyOf();
  host.innerHTML = `<div class="page">
    <div class="league-head">${I.shop}<div><h1>상점</h1><small class="muted">보석은 레슨, 건너뛰기 시험, 보물 상자로 모아요</small></div></div>
    <div class="row gem-row">${I.gem}<b class="display" style="font-size:1.4rem">${u.gems || 0}</b><span class="muted">보석</span></div>
    <h2 class="display" style="margin:8px 0 0">에너지</h2>
    <div class="shop-item">
      <span class="big-ico energy">${I.bolt}</span>
      <div style="flex:1"><b>에너지 가득 채우기</b><small>${e.n} / ${e.max}${e.next ? ` · ${mins(e.next - Date.now())}분 뒤 +1` : ''}</small></div>
      <button class="btn price" id="buy-energy" ${e.n >= e.max ? 'disabled' : ''}>${I.gem}${ENERGY_PRICE}</button>
    </div>
    <div class="shop-item">
      <span class="big-ico">${I.dumbbell}</span>
      <div style="flex:1"><b>연습해서 받기</b><small>끝낸 레슨 복습하면 에너지 +5</small></div>
      <button class="btn ghost price" id="do-practice">하기</button>
    </div>
  </div>`;
  $('#buy-energy', host).onclick = buyEnergy;
  $('#do-practice', host).onclick = startPractice;
}

// ───────── 나 ─────────
function renderMe(host) {
  const u = S.user;
  const e = energyOf();
  const c = currentCourse();
  host.innerHTML = `
  <div class="page">
    <div class="row" style="border:0;background:none;padding:0"><span class="avatar" style="background:${avColor(u.id)};width:64px;height:64px;font-size:1.8rem">${esc([...u.nick][0] || '?')}</span><div style="flex:1"><h1>${esc(u.nick)}</h1><small class="muted">@${esc(u.id)}${u.guest ? ' · 체험 계정' : ''}</small></div></div>
    <div class="grid2">
      <div class="box">${I.fire.replace('<svg', '<svg style="color:var(--fire)"')}<div><b>${u.streak.count}일</b><small>연속 학습</small></div></div>
      <div class="box">${I.star.replace('<svg', '<svg style="color:var(--gold-d)"')}<div><b>${u.xp}</b><small>총 XP</small></div></div>
      <div class="box">${I.bolt.replace('<svg', '<svg style="color:var(--energy)"')}<div><b>${e.n} / ${e.max}</b><small>에너지</small></div></div>
      <div class="box">${I.gem}<div><b>${u.gems || 0}</b><small>보석</small></div></div>
    </div>
    <div class="box" style="display:grid;gap:10px">
      <div><b style="font-size:1.1rem">하루 목표</b> <small>오늘 ${u.todayXp} / ${u.dailyGoal} XP</small></div>
      <div class="meter"><div style="width:${Math.min(100, Math.round((u.todayXp / u.dailyGoal) * 100))}%;background:var(--gold)"></div></div>
      <div class="seg">${[10, 20, 30, 50].map((g) => `<button data-g="${g}" class="${g === u.dailyGoal ? 'on' : ''}">${g} XP</button>`).join('')}</div>
    </div>
    <h2 class="display" style="margin:6px 0 0">소리</h2>
    <div class="box" style="display:grid;gap:12px">
      <label class="switch"><span>효과음</span><input type="checkbox" id="sw-sfx" ${sfxOn() ? 'checked' : ''}><i></i></label>
      <label class="switch"><span>읽어 주기 (말하기)</span><input type="checkbox" id="sw-speech" ${speechOn() ? 'checked' : ''}><i></i></label>
      <button class="btn ghost" id="sound-test">${I.speaker.replace('<svg', '<svg style="width:22px;height:22px;vertical-align:-5px"')} 소리 시험</button>
      <small class="muted" id="sound-note"></small>
    </div>
    <h2 class="display" style="margin:6px 0 0">코스별 진도</h2>
    ${COURSES.map((cc) => {
      const done = Object.keys((u.progress[cc.id] || {}).done || {}).length;
      const total = cc.units.length * LESSONS_PER_UNIT;
      return `<div class="row"><span class="badge" style="background:${cc.color}">${esc(cc.badge)}</span><span style="flex:1">${esc(cc.name)}<div class="meter" style="height:10px;margin-top:4px"><div style="width:${Math.round((done / total) * 100)}%;background:${cc.color}"></div></div></span><small class="muted">${done}/${total}</small></div>`;
    }).join('')}
    ${canFull() ? `<button class="btn ghost" id="me-full">${document.fullscreenElement ? '전체 화면 끄기' : '전체 화면으로 보기'}</button>` : ''}
    <button class="btn ghost" id="logout" style="color:var(--bad-d)">로그아웃</button>
  </div>`;
  host.querySelectorAll('[data-g]').forEach((b) => {
    b.onclick = async () => {
      try { S.user = (await api('/api/settings', { method: 'POST', body: { dailyGoal: Number(b.dataset.g) } })).user; renderShell(); } catch (err) { toast(err.message); }
    };
  });
  $('#sw-sfx', host).onchange = (ev) => { setSfxOn(ev.target.checked); if (ev.target.checked) sfx('good'); };
  $('#sw-speech', host).onchange = (ev) => setSpeechOn(ev.target.checked);
  $('#sound-test', host).onclick = async () => {
    unlockAudio();
    sfx('good');
    const lang = c.lang || 'en-US';
    const sample = { 'en-US': 'Hello! Nice to meet you.', 'ja-JP': 'こんにちは', 'zh-CN': '你好', 'es-ES': '¡Hola, amigo!' }[lang] || 'Hello!';
    const ok = await speak(sample, lang);
    const missing = COURSES.filter((cc) => cc.lang && !hasVoice(cc.lang)).map((cc) => cc.name);
    $('#sound-note', host).textContent = (ok ? '읽어 주기가 돼요! ' : '읽어 주기가 안 나왔어요. 기기 소리와 무음 모드를 확인해 주세요. ')
      + (missing.length ? `이 기기에 ${missing.join(', ')} 목소리가 없을 수 있어요 (기기 설정 → 텍스트 음성 변환에서 받을 수 있어요).` : '');
  };
  if ($('#me-full', host)) $('#me-full', host).onclick = async () => { await toggleFull(); renderShell(); };
  $('#logout', host).onclick = () => { if (!u.guest || confirm('체험 계정은 로그아웃하면 기록이 사라져요. 로그아웃할까요?')) logout(); };
}

// 에너지 시간이 지나면 다시 불러오기 (화면에 오래 켜 둘 때)
setInterval(() => {
  if (S.token && S.user && S.user.energy && S.user.energy.next && Date.now() > S.user.energy.next && $('.topbar')) {
    api('/api/me').then((j) => { S.user = j.user; if ($('.topbar')) renderShell(); }).catch(() => {});
  }
}, 60000);

findServer().then(render);
