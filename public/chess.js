// 슬터디 — 작은 체스 규칙 엔진 (화면과 서버가 함께 쓴다)
// 레슨 퍼즐용이라 캐슬링·앙파상은 다루지 않는다. 폰이 끝 줄에 닿으면 퀸이 된다.
// 칸 번호: 0 = a8, 7 = h8, 56 = a1, 63 = h1

export const FILES = 'abcdefgh';
export const sqName = (i) => FILES[i % 8] + (8 - Math.floor(i / 8));
export const sqIndex = (name) => (8 - Number(name[1])) * 8 + FILES.indexOf(name[0]);
const colorOf = (p) => (p ? (p === p.toUpperCase() ? 'w' : 'b') : null);

export function parseFEN(fen) {
  const [placement, turn = 'w'] = String(fen).trim().split(/\s+/);
  const board = [];
  for (const row of placement.split('/')) {
    for (const ch of row) {
      if (/\d/.test(ch)) for (let k = 0; k < Number(ch); k++) board.push(null);
      else board.push(ch);
    }
  }
  if (board.length !== 64) throw new Error('잘못된 FEN: ' + fen);
  return { board, turn };
}

const KNIGHT = [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]];
const KING = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
const ROOK = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const BISHOP = [[1, 1], [1, -1], [-1, 1], [-1, -1]];

function pseudoMoves(pos, from) {
  const p = pos.board[from];
  if (!p) return [];
  const me = colorOf(p);
  const f = from % 8;
  const r = Math.floor(from / 8);
  const out = [];
  const at = (ff, rr) => (ff >= 0 && ff < 8 && rr >= 0 && rr < 8 ? rr * 8 + ff : -1);
  const add = (to) => {
    const promo = p.toLowerCase() === 'p' && (to < 8 || to >= 56) ? (me === 'w' ? 'Q' : 'q') : null;
    out.push({ from, to, promo });
  };
  const type = p.toLowerCase();
  if (type === 'p') {
    const dir = me === 'w' ? -1 : 1;
    const one = at(f, r + dir);
    if (one >= 0 && !pos.board[one]) {
      add(one);
      const start = me === 'w' ? 6 : 1;
      const two = at(f, r + 2 * dir);
      if (r === start && two >= 0 && !pos.board[two]) add(two);
    }
    for (const df of [-1, 1]) {
      const t = at(f + df, r + dir);
      if (t >= 0 && pos.board[t] && colorOf(pos.board[t]) !== me) add(t);
    }
    return out;
  }
  const steps = (dirs, slide) => {
    for (const [df, dr] of dirs) {
      let ff = f + df;
      let rr = r + dr;
      while (true) {
        const t = at(ff, rr);
        if (t < 0) break;
        if (pos.board[t]) {
          if (colorOf(pos.board[t]) !== me) add(t);
          break;
        }
        add(t);
        if (!slide) break;
        ff += df;
        rr += dr;
      }
    }
  };
  if (type === 'n') steps(KNIGHT, false);
  else if (type === 'k') steps(KING, false);
  else if (type === 'r') steps(ROOK, true);
  else if (type === 'b') steps(BISHOP, true);
  else if (type === 'q') steps([...ROOK, ...BISHOP], true);
  return out;
}

export function makeMove(pos, m) {
  const board = pos.board.slice();
  board[m.to] = m.promo || board[m.from];
  board[m.from] = null;
  return { board, turn: pos.turn === 'w' ? 'b' : 'w' };
}

/** color의 킹이 공격받고 있는지. 킹이 없으면 false (기물 연습 판) */
export function inCheck(pos, color) {
  const king = pos.board.findIndex((p) => p === (color === 'w' ? 'K' : 'k'));
  if (king < 0) return false;
  for (let i = 0; i < 64; i++) {
    const p = pos.board[i];
    if (p && colorOf(p) !== color && pseudoMoves(pos, i).some((m) => m.to === king)) return true;
  }
  return false;
}

export function legalMoves(pos, from = null) {
  const out = [];
  for (let i = 0; i < 64; i++) {
    if (from !== null && i !== from) continue;
    const p = pos.board[i];
    if (!p || colorOf(p) !== pos.turn) continue;
    for (const m of pseudoMoves(pos, i)) {
      if (!inCheck(makeMove(pos, m), pos.turn)) out.push(m);
    }
  }
  return out;
}

export const isMate = (pos) => inCheck(pos, pos.turn) && legalMoves(pos).length === 0;

/**
 * 레슨 목표를 이 수가 이루는지.
 * goal: 'mate' | 'check' | 'capture'(square) | 'to'(square) | 'uci'(moves)
 */
export function meetsGoal(ex, pos, m) {
  const after = makeMove(pos, m);
  const uci = sqName(m.from) + sqName(m.to);
  switch (ex.goal) {
    case 'mate': return isMate(after);
    case 'check': return inCheck(after, after.turn);
    case 'capture': return !!pos.board[m.to] && sqName(m.to) === ex.square;
    case 'to': return sqName(m.to) === ex.square;
    case 'uci': return (ex.moves || []).includes(uci);
    default: return false;
  }
}

/** 목표를 이루는 합법적인 수 목록 (퍼즐 검사·힌트용) */
export const solutions = (ex) => {
  const pos = parseFEN(ex.fen);
  return legalMoves(pos).filter((m) => meetsGoal(ex, pos, m));
};

export const GLYPH = { K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙', k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
export const PIECE_KO = { k: '킹', q: '퀸', r: '룩', b: '비숍', n: '나이트', p: '폰' };
