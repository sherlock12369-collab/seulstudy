// 슬터디 — 레슨 만들기
//  - 내장 자료(courses.js의 vocab/sentences, 아래 체스 퍼즐)로 만들기
//  - AI에게 줄 부탁 글, AI가 준 문제를 검사·정리하기
import { COURSES, courseOf, LESSONS_PER_UNIT } from './public/courses.js';
import { parseFEN, solutions } from './public/chess.js';

// ───────── 정해진 순서로 섞기 (같은 레슨은 같은 문제) ─────────
function rng(seedText) {
  let h = 2166136261;
  for (const c of String(seedText)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}
const shuffle = (arr, rand = Math.random) => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const pick = (arr, n, rand) => shuffle(arr, rand).slice(0, n);

/** 고르기 문제: 정답을 섞은 보기 안에 넣고 번호를 맞춘다 */
function choice(prompt, answer, wrongs, rand, extra = {}) {
  const options = shuffle([answer, ...pick(wrongs.filter((w) => w !== answer), 3, rand)], rand);
  return { type: 'choice', prompt, options, answer: options.indexOf(answer), ...extra };
}

// ───────── 언어 레슨 (내장) ─────────
function builtinLanguage(course, unitIdx, lessonIdx, seed) {
  const unit = course.units[unitIdx];
  if (!unit || !unit.vocab) return null;
  const rand = rng(`${course.id}-${unitIdx}-${lessonIdx}-${seed}`);
  const V = unit.vocab;
  // 레슨마다 앞쪽에서 조금씩 밀어서 5단어씩 (마지막 레슨은 전체 복습)
  const start = (lessonIdx * 3) % V.length;
  const focus = lessonIdx === LESSONS_PER_UNIT - 1 ? pick(V, 5, rand) : [0, 1, 2, 3, 4].map((k) => V[(start + k) % V.length]);
  const say = (w) => (w[2] ? `${w[0]} (${w[2]})` : w[0]);
  const targets = V.map((w) => w[0]);
  const meanings = V.map((w) => w[1]);
  const lang = course.lang;
  const ex = [];

  const [a, b, c, d, e] = focus;
  ex.push(choice(`“${a[1]}”은(는) ${course.name}로?`, a[0], targets, rand, { speakAnswer: true, lang }));
  ex.push(choice(`“${say(b)}”은(는) 무슨 뜻?`, b[1], meanings, rand, { speak: b[0], lang }));
  ex.push({ ...choice('들리는 말을 고르세요', c[0], targets, rand), type: 'listen', speak: c[0], lang });
  ex.push({ type: 'match', pairs: pick(focus, 4, rand).map((w) => [w[0], w[1]]), lang });

  const S = unit.sentences || [];
  const allTokens = S.flatMap((s) => s.t);
  for (const s of pick(S, 2, rand)) {
    const extra = pick(allTokens.filter((t) => !s.t.includes(t)), 2, rand);
    ex.push({ type: 'build', prompt: '이 문장을 만들어 보세요', source: s.ko, answer: s.t, bank: shuffle([...s.t, ...extra], rand), lang, speak: s.text });
  }
  ex.push(choice(`“${d[1]}”은(는) ${course.name}로?`, d[0], targets, rand, { speakAnswer: true, lang }));
  ex.push({ ...choice('들리는 말을 고르세요', e[0], targets, rand), type: 'listen', speak: e[0], lang });
  // 쓰기: 짧은 말만 (일본어·중국어는 글자 입력이 어려워서 읽는 법으로도 받는다)
  const short = focus.find((w) => w[0].length <= 12) || a;
  ex.push({ type: 'type', prompt: `“${short[1]}”을(를) ${course.name}로 써 보세요`, answers: [short[0], ...(short[2] ? [short[2]] : [])], lang, speak: short[0] });
  if (S.length) {
    const s = S[Math.floor(rand() * S.length)];
    ex.push(choice(`“${s.text}”은(는) 무슨 뜻?`, s.ko, S.map((x) => x.ko), rand, { speak: s.text, lang }));
  }
  return { exercises: ex.filter(Boolean), source: 'builtin' };
}

// ───────── 체스 (내장) ─────────
// 모든 퍼즐은 tools/check-chess.mjs 로 엔진 검사를 통과해야 한다.
const MOVE = [
  { fen: '8/8/8/8/3R4/8/8/8 w', prompt: '룩은 앞뒤·옆으로 쭉 가요. 룩을 d8로 옮기세요', goal: 'to', square: 'd8' },
  { fen: '8/8/8/8/3R4/8/8/8 w', prompt: '룩을 h4로 옮기세요', goal: 'to', square: 'h4' },
  { fen: '8/8/8/8/2B5/8/8/8 w', prompt: '비숍은 대각선으로 가요. 비숍을 f7로 옮기세요', goal: 'to', square: 'f7' },
  { fen: '8/8/8/8/2B5/8/8/8 w', prompt: '비숍을 a2로 옮기세요', goal: 'to', square: 'a2' },
  { fen: '8/8/8/4Q3/8/8/8/8 w', prompt: '퀸은 룩 + 비숍처럼 가요. 퀸을 a1로 옮기세요', goal: 'to', square: 'a1' },
  { fen: '8/8/8/4Q3/8/8/8/8 w', prompt: '퀸을 e1로 옮기세요', goal: 'to', square: 'e1' },
  { fen: '8/8/8/8/4N3/8/8/8 w', prompt: '나이트는 “ㄱ”자로 뛰어요. 나이트를 f6로 옮기세요', goal: 'to', square: 'f6' },
  { fen: '8/8/8/8/4N3/8/8/8 w', prompt: '나이트를 c3로 옮기세요', goal: 'to', square: 'c3' },
  { fen: '8/8/8/8/8/8/4P3/8 w', prompt: '폰은 처음에 두 칸 갈 수 있어요. 폰을 e4로 옮기세요', goal: 'to', square: 'e4' },
  { fen: '8/8/8/8/8/3K4/8/8 w', prompt: '킹은 한 칸씩 가요. 킹을 e4로 옮기세요', goal: 'to', square: 'e4' }
];
const CAPTURE = [
  { fen: '4k3/8/8/3p4/8/2N5/8/4K3 w', prompt: '나이트로 d5의 폰을 잡으세요', goal: 'capture', square: 'd5' },
  { fen: '4k3/8/8/8/8/8/1q6/1R2K3 w', prompt: '아무도 지키지 않는 퀸이에요. 룩으로 b2의 퀸을 잡으세요', goal: 'capture', square: 'b2' },
  { fen: '4k3/8/8/1r6/8/8/8/4KB2 w', prompt: '비숍으로 룩을 잡으세요', goal: 'capture', square: 'b5' },
  { fen: '4k3/8/8/8/3n4/4P3/8/4K3 w', prompt: '폰은 대각선 앞으로 잡아요. 나이트를 잡으세요', goal: 'capture', square: 'd4' },
  { fen: '4k3/8/8/8/8/8/5n2/4K3 w', prompt: '킹도 잡을 수 있어요. 나이트를 잡으세요', goal: 'capture', square: 'f2' },
  { fen: '3rk3/8/8/8/8/8/8/3QK3 w', prompt: '퀸으로 룩을 잡으세요', goal: 'capture', square: 'd8' }
];
const CHECK = [
  { fen: '4k3/8/8/8/8/8/8/R3K3 w', prompt: '룩으로 체크하세요 (킹을 공격)', goal: 'check' },
  { fen: '4k3/8/8/8/8/8/8/4KB2 w', prompt: '비숍으로 체크하세요', goal: 'check' },
  { fen: '4k3/8/8/8/4N3/8/8/4K3 w', prompt: '나이트로 체크하세요', goal: 'check' },
  { fen: '7k/8/8/8/8/8/8/3QK3 w', prompt: '퀸으로 체크하세요', goal: 'check' },
  { fen: '4k3/8/8/8/8/8/8/3QK3 b', prompt: '검은색 차례! 킹을 움직여 보세요 (공격받는 칸은 못 가요)', goal: 'uci', moves: ['e8e7', 'e8f7', 'e8f8'] }
];
const MATE = [
  { fen: '6k1/5ppp/8/8/8/8/8/R5K1 w', prompt: '한 수로 체크메이트! (뒷줄 메이트)', goal: 'mate' },
  { fen: '6k1/5ppp/8/8/8/8/8/3Q2K1 w', prompt: '한 수로 체크메이트!', goal: 'mate' },
  { fen: 'k7/8/1K6/8/8/8/8/7R w', prompt: '한 수로 체크메이트!', goal: 'mate' },
  { fen: '7k/8/6K1/8/8/8/8/5Q2 w', prompt: '한 수로 체크메이트!', goal: 'mate' },
  { fen: 'r5k1/8/8/8/8/8/5PPP/6K1 b', prompt: '검은색 차례! 한 수로 체크메이트', goal: 'mate' },
  { fen: '3q2k1/8/8/8/8/8/5PPP/6K1 b', prompt: '검은색 차례! 한 수로 체크메이트', goal: 'mate' }
];
const MATE2 = [
  { fen: 'r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w', prompt: '한 수로 체크메이트! (f7이 약해요)', goal: 'mate' },
  { fen: '6rk/6pp/8/6N1/8/8/8/6K1 w', prompt: '나이트로 체크메이트! (킹이 자기 기물에 갇혔어요)', goal: 'mate' },
  { fen: 'k7/pp6/8/8/8/8/8/K5R1 w', prompt: '한 수로 체크메이트!', goal: 'mate' },
  { fen: '5rk1/5p1p/8/8/8/8/1B6/6QK w', prompt: '퀸과 비숍이 힘을 합쳐요. 한 수로 체크메이트!', goal: 'mate' },
  { fen: '1k6/ppp5/8/8/8/8/8/4R1K1 w', prompt: '한 수로 체크메이트!', goal: 'mate' }
];
export const CHESS_POOLS = [MOVE, CAPTURE, CHECK, MATE, MATE2];

const RULES = [
  ['체스판은 몇 칸일까요?', '64칸', ['49칸', '81칸', '100칸']],
  ['한 번에 대각선으로만 가는 기물은?', '비숍', ['룩', '나이트', '킹']],
  ['다른 기물을 뛰어넘을 수 있는 기물은?', '나이트', ['퀸', '비숍', '룩']],
  ['가장 힘이 센 기물은?', '퀸', ['킹', '룩', '나이트']],
  ['킹은 한 번에 몇 칸 갈 수 있나요?', '한 칸', ['두 칸', '끝까지', '세 칸']],
  ['폰이 끝 줄에 닿으면?', '다른 기물(보통 퀸)로 바뀌어요', ['사라져요', '처음 칸으로 돌아가요', '킹이 돼요']],
  ['체크메이트란?', '킹이 공격받고 피할 방법이 없는 것', ['킹을 잡는 것', '퀸을 잡는 것', '수를 쉬는 것']],
  ['체크를 받으면 꼭 해야 하는 것은?', '체크에서 벗어나기', ['퀸을 움직이기', '한 수 쉬기', '아무 수나 두기']],
  ['먼저 두는 쪽은?', '흰색', ['검은색', '아무나', '가위바위보로']]
];

function builtinChess(course, unitIdx, lessonIdx, seed) {
  const pool = CHESS_POOLS[unitIdx];
  if (!pool) return null;
  const rand = rng(`chess-${unitIdx}-${lessonIdx}-${seed}`);
  const puzzles = pick(pool, Math.min(pool.length, 5), rand).map((p) => ({ type: 'chess', ...p }));
  const rules = pick(RULES, unitIdx === 0 ? 4 : 2, rand).map(([q, a, w]) => choice(q, a, w, rand));
  // 규칙 문제를 퍼즐 사이에 끼운다
  const ex = [];
  puzzles.forEach((p, i) => { ex.push(p); if (rules[i]) ex.push(rules[i]); });
  return { exercises: ex, source: 'builtin' };
}

export function builtinLesson(courseId, unitIdx, lessonIdx, seed = 0) {
  const course = courseOf(courseId);
  if (!course) return null;
  return course.kind === 'chess' ? builtinChess(course, unitIdx, lessonIdx, seed) : builtinLanguage(course, unitIdx, lessonIdx, seed);
}

// ───────── AI 레슨 ─────────
export function aiPrompt(courseId, unitIdx, lessonIdx) {
  const course = courseOf(courseId);
  const unit = course.units[unitIdx];
  const earlier = course.units.slice(0, unitIdx).map((u) => u.title).join(', ') || '없음';
  return `너는 한국 사람을 위한 언어 학습 앱 "슬터디"의 레슨 출제자야.
배우는 말: ${course.langName}. 학습자 모국어: 한국어.
단원 ${unitIdx + 1}: "${unit.title}" (${unit.desc}). 이 단원의 ${lessonIdx + 1}번째 레슨 (단원 안 레슨 ${LESSONS_PER_UNIT}개 중). 레슨 번호가 클수록 조금 어렵게, 마지막 레슨은 단원 복습.
앞에서 배운 단원: ${earlier}. 초보자 수준, 짧고 자주 쓰는 표현만.

문제 10개를 JSON으로만 답해. 형식:
{"exercises":[ 문제… ]}
문제 종류 (골고루 섞기, 같은 종류 3개 넘지 않기):
1. {"type":"choice","prompt":"“사과”는 ${course.name}로?","options":["정답","오답","오답","오답"],"answer":0,"speak":"(소리 내어 읽을 ${course.name} 글, 없으면 생략)"}
2. {"type":"listen","speak":"(들려줄 ${course.name} 단어나 짧은 문장)","options":["정답(=speak와 같은 글)","비슷한 오답","오답","오답"],"answer":0}
3. {"type":"build","prompt":"이 문장을 만들어 보세요","source":"(한국어 문장)","answer":["${course.name}","낱말","조각"],"extra":["헷갈리는","오답 조각"]}
4. {"type":"match","pairs":[["${course.name} 말","한국어 뜻"],… 4쌍]}
5. {"type":"type","prompt":"“고마워요”를 ${course.name}로 써 보세요","answers":["정답","다르게 써도 맞는 답"]}
규칙:
- answer는 options 안 정답의 번호(0부터). 오답은 그럴듯하지만 분명히 틀린 것.
- build의 answer 조각을 이어 붙이면 자연스러운 문장. 영어·스페인어는 단어 단위, 일본어·중국어는 의미 단위 조각.
- 일본어·중국어 글에는 괄호로 읽는 법(로마자 또는 병음)을 prompt나 option에 붙여도 좋다. type 문제 answers에는 읽는 법도 정답으로 넣어라.
- 모든 설명·prompt는 한국어. 틀린 정보 금지.`;
}

const str = (x, max = 200) => (typeof x === 'string' && x.trim() ? x.trim().slice(0, max) : null);
const strs = (arr, max) => (Array.isArray(arr) ? arr.map((x) => str(x, max)).filter(Boolean) : []);

/** AI가 준 JSON을 검사해서 앱이 쓸 수 있는 문제만 남긴다. 너무 적으면 null */
export function cleanAiLesson(raw, courseId) {
  const course = courseOf(courseId);
  const lang = course.lang;
  const list = raw && Array.isArray(raw.exercises) ? raw.exercises : [];
  const out = [];
  for (const e of list.slice(0, 14)) {
    if (!e || typeof e !== 'object') continue;
    if (e.type === 'choice' || e.type === 'listen') {
      const options = strs(e.options, 120);
      const ai = Number(e.answer);
      if (options.length < 2 || options.length > 4 || !(ai >= 0 && ai < options.length) || new Set(options).size !== options.length) continue;
      const answer = options[ai];
      const shuffled = shuffle(options);
      const speak = str(e.speak, 200);
      if (e.type === 'listen' && !speak) continue;
      out.push({ type: e.type, prompt: str(e.prompt) || (e.type === 'listen' ? '들리는 말을 고르세요' : '알맞은 것을 고르세요'), options: shuffled, answer: shuffled.indexOf(answer), ...(speak ? { speak } : {}), lang });
    } else if (e.type === 'build') {
      const answer = strs(e.answer, 40);
      const extra = strs(e.extra, 40).filter((t) => !answer.includes(t)).slice(0, 4);
      const source = str(e.source);
      if (answer.length < 2 || answer.length > 12 || !source) continue;
      const joiner = /^(ja|zh)/.test(lang) ? '' : ' ';
      out.push({ type: 'build', prompt: str(e.prompt) || '이 문장을 만들어 보세요', source, answer, bank: shuffle([...answer, ...extra]), lang, speak: answer.join(joiner) });
    } else if (e.type === 'match') {
      const pairs = (Array.isArray(e.pairs) ? e.pairs : []).map((p) => (Array.isArray(p) ? [str(p[0], 60), str(p[1], 60)] : [])).filter((p) => p[0] && p[1]);
      const uniq = pairs.filter((p, i) => pairs.findIndex((q) => q[0] === p[0] || q[1] === p[1]) === i).slice(0, 5);
      if (uniq.length < 3) continue;
      out.push({ type: 'match', pairs: uniq, lang });
    } else if (e.type === 'type') {
      const answers = strs(e.answers, 120);
      if (!answers.length) continue;
      out.push({ type: 'type', prompt: str(e.prompt) || '써 보세요', answers, lang, speak: answers[0] });
    }
  }
  return out.length >= 6 ? { exercises: out, source: 'ai' } : null;
}

/** 체스 퍼즐 모두 검사 (도구·테스트용). 문제 목록을 돌려준다 */
export function checkChessPuzzles() {
  const problems = [];
  CHESS_POOLS.forEach((pool, u) => pool.forEach((p, i) => {
    try {
      parseFEN(p.fen);
      const sol = solutions(p);
      if (!sol.length) problems.push(`단원 ${u + 1} #${i + 1}: 답이 없음 (${p.fen})`);
    } catch (err) {
      problems.push(`단원 ${u + 1} #${i + 1}: ${err.message}`);
    }
  }));
  return problems;
}

export { COURSES };
