// 슬터디 — 문제 화면 6종류 (고르기, 듣기, 문장 만들기, 짝 맞추기, 쓰기, 체스판)
// app.js가 mountExercise(ex, host, ctx)로 부르고, 돌려받은 controller로 확인·잠금을 한다.
import { parseFEN, legalMoves, makeMove, meetsGoal, solutions, sqName, GLYPH, PIECE_KO } from './chess.js';
import { sfx } from './sound.js';

export const TYPE_TITLE = {
  choice: '알맞은 뜻을 고르세요', listen: '들리는 말을 고르세요', build: '문장을 만들어 보세요',
  match: '짝을 맞춰 보세요', type: '써 보세요', chess: '체스 퍼즐'
};

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cjk = (lang) => /^(ja|zh)/.test(lang || '');
const hangul = (t) => /[가-힣]/.test(String(t || ''));
/** 배우는 말이면(한글이 아니면) 읽어 준다 */
const speakTarget = (ctx, text, lang) => { if (text && !hangul(text)) ctx.speak(text, lang); };
/** 확인 뒤 읽어 줄 정답 (한글이면 없음) */
const after = (text, lang) => (text && !hangul(text) ? { speakAfter: { text, lang } } : {});
/** prompt 안의 “따옴표” 말을 꺼낸다 */
const quoted = (t) => { const m = String(t || '').match(/[“"‘']([^”"’']+)[”"’']/); return m ? m[1] : ''; };
const shuffle = (arr) => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};
const SPEAKER = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9v6h4l5 4V5L8 9z" fill="currentColor"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12"/></svg>';
const TURTLE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><ellipse cx="11" cy="13" rx="7" ry="5" fill="currentColor" opacity=".25"/><ellipse cx="11" cy="13" rx="7" ry="5"/><circle cx="20" cy="12" r="2"/><path d="M6 18l-1 2M16 18l1 2M5 9 4 7M17 9l1-2"/></svg>';

/** 비교용으로 글 다듬기 */
export function _normalize(text, lang) {
  let s = String(text ?? '').normalize('NFKC').toLowerCase();
  // 일본어는 탁점(が)이 분해되면 안 되므로 빼고, 나머지(병음 nǐ 포함)는 성조·악센트 없이 받는다
  if (!/^ja/.test(lang || '')) s = s.normalize('NFD').replace(/\p{M}/gu, '').normalize('NFC');
  s = s.replace(/[.,!?¡¿'’‘"“”、。！？，．]/g, '');
  s = cjk(lang) ? s.replace(/\s+/g, '') : s.replace(/\s+/g, ' ').trim();
  return s;
}

/** 문장 만들기: 고른 조각이 정답과 같은지 (같은 글 조각은 바꿔도 맞음) */
export function _sameBuild(chosen, answer, lang) {
  const j = cjk(lang) ? '' : ' ';
  return _normalize(chosen.join(j), lang) === _normalize(answer.join(j), lang);
}

// 키보드 단축키는 문제 하나에만 걸리게
let cleanupKeys = null;
function onKeys(fn) {
  if (cleanupKeys) cleanupKeys();
  const h = (e) => { if (!e.target.closest || !e.target.closest('textarea, input')) fn(e); };
  document.addEventListener('keydown', h);
  cleanupKeys = () => { document.removeEventListener('keydown', h); cleanupKeys = null; };
}

function title(host, text) {
  const h = document.createElement('h2');
  h.textContent = text;
  host.appendChild(h);
}

function say(host, ctx, text, speakText, lang) {
  const d = document.createElement('div');
  d.className = 'say';
  d.innerHTML = `<div class="robot">${ctx.robotSvg || ''}</div><div class="speech">${speakText ? `<button class="speak-btn" type="button" title="듣기">${SPEAKER}</button>` : ''}<span></span></div>`;
  d.querySelector('.speech span').textContent = text;
  if (speakText) d.querySelector('.speak-btn').onclick = () => ctx.speak(speakText, lang);
  host.appendChild(d);
  return d;
}

function lockAll(host) {
  host.querySelectorAll('button, textarea, input').forEach((el) => { el.disabled = true; });
}

// ───────── 고르기 · 듣기 ─────────
function mountChoice(ex, host, ctx) {
  const listen = ex.type === 'listen';
  title(host, listen ? (ex.prompt || TYPE_TITLE.listen) : (ex.prompt || TYPE_TITLE.choice));
  if (listen) {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:14px;justify-content:center;align-items:flex-end';
    row.innerHTML = `<button class="speak-btn speak-big" type="button" title="듣기">${SPEAKER}</button><button class="speak-btn" type="button" title="천천히">${TURTLE}</button>`;
    const [big, slow] = row.querySelectorAll('button');
    big.onclick = () => ctx.speak(ex.speak, ex.lang);
    slow.onclick = () => ctx.speak(ex.speak, ex.lang, 0.6);
    host.appendChild(row);
  } else {
    // 모든 문제에 슬이 나온다: 말풍선에 물어보는 말 (듣기 버튼은 말풍선 안)
    const word = ex.speak || quoted(ex.prompt) || ex.prompt || '';
    say(host, ctx, word, ex.speak || null, ex.lang);
  }
  if (ex.speak) setTimeout(() => ctx.speak(ex.speak, ex.lang), 250);

  const box = document.createElement('div');
  box.className = 'options';
  let selected = -1;
  const buttons = ex.options.map((o, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'opt';
    b.innerHTML = `<span class="k">${i + 1}</span><span></span>`;
    b.lastChild.textContent = o;
    b.onclick = () => select(i);
    box.appendChild(b);
    return b;
  });
  host.appendChild(box);
  function select(i) {
    if (buttons[i].disabled) return;
    selected = i;
    buttons.forEach((b, k) => b.classList.toggle('sel', k === i));
    sfx('select');
    // 보기가 배우는 말이면 누를 때 읽어 준다 (듣기 문제는 정답이 드러나므로 읽지 않음)
    if (!listen && (ex.speakAnswer || !hangul(ex.options[i]))) speakTarget(ctx, ex.options[i], ex.lang);
    ctx.setReady(true);
  }
  onKeys((e) => { const n = Number(e.key); if (n >= 1 && n <= buttons.length) select(n - 1); });

  return {
    auto: false,
    check() {
      const correct = selected === ex.answer;
      const ans = ex.options[ex.answer];
      // 정답이 배우는 말이면 그걸, 아니면 문제의 소리 글(ex.speak)을 읽어 준다
      const sayIt = !hangul(ans) ? ans : listen ? ex.speak : '';
      return { correct, solution: correct ? '' : ans, ...(correct ? after(sayIt, ex.lang) : {}) };
    },
    lock() { lockAll(host); }
  };
}

// ───────── 문장 만들기 ─────────
function mountBuild(ex, host, ctx) {
  title(host, ex.prompt || TYPE_TITLE.build);
  say(host, ctx, ex.source, null, ex.lang);
  const line = document.createElement('div');
  line.className = 'answer-line';
  const bank = document.createElement('div');
  bank.className = 'bank';
  host.append(line, bank);
  const chosen = []; // bank 칸 번호 목록
  const bankBtns = ex.bank.map((t, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'tok';
    b.textContent = t;
    b.onclick = () => {
      if (b.classList.contains('used')) return;
      chosen.push(i);
      sfx('select');
      speakTarget(ctx, t, ex.lang);
      draw();
    };
    bank.appendChild(b);
    return b;
  });
  function draw() {
    line.innerHTML = '';
    chosen.forEach((i, pos) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tok';
      b.textContent = ex.bank[i];
      b.onclick = () => { chosen.splice(pos, 1); sfx('tap'); draw(); };
      line.appendChild(b);
    });
    bankBtns.forEach((b, i) => b.classList.toggle('used', chosen.includes(i)));
    ctx.setReady(chosen.length > 0);
  }
  onKeys((e) => { if (e.key === 'Backspace' && chosen.length) { chosen.pop(); draw(); } });
  const joiner = cjk(ex.lang) ? '' : ' ';
  return {
    auto: false,
    check() {
      const correct = _sameBuild(chosen.map((i) => ex.bank[i]), ex.answer, ex.lang);
      const full = ex.speak || ex.answer.join(joiner);
      return { correct, solution: correct ? '' : ex.answer.join(joiner), ...(correct ? after(full, ex.lang) : {}) };
    },
    lock() { lockAll(host); }
  };
}

// ───────── 짝 맞추기 ─────────
function mountMatch(ex, host, ctx) {
  title(host, TYPE_TITLE.match);
  const grid = document.createElement('div');
  grid.className = 'match';
  host.appendChild(grid);
  const left = shuffle(ex.pairs.map((p, i) => ({ text: p[0], id: i, side: 0 })));
  const right = shuffle(ex.pairs.map((p, i) => ({ text: p[1], id: i, side: 1 })));
  const items = [];
  for (let r = 0; r < ex.pairs.length; r++) {
    for (const it of [left[r], right[r]]) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'opt';
      b.textContent = it.text;
      it.el = b;
      b.onclick = () => tap(it);
      grid.appendChild(b);
      items.push(it);
    }
  }
  let picked = null;
  let left_ = ex.pairs.length;
  let finished = false;
  function tap(it) {
    if (finished || it.el.classList.contains('gone')) return;
    speakTarget(ctx, it.text, ex.lang);
    if (!picked || picked.side === it.side) {
      if (picked) picked.el.classList.remove('sel');
      picked = it;
      it.el.classList.add('sel');
      sfx('select');
      return;
    }
    const a = picked;
    picked = null;
    a.el.classList.remove('sel');
    if (a.id === it.id) {
      a.el.classList.add('gone');
      it.el.classList.add('gone');
      sfx('tap');
      if (--left_ === 0) {
        finished = true;
        setTimeout(() => ctx.finish({ correct: true, solution: '' }), 300);
      }
    } else {
      ctrl.mistakes++;
      for (const x of [a, it]) {
        x.el.classList.add('wrong');
        setTimeout(() => x.el.classList.remove('wrong'), 400);
      }
    }
  }
  const ctrl = {
    auto: true,
    mistakes: 0,
    check() { return { correct: left_ === 0, solution: left_ === 0 ? '' : ex.pairs.map((p) => `${p[0]} = ${p[1]}`).join(', ') }; },
    lock() { lockAll(host); }
  };
  if (cleanupKeys) cleanupKeys();
  return ctrl;
}

// ───────── 쓰기 ─────────
function mountType(ex, host, ctx) {
  title(host, TYPE_TITLE.type);
  say(host, ctx, ex.prompt || TYPE_TITLE.type, null, ex.lang);
  const ta = document.createElement('textarea');
  ta.className = 'input';
  ta.placeholder = '여기에 쓰세요';
  ta.setAttribute('autocapitalize', 'off');
  ta.setAttribute('autocomplete', 'off');
  ta.spellcheck = false;
  ta.lang = ex.lang || '';
  ta.oninput = () => ctx.setReady(ta.value.trim().length > 0);
  host.appendChild(ta);
  setTimeout(() => ta.focus(), 50);
  if (cleanupKeys) cleanupKeys();
  return {
    auto: false,
    check() {
      const v = _normalize(ta.value, ex.lang);
      const correct = (ex.answers || []).some((a) => _normalize(a, ex.lang) === v);
      return { correct, solution: correct ? '' : ex.answers[0], ...(correct ? after(ex.speak || ex.answers[0], ex.lang) : {}) };
    },
    lock() { lockAll(host); }
  };
}

// ───────── 체스판 ─────────
function mountChess(ex, host, ctx) {
  title(host, ex.prompt || TYPE_TITLE.chess);
  const start = parseFEN(ex.fen);
  const me = start.turn;
  const chip = document.createElement('div');
  chip.className = 'turn-chip';
  chip.textContent = me === 'w' ? '흰색 차례' : '검은색 차례';
  host.appendChild(chip);
  const board = document.createElement('div');
  board.className = 'board';
  host.appendChild(board);
  const flip = me === 'b';
  let pos = start;
  let selected = null;
  let move = null;
  let locked = false;

  function draw() {
    board.innerHTML = '';
    const targets = selected === null ? [] : legalMoves(start, selected);
    for (let k = 0; k < 64; k++) {
      const i = flip ? 63 - k : k;
      const f = i % 8;
      const r = Math.floor(i / 8);
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'sq ' + ((f + r) % 2 === 0 ? 'l' : 'd');
      if (i === selected) b.classList.add('sel');
      if (move && (i === move.from || i === move.to)) b.classList.add('last');
      const p = pos.board[i];
      let html = '';
      if (targets.some((m) => m.to === i)) html += start.board[i] ? '<span class="ring"></span>' : '<span class="dot"></span>';
      // 흰·검 모두 꽉 찬 모양(♚♛…)을 쓰고 색은 CSS로 칠한다 (흰 기물이 테두리만 보이던 문제)
      if (p) html += `<span class="pc ${p === p.toUpperCase() ? 'w' : 'b'}">${GLYPH[p.toLowerCase()]}</span>`;
      const col = k % 8;
      const row = Math.floor(k / 8);
      // 숫자는 왼쪽 위, 글자는 오른쪽 아래 (겹치지 않게)
      if (col === 0) html += `<span class="coord rank">${sqName(i)[1]}</span>`;
      if (row === 7) html += `<span class="coord file">${sqName(i)[0]}</span>`;
      b.innerHTML = html;
      b.onclick = () => tap(i);
      board.appendChild(b);
    }
  }
  const mine = (p) => p && (me === 'w' ? p === p.toUpperCase() : p === p.toLowerCase());
  function tap(i) {
    if (locked) return;
    if (mine(start.board[i]) && (move || selected !== i)) {
      // 다른 기물을 고르면 처음 판으로 돌아가서 다시
      pos = start;
      move = null;
      selected = i;
      ctx.setReady(false);
      sfx('tap');
      draw();
      return;
    }
    if (selected === null) return;
    const m = legalMoves(start, selected).find((x) => x.to === i);
    if (!m) { selected = null; draw(); return; }
    move = m;
    pos = makeMove(start, m);
    selected = null;
    sfx('tap');
    ctx.setReady(true);
    draw();
  }
  draw();
  if (cleanupKeys) cleanupKeys();
  return {
    auto: false,
    check() {
      const correct = !!move && meetsGoal(ex, start, move);
      if (correct) return { correct, solution: '' };
      const s = solutions(ex)[0];
      const solution = s ? `${PIECE_KO[start.board[s.from].toLowerCase()]} ${sqName(s.from)}→${sqName(s.to)}` : '';
      return { correct, solution };
    },
    lock() { locked = true; lockAll(host); }
  };
}

const MOUNT = { choice: mountChoice, listen: mountChoice, build: mountBuild, match: mountMatch, type: mountType, chess: mountChess };

export function mountExercise(ex, host, ctx) {
  if (cleanupKeys) cleanupKeys();
  host.innerHTML = '';
  ctx.setReady(false);
  const fn = MOUNT[ex.type];
  if (!fn) {
    title(host, '알 수 없는 문제예요');
    return { auto: true, check: () => ({ correct: true, solution: '' }), lock() {} };
  }
  return fn(ex, host, ctx);
}

export { esc as _esc };
