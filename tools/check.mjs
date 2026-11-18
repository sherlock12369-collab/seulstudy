// 검사: node tools/check.mjs
//  - 체스 퍼즐마다 정답이 있는지 (엔진으로)
//  - 'uci' 문제의 정답 수가 모두 규칙에 맞는지
//  - 내장 자료가 있는 모든 레슨이 문제를 만들고, 문제 모양이 맞는지
//  - AI 답 검사기가 이상한 답을 걸러내는지
import assert from 'node:assert/strict';
import { CHESS_POOLS, checkChessPuzzles, builtinLesson, cleanAiLesson, COURSES } from '../lessons.mjs';
import { parseFEN, legalMoves, sqName, solutions, isMate, makeMove } from '../public/chess.js';
import { LESSONS_PER_UNIT } from '../public/courses.js';

let n = 0;
const ok = (name) => { n++; console.log('✓', name); };

const problems = checkChessPuzzles();
assert.deepEqual(problems, [], problems.join('\n'));
ok(`체스 퍼즐 ${CHESS_POOLS.flat().length}개 모두 답이 있음`);

for (const p of CHESS_POOLS.flat().filter((x) => x.goal === 'uci')) {
  const legal = legalMoves(parseFEN(p.fen)).map((m) => sqName(m.from) + sqName(m.to));
  for (const m of p.moves) assert.ok(legal.includes(m), `${p.fen}: ${m}는 규칙에 안 맞음`);
  assert.equal(solutions(p).length, p.moves.length, `${p.fen}: 정답 수가 빠졌거나 틀림 (${legal})`);
}
ok('uci 정답 수가 모두 규칙에 맞음');

// 메이트 퍼즐: 정답 수를 둔 뒤 정말 체크메이트인지 한 번 더
for (const p of CHESS_POOLS.flat().filter((x) => x.goal === 'mate')) {
  const pos = parseFEN(p.fen);
  for (const m of solutions(p)) assert.ok(isMate(makeMove(pos, m)));
}
ok('메이트 퍼즐의 정답은 모두 체크메이트');

// 알려진 결과로 엔진 확인
assert.ok(isMate(makeMove(parseFEN('6k1/5ppp/8/8/8/8/8/R5K1 w'), { from: 56, to: 0 })), 'Ra8#');
assert.equal(legalMoves(parseFEN('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w')).length, 20, '처음 판은 20수');
ok('엔진: 처음 판 20수, Ra8# 확인');

const shapes = {
  choice: (e) => e.options.length >= 2 && e.answer >= 0 && e.answer < e.options.length,
  listen: (e) => e.speak && e.options[e.answer] !== undefined,
  build: (e) => e.answer.every((t) => e.bank.includes(t)) && e.source,
  match: (e) => e.pairs.length >= 3,
  type: (e) => e.answers.length >= 1,
  chess: (e) => solutions(e).length > 0
};
let lessons = 0;
for (const c of COURSES) {
  c.units.forEach((u, ui) => {
    for (let li = 0; li < LESSONS_PER_UNIT; li++) {
      const l = builtinLesson(c.id, ui, li);
      const hasData = c.kind === 'chess' ? !!CHESS_POOLS[ui] : !!u.vocab;
      if (!hasData) { assert.equal(l, null); continue; }
      assert.ok(l && l.exercises.length >= 6, `${c.id} ${ui}-${li}: 문제가 너무 적음`);
      for (const e of l.exercises) assert.ok(shapes[e.type] && shapes[e.type](e), `${c.id} ${ui}-${li}: 모양이 틀림 ${JSON.stringify(e)}`);
      // 고르기 보기에 같은 글이 두 번 나오면 안 됨
      for (const e of l.exercises.filter((x) => x.options)) assert.equal(new Set(e.options).size, e.options.length, JSON.stringify(e));
      lessons++;
    }
  });
}
ok(`내장 레슨 ${lessons}개 모두 정상`);

assert.equal(cleanAiLesson({ exercises: [{ type: 'choice', options: ['a'], answer: 3 }] }, 'en'), null);
const good = cleanAiLesson({
  exercises: [
    { type: 'choice', prompt: 'q', options: ['apple', 'pear', 'milk'], answer: 0 },
    { type: 'listen', speak: 'dog', options: ['dog', 'cat'], answer: 0 },
    { type: 'build', source: '나는 학생이다', answer: ['I', 'am', 'a', 'student'], extra: ['am', 'is'] },
    { type: 'match', pairs: [['a', '가'], ['b', '나'], ['c', '다'], ['c', '라']] },
    { type: 'type', prompt: 'p', answers: ['hello'] },
    { type: 'choice', options: ['x', 'y'], answer: 1 },
    { type: 'weird' }
  ]
}, 'en');
assert.equal(good.exercises.length, 6);
assert.equal(good.exercises[0].options[good.exercises[0].answer], 'apple', '섞어도 정답 번호가 맞음');
assert.deepEqual(good.exercises[2].bank.slice().sort(), ['I', 'a', 'am', 'is', 'student'].sort(), 'build: 정답과 겹치는 오답 조각은 뺌');
assert.equal(good.exercises[3].pairs.length, 3, 'match: 겹치는 짝은 뺌');
ok('AI 답 검사기');

console.log(`\n모두 통과 (${n})`);
