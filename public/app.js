// 슬터디 — 화면 전체 틀 (로그인, 레슨 길, 레슨 진행, 끝 화면, 순위, 내 정보)
// 문제 하나하나의 화면은 exercises.js 가 그린다.
import { COURSES, courseOf, LESSONS_PER_UNIT, lessonKey } from './courses.js';
import { mountExercise } from './exercises.js';

const $ = (s, r = document) => r.querySelector(s);
const app = $('#app');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = {
  get(k) { try { return localStorage.getItem('seulstudy.' + k); } catch { return null; } },
  set(k, v) { try { v == null ? localStorage.removeItem('seulstudy.' + k) : localStorage.setItem('seulstudy.' + k, v); } catch { /* 저장 안 됨 */ } }
};

const S = { token: store.get('token'), user: null, tab: 'learn' };

// ───────── 서버 ─────────
async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(S.token ? { Authorization: 'Bearer ' + S.token } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  const j = await res.json().catch(() => ({}));
  if (res.status === 401 && S.token) { logout(); throw new Error(j.error || '다시 로그인해 주세요.'); }
  if (!res.ok) throw Object.assign(new Error(j.error || '서버에 연결하지 못했어요.'), { status: res.status });
  return j;
}
function logout() {
  if (S.token) fetch('/api/logout', { method: 'POST', headers: { Authorization: 'Bearer ' + S.token } }).catch(() => {});
  S.token = null; S.user = null; store.set('token', null);
  render();
}
function signedIn({ token, user }) {
  S.token = token; S.user = user; store.set('token', token); S.tab = 'learn';
  render();
}

// ───────── 그림 ─────────
export function robot(mood = 'happy') {
  const mouth = mood === 'sad' ? 'M88 124 Q100 114 112 124' : mood === 'think' ? 'M90 120 h20' : 'M88 116 Q100 128 112 116';
  const eyes = mood === 'wow'
    ? '<circle cx="78" cy="94" r="12" fill="#1d2a3a"/><circle cx="122" cy="94" r="12" fill="#1d2a3a"/>'
    : '<ellipse cx="78" cy="94" rx="9" ry="12" fill="#1d2a3a"/><ellipse cx="122" cy="94" rx="9" ry="12" fill="#1d2a3a"/>';
  return `<svg class="robot" viewBox="0 0 200 200" aria-hidden="true">
    <line x1="100" y1="38" x2="100" y2="18" stroke="#2f74d0" stroke-width="5" stroke-linecap="round"/>
    <circle cx="100" cy="15" r="9" fill="#ffc94a"/>
    <rect x="30" y="38" width="140" height="118" rx="56" fill="#4f9cf9"/>
    <rect x="18" y="80" width="16" height="32" rx="8" fill="#2f74d0"/><rect x="166" y="80" width="16" height="32" rx="8" fill="#2f74d0"/>
    <rect x="48" y="58" width="104" height="78" rx="38" fill="#eaf4ff"/>
    ${eyes}<circle cx="81" cy="89" r="3" fill="#fff"/><circle cx="125" cy="89" r="3" fill="#fff"/>
    <ellipse cx="64" cy="114" rx="8" ry="5" fill="#ff9fb0"/><ellipse cx="136" cy="114" rx="8" ry="5" fill="#ff9fb0"/>
    <path d="${mouth}" fill="none" stroke="#1d2a3a" stroke-width="4" stroke-linecap="round"/>
    <rect x="70" y="160" width="60" height="26" rx="13" fill="#2f74d0"/></svg>`;
}
const I = {
  fire: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2c1 3.5 5 6 5 11a5 5 0 0 1-10 0c0-2.2 1-3.8 2.2-5 .2 1.6 1 2.6 2 3 0-3.2-.6-6.2.8-9z"/></svg>',
  bolt: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></svg>',
  heart: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 21s-8-5.2-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 5.8-8 11-8 11z"/></svg>',
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"><path d="M4 11 12 4l8 7v9h-5v-6H9v6H4z"/></svg>',
  trophy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 20h8"/></svg>',
  user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="8" r="4"/><path d="M4 21c1-4.5 4.5-6 8-6s7 1.5 8 6"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  star: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="m12 2.5 2.9 6 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.2 1.3-6.6-4.9-4.6 6.6-.8z"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
  lock: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 10V8a5 5 0 0 1 10 0v2h1v11H6V10zm2 0h6V8a3 3 0 0 0-6 0z"/></svg>',
  crown: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 7l4.5 4L12 4l4.5 7L21 7l-2 12H5z"/></svg>',
  full: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
  nofull: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/></svg>'
};

// ───────── 소리 · 말하기 ─────────
let audio = null;
function sfx(kind) {
  try {
    audio ||= new (window.AudioContext || window.webkitAudioContext)();
    const notes = { good: [[660, 0], [990, 0.09]], bad: [[220, 0], [180, 0.12]], done: [[523, 0], [659, 0.1], [784, 0.2], [1047, 0.3]], tap: [[880, 0]] }[kind] || [];
    for (const [f, t] of notes) {
      const o = audio.createOscillator();
      const g = audio.createGain();
      o.type = kind === 'bad' ? 'square' : 'sine';
      o.frequency.value = f;
      const at = audio.currentTime + t;
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(kind === 'tap' ? 0.05 : 0.18, at + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, at + (kind === 'tap' ? 0.06 : 0.22));
      o.connect(g).connect(audio.destination);
      o.start(at);
      o.stop(at + 0.25);
    }
  } catch { /* 소리 없음 */ }
}
function speak(text, lang = 'en-US', rate = 0.9) {
  try {
    if (!text || !window.speechSynthesis) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    u.rate = rate;
    const prefix = lang.slice(0, 2);
    const voice = speechSynthesis.getVoices().find((v) => v.lang === lang) || speechSynthesis.getVoices().find((v) => v.lang.startsWith(prefix));
    if (voice) u.voice = voice;
    speechSynthesis.speak(u);
  } catch { /* 말하기 없음 */ }
}
try { speechSynthesis.getVoices(); } catch { /* 없음 */ }

function toast(msg, ms = 2600) {
  document.querySelectorAll('.toast').forEach((t) => t.remove());
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.append(t);
  setTimeout(() => t.remove(), ms);
}

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
    api('/api/me').then((j) => { S.user = j.user; render(); }).catch((err) => {
      app.innerHTML = `<div class="center">${robot('sad').replace('class="robot"', 'class="robot" style="width:120px;margin:0 auto"')}<p>${esc(err.message)}</p><button class="btn" id="retry">다시 시도</button></div>`;
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
function renderShell() {
  const u = S.user;
  const c = currentCourse();
  app.innerHTML = `
    <div class="topbar">
      <button class="course-chip" id="course-chip" title="코스 바꾸기"><span class="badge" style="background:${c.color}">${esc(c.badge)}</span>${esc(c.name)}</button>
      <span class="spacer"></span>
      <button class="stat fire ${u.streak.today ? '' : 'off'}" title="연속 학습일" data-tab="me">${I.fire}${u.streak.count}</button>
      <button class="stat gem" title="총 XP" data-tab="me">${I.bolt}${u.xp}</button>
      <button class="stat heart" title="하트" data-tab="me">${I.heart}${u.hearts.n}</button>
      ${canFull() ? `<button class="icon-btn" id="btn-full" title="전체 화면">${document.fullscreenElement ? I.nofull : I.full}</button>` : ''}
    </div>
    <div class="main" id="main"></div>
    <nav class="nav">
      <button data-tab="learn" class="${S.tab === 'learn' ? 'on' : ''}">${I.home}배우기</button>
      <button data-tab="rank" class="${S.tab === 'rank' ? 'on' : ''}">${I.trophy}순위</button>
      <button data-tab="me" class="${S.tab === 'me' ? 'on' : ''}">${I.user}나</button>
    </nav>`;
  app.querySelectorAll('[data-tab]').forEach((b) => { b.onclick = () => { S.tab = b.dataset.tab; renderShell(); }; });
  $('#course-chip').onclick = openCourses;
  if ($('#btn-full')) $('#btn-full').onclick = toggleFull;
  ({ learn: renderPath, rank: renderRank, me: renderMe })[S.tab]($('#main'));
}

function openCourses() {
  const u = S.user;
  const bg = document.createElement('div');
  bg.className = 'sheet-bg';
  bg.innerHTML = `<div class="sheet"><h2 class="display" style="margin:0 0 4px">무엇을 배울까요?</h2>${COURSES.map((c) => {
    const done = Object.keys((u.progress[c.id] || {}).done || {}).length;
    const total = c.units.length * LESSONS_PER_UNIT;
    return `<button class="course-opt ${c.id === currentCourse().id ? 'on' : ''}" data-c="${c.id}"><span class="badge" style="background:${c.color}">${esc(c.badge)}</span><span style="flex:1"><b class="display" style="font-size:1.15rem">${esc(c.name)}</b><br><small class="muted">레슨 ${done} / ${total}</small></span></button>`;
  }).join('')}</div>`;
  bg.onclick = (e) => { if (e.target === bg) bg.remove(); };
  bg.querySelectorAll('[data-c]').forEach((b) => {
    b.onclick = async () => {
      bg.remove();
      S.user.course = b.dataset.c;
      S.tab = 'learn';
      renderShell();
      api('/api/settings', { method: 'POST', body: { course: b.dataset.c } }).then((j) => { S.user = j.user; }).catch(() => {});
    };
  });
  document.body.append(bg);
}

// ───────── 레슨 길 ─────────
function renderPath(host) {
  const c = currentCourse();
  const done = (S.user.progress[c.id] || {}).done || {};
  let current = -1;
  c.units.some((u, ui) => { for (let l = 0; l < LESSONS_PER_UNIT; l++) if (!done[lessonKey(ui, l)]) { current = ui * LESSONS_PER_UNIT + l; return true; } return false; });
  const html = c.units.map((unit, ui) => {
    const builtIn = c.kind === 'chess' || !!unit.vocab;
    const nodes = Array.from({ length: LESSONS_PER_UNIT }, (_, l) => {
      const idx = ui * LESSONS_PER_UNIT + l;
      const isDone = !!done[lessonKey(ui, l)];
      const isCur = idx === current;
      const locked = !isDone && !isCur;
      const last = l === LESSONS_PER_UNIT - 1;
      const x = Math.round(Math.sin(idx * 1.1) * 70);
      const icon = isDone ? (last ? I.crown : I.check) : locked ? I.lock : last ? I.trophy : I.star;
      return `<div style="translate:${x}px 0"><button class="node ${isDone ? 'done' : ''} ${isCur ? 'current' : ''} ${locked ? 'locked' : ''}" data-u="${ui}" data-l="${l}" style="--c:${c.color}" aria-label="${esc(unit.title)} 레슨 ${l + 1}">${isCur ? `<span class="bubble">${idx === 0 ? '시작!' : '다음'}</span>` : ''}${icon}</button></div>`;
    }).join('');
    return `<div class="unit-card" style="background:${c.color}"><div><p style="margin:0;opacity:.85;font-size:.85rem">단원 ${ui + 1}</p><h2>${esc(unit.title)}</h2><p>${esc(unit.desc)}</p></div>${builtIn ? '' : '<span class="ai-tag">AI 레슨</span>'}</div><div class="nodes">${nodes}</div>`;
  }).join('');
  const allDone = current < 0;
  host.innerHTML = `<div class="path">${html}${allDone ? `<div class="center">${robot('wow')}<p class="display">이 코스를 다 끝냈어요! 대단해요!</p></div>` : ''}</div>`;
  host.querySelectorAll('.node').forEach((b) => {
    b.onclick = () => {
      if (b.classList.contains('locked')) { toast('앞 레슨을 먼저 끝내요!'); return; }
      startLesson(c.id, Number(b.dataset.u), Number(b.dataset.l));
    };
  });
  const cur = host.querySelector('.node.current');
  if (cur) cur.scrollIntoView({ block: 'center' });
}

// ───────── 레슨 진행 ─────────
async function startLesson(courseId, unit, lesson) {
  if (S.user.hearts.n <= 0) { toast('하트가 없어요. 조금 쉬었다가 해요! (30분마다 1개)'); return; }
  document.onkeydown = null;
  app.innerHTML = `<div class="center">${robot('think').replace('class="robot"', 'class="robot" style="width:120px;margin:0 auto"')}<div class="spinner"></div><p class="muted">슬이 문제를 준비하고 있어요…</p></div>`;
  try {
    const data = await api(`/api/lesson?course=${courseId}&unit=${unit}&lesson=${lesson}`);
    runLesson({ courseId, unit, lesson, exercises: data.exercises });
  } catch (err) {
    app.innerHTML = `<div class="center">${robot('sad').replace('class="robot"', 'class="robot" style="width:120px;margin:0 auto"')}<p>${esc(err.message)}</p><button class="btn" id="back">돌아가기</button></div>`;
    $('#back').onclick = render;
  }
}

function runLesson(L) {
  const total = L.exercises.length;
  const queue = L.exercises.slice();
  let right = 0;
  let mistakes = 0;
  let ctrl = null;
  let phase = 'answer'; // answer | feedback

  app.innerHTML = `
    <div class="lesson">
      <div class="lesson-top">
        <button class="icon-btn" id="quit" title="그만하기">${I.x}</button>
        <div class="progress"><div id="bar" style="width:0"></div></div>
        <span class="stat heart">${I.heart}<span id="hearts">${S.user.hearts.n}</span></span>
      </div>
      <div class="q" id="q"></div>
      <div class="foot" id="foot"></div>
    </div>`;
  const q = $('#q');
  const foot = $('#foot');
  $('#quit').onclick = () => { if (confirm('레슨을 그만할까요? 지금까지 한 건 저장되지 않아요.')) { document.onkeydown = null; render(); } };

  const setBar = () => { $('#bar').style.width = `${Math.round((right / total) * 100)}%`; };

  function next() {
    if (!queue.length) return finishLesson();
    if (S.user.hearts.n <= 0) return outOfHearts();
    phase = 'answer';
    const ex = queue[0];
    foot.className = 'foot';
    foot.innerHTML = `<button class="btn" id="go" disabled>확인</button>`;
    const go = $('#go');
    go.onclick = check;
    ctrl = mountExercise(ex, q, {
      speak,
      sfx,
      robotSvg: robot('happy'),
      setReady: (ready) => { if (phase === 'answer') go.disabled = !ready; },
      finish: (r) => { if (phase === 'answer') { mistakes += ctrl.mistakes || 0; feedback(!!r.correct, r.solution || ''); } }
    });
    if (ctrl.auto) foot.innerHTML = `<button class="btn ghost" id="go" disabled>짝을 모두 맞추면 넘어가요</button>`;
    q.scrollTop = 0;
  }

  function check() {
    if (phase !== 'answer' || !ctrl) return;
    const r = ctrl.check();
    feedback(r.correct, r.solution);
  }

  async function feedback(correct, solution) {
    phase = 'feedback';
    try { ctrl.lock(); } catch { /* 이미 잠김 */ }
    const ex = queue.shift();
    if (correct) {
      right++;
      sfx('good');
    } else {
      mistakes++;
      queue.push(ex); // 틀린 문제는 뒤에서 다시
      sfx('bad');
      api('/api/heart', { method: 'POST' }).then((j) => { S.user.hearts = j.hearts; $('#hearts') && ($('#hearts').textContent = j.hearts.n); }).catch(() => {});
      S.user.hearts = { ...S.user.hearts, n: Math.max(0, S.user.hearts.n - 1) };
      $('#hearts').textContent = S.user.hearts.n;
    }
    setBar();
    const praise = ['좋아요!', '멋져요!', '정답!', '완벽해요!', '잘했어요!'][Math.floor(Math.random() * 5)];
    foot.className = 'foot ' + (correct ? 'good' : 'bad');
    foot.innerHTML = `
      <div class="verdict"><span class="ico">${correct ? I.check : I.x}</span><div><b>${correct ? praise : '아쉬워요'}</b>${!correct && solution ? `<div class="detail">정답: ${esc(solution)}</div>` : ''}</div></div>
      <button class="btn ${correct ? 'good' : 'bad'}" id="go">계속</button>`;
    $('#go').onclick = next;
    $('#go').focus();
  }

  function outOfHearts() {
    document.onkeydown = null;
    app.innerHTML = `<div class="result">${robot('sad')}<h1 style="color:var(--bad-d)">하트가 다 떨어졌어요</h1><p class="muted">하트는 30분마다 1개씩 다시 생겨요. 조금 쉬었다가 다시 해요!</p><button class="btn" id="back">돌아가기</button></div>`;
    $('#back').onclick = () => { S.user = null; render(); };
  }

  async function finishLesson() {
    document.onkeydown = null;
    sfx('done');
    app.innerHTML = `<div class="center"><div class="spinner"></div></div>`;
    let r;
    try { r = await api('/api/complete', { method: 'POST', body: { course: L.courseId, unit: L.unit, lesson: L.lesson, mistakes } }); }
    catch (err) { toast(err.message); render(); return; }
    S.user = r.user;
    const acc = Math.round((total / (total + mistakes)) * 100);
    app.innerHTML = `
      <div class="result">
        ${robot('wow')}
        <h1>${mistakes === 0 ? '완벽한 레슨!' : '레슨 완료!'}</h1>
        ${r.streakUp ? `<p class="display" style="color:var(--fire);font-size:1.3rem;margin:-8px 0 0">🔥 연속 ${r.user.streak.count}일째!</p>` : ''}
        <div class="cards">
          <div class="mini" style="--c:var(--gold-d)"><div class="h">얻은 XP</div><div class="v">+${r.xp}</div></div>
          <div class="mini" style="--c:var(--good)"><div class="h">정확도</div><div class="v">${acc}%</div></div>
          <div class="mini" style="--c:var(--fire)"><div class="h">오늘 XP</div><div class="v">${r.user.todayXp}/${r.user.dailyGoal}</div></div>
        </div>
        <button class="btn" id="go">계속</button>
      </div>`;
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

// ───────── 순위 ─────────
const AV = ['#4f9cf9', '#ff6b8a', '#f2a93b', '#2fbf71', '#8a6cf0', '#e85d4a'];
const avColor = (id) => AV[[...id].reduce((a, ch) => a + ch.charCodeAt(0), 0) % AV.length];
async function renderRank(host) {
  host.innerHTML = `<div class="page"><h1>이번 주 순위</h1><div class="spinner"></div></div>`;
  try {
    const { list } = await api('/api/leaderboard');
    host.innerHTML = `<div class="page"><h1>이번 주 순위</h1><p class="muted" style="margin:-8px 0 0">월요일마다 새로 시작해요. 레슨을 끝내면 XP가 쌓여요.</p>
      ${list.map((p, i) => `<div class="row ${p.id === S.user.id ? 'me' : ''}"><span class="rank r${i + 1}">${i + 1}</span><span class="avatar" style="background:${avColor(p.id)}">${esc([...p.nick][0] || '?')}</span><span style="flex:1"><b>${esc(p.nick)}</b>${p.streak ? ` <small style="color:var(--fire)">🔥${p.streak}</small>` : ''}</span><b class="display">${p.weekXp} XP</b></div>`).join('') || '<p class="muted">아직 아무도 없어요.</p>'}</div>`;
  } catch (err) {
    host.innerHTML = `<div class="page"><p>${esc(err.message)}</p></div>`;
  }
}

// ───────── 나 ─────────
function renderMe(host) {
  const u = S.user;
  const next = u.hearts.next ? Math.max(0, Math.ceil((u.hearts.next - Date.now()) / 60000)) : 0;
  host.innerHTML = `
  <div class="page">
    <div class="row" style="border:0;background:none;padding:0"><span class="avatar" style="background:${avColor(u.id)};width:64px;height:64px;font-size:1.8rem">${esc([...u.nick][0] || '?')}</span><div style="flex:1"><h1>${esc(u.nick)}</h1><small class="muted">@${esc(u.id)}${u.guest ? ' · 체험 계정' : ''}</small></div></div>
    <div class="grid2">
      <div class="box">${I.fire.replace('<svg', '<svg style="color:var(--fire)"')}<div><b>${u.streak.count}일</b><small>연속 학습</small></div></div>
      <div class="box">${I.bolt.replace('<svg', '<svg style="color:var(--blue)"')}<div><b>${u.xp}</b><small>총 XP</small></div></div>
      <div class="box">${I.heart.replace('<svg', '<svg style="color:var(--heart)"')}<div><b>${u.hearts.n} / ${u.hearts.max}</b><small>${next ? `${next}분 뒤 +1` : '가득!'}</small></div></div>
      <div class="box">${I.star.replace('<svg', '<svg style="color:var(--gold-d)"')}<div><b>${u.weekXp}</b><small>이번 주 XP</small></div></div>
    </div>
    <div class="box" style="display:grid;gap:10px">
      <div><b style="font-size:1.1rem">하루 목표</b> <small>오늘 ${u.todayXp} / ${u.dailyGoal} XP</small></div>
      <div class="progress"><div style="width:${Math.min(100, Math.round((u.todayXp / u.dailyGoal) * 100))}%"></div></div>
      <div class="seg">${[10, 20, 30, 50].map((g) => `<button data-g="${g}" class="${g === u.dailyGoal ? 'on' : ''}">${g} XP</button>`).join('')}</div>
    </div>
    <h2 class="display" style="margin:6px 0 0">코스별 진도</h2>
    ${COURSES.map((c) => {
      const done = Object.keys((u.progress[c.id] || {}).done || {}).length;
      const total = c.units.length * LESSONS_PER_UNIT;
      return `<div class="row"><span class="badge" style="background:${c.color}">${esc(c.badge)}</span><span style="flex:1">${esc(c.name)}<div class="progress" style="height:10px;margin-top:4px"><div style="width:${Math.round((done / total) * 100)}%;background:${c.color}"></div></div></span><small class="muted">${done}/${total}</small></div>`;
    }).join('')}
    ${canFull() ? `<button class="btn ghost" id="me-full">${document.fullscreenElement ? '전체 화면 끄기' : '전체 화면으로 보기'}</button>` : ''}
    <button class="btn ghost" id="logout" style="color:var(--bad-d)">로그아웃</button>
  </div>`;
  host.querySelectorAll('[data-g]').forEach((b) => {
    b.onclick = async () => {
      try { S.user = (await api('/api/settings', { method: 'POST', body: { dailyGoal: Number(b.dataset.g) } })).user; renderShell(); } catch (err) { toast(err.message); }
    };
  });
  if ($('#me-full')) $('#me-full').onclick = async () => { await toggleFull(); renderShell(); };
  $('#logout').onclick = () => { if (!u.guest || confirm('체험 계정은 로그아웃하면 기록이 사라져요. 로그아웃할까요?')) logout(); };
}

// 하트 시간 지나면 다시 불러오기 (화면에 오래 켜 둘 때)
setInterval(() => {
  if (S.token && S.user && S.user.hearts.next && Date.now() > S.user.hearts.next && $('.topbar')) {
    api('/api/me').then((j) => { S.user = j.user; if ($('.topbar')) renderShell(); }).catch(() => {});
  }
}, 60000);

render();
