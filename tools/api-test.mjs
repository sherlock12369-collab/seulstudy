// 서버 시험: node tools/api-test.mjs
// 진짜 기록·설정은 건드리지 않도록 임시 폴더의 data/config로 서버를 따로 띄워서 시험한다.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'seulstudy-test-'));
const PORT = 5199;
const CODE = 'TEST-CODE';
writeFileSync(join(tmp, 'config.json'), JSON.stringify({ port: PORT, inviteCodes: [CODE], geminiKeys: [], grokKeys: [] }));

const child = spawn(process.execPath, [join(ROOT, 'server.mjs')], {
  cwd: ROOT,
  env: { ...process.env, PORT: String(PORT), SEULSTUDY_DATA: join(tmp, 'data'), SEULSTUDY_CONFIG: join(tmp, 'config.json') },
  stdio: ['ignore', 'pipe', 'pipe']
});
let log = '';
child.stdout.on('data', (d) => { log += d; });
child.stderr.on('data', (d) => { log += d; });

const BASE = `http://127.0.0.1:${PORT}`;
let token = null;
async function api(path, { method = 'GET', body, auth = true } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(auth && token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  return { status: res.status, data: await res.json().catch(() => null) };
}
// fetch는 /../ 를 미리 정리해 버리므로 날것 그대로 보내는 요청
const raw = (path) => new Promise((resolve, reject) => {
  http.get({ host: '127.0.0.1', port: PORT, path }, (res) => {
    let s = '';
    res.on('data', (d) => { s += d; });
    res.on('end', () => resolve({ status: res.statusCode, text: s }));
  }).on('error', reject);
});

let n = 0;
const ok = (name) => { n++; console.log('✓', name); };

try {
  // 서버가 뜰 때까지 기다리기
  for (let i = 0; ; i++) {
    try { await fetch(BASE + '/api/status'); break; } catch { if (i > 50) throw new Error('서버가 안 켜짐\n' + log); await new Promise((r) => setTimeout(r, 100)); }
  }

  let r = await api('/api/signup', { method: 'POST', body: { code: 'WRONG', id: 'mina', pass: '1234', nick: '미나' } });
  assert.equal(r.status, 400); assert.match(r.data.error, /가입 코드/);
  ok('틀린 가입 코드는 거절');

  r = await api('/api/signup', { method: 'POST', body: { code: CODE.toLowerCase(), id: 'Mina', pass: '1234', nick: '미나' } });
  assert.equal(r.status, 200); assert.ok(r.data.token); assert.equal(r.data.user.id, 'mina'); assert.equal(r.data.user.energy.n, 25); assert.equal(r.data.user.energy.max, 25); assert.equal(r.data.user.gems, 0); assert.deepEqual(r.data.user.chests, {}); assert.equal(r.data.user.hearts, undefined);
  ok('가입 성공 (코드는 대소문자 무관, 아이디는 소문자로)');

  r = await api('/api/signup', { method: 'POST', body: { code: CODE, id: 'mina', pass: '9999' } });
  assert.equal(r.status, 400); assert.match(r.data.error, /이미 있는/);
  ok('같은 아이디는 거절');

  r = await api('/api/login', { method: 'POST', body: { id: 'mina', pass: 'nope' } });
  assert.equal(r.status, 400);
  r = await api('/api/login', { method: 'POST', body: { id: 'mina', pass: '1234' } });
  assert.equal(r.status, 200); token = r.data.token;
  ok('로그인: 틀린 비밀번호 거절, 맞으면 성공');

  r = await api('/api/me', { auth: false });
  assert.equal(r.status, 401);
  r = await api('/api/me');
  assert.equal(r.status, 200); assert.equal(r.data.user.nick, '미나');
  ok('/api/me는 로그인해야 됨');

  r = await api('/api/lesson?course=en&unit=0&lesson=0');
  assert.equal(r.status, 200); assert.ok(r.data.exercises.length >= 6); assert.equal(r.data.source, 'builtin');
  r = await api('/api/lesson?course=chess&unit=3&lesson=1');
  assert.equal(r.status, 200); assert.ok(r.data.exercises.some((e) => e.type === 'chess'));
  ok('내장 레슨: 영어 0-0, 체스 3-1');

  r = await api('/api/lesson?course=en&unit=5&lesson=0');
  assert.equal(r.status, 503); assert.match(r.data.error, /AI/);
  ok('AI 키 없이 내장 자료 없는 단원 → 503 + 한국어 안내');

  r = await api('/api/lesson?course=xx&unit=0&lesson=0');
  assert.equal(r.status, 400);
  ok('없는 코스는 400');

  r = await api('/api/energy', { method: 'POST' });
  assert.equal(r.data.energy.n, 24); assert.ok(r.data.energy.next > Date.now());
  ok('에너지 1 쓰기 (25 → 24, 다시 차는 시각 있음)');

  r = await api('/api/complete', { method: 'POST', body: { course: 'en', unit: 0, lesson: 0, mistakes: 0 } });
  assert.equal(r.data.xp, 15); assert.equal(r.data.gems, 8); assert.equal(r.data.user.gems, 8); assert.equal(r.data.first, true); assert.equal(r.data.streakUp, true);
  assert.equal(r.data.user.streak.count, 1); assert.equal(r.data.user.todayXp, 15);
  ok('첫 완료: 15 XP, 보석 5+3, 연속 1일');

  r = await api('/api/complete', { method: 'POST', body: { course: 'en', unit: 0, lesson: 0, mistakes: 0 } });
  assert.equal(r.data.xp, 10); assert.equal(r.data.gems, 5); assert.equal(r.data.streakUp, false);
  r = await api('/api/complete', { method: 'POST', body: { course: 'en', unit: 0, lesson: 0, mistakes: 2 } });
  assert.equal(r.data.xp, 5); assert.equal(r.data.gems, 2); assert.equal(r.data.user.gems, 15); assert.equal(r.data.user.xp, 30); assert.equal(r.data.user.streak.count, 1);
  ok('다시 하기: 실수 없으면 10 XP·보석 5, 있으면 5 XP·보석 2, 연속은 그대로');

  r = await api('/api/lesson?course=en&unit=0&lesson=0');
  assert.equal(r.status, 200);
  ok('다시 하는 레슨도 받아짐 (키 없으면 내장)');

  r = await api('/api/leaderboard');
  assert.equal(r.status, 200); assert.equal(r.data.list[0].id, 'mina'); assert.equal(r.data.list[0].weekXp, 30);
  ok('이번 주 순위에 나옴');

  // ───── 상자 ─────
  r = await api('/api/chest', { method: 'POST', body: { course: 'en', unit: 0 } });
  assert.equal(r.status, 400); assert.match(r.data.error, /앞 레슨을 먼저/);
  await api('/api/complete', { method: 'POST', body: { course: 'en', unit: 0, lesson: 1, mistakes: 1 } });
  const gemsBefore = (await api('/api/me')).data.user.gems;
  r = await api('/api/chest', { method: 'POST', body: { course: 'en', unit: 0 } });
  assert.equal(r.status, 200); assert.ok(r.data.gems >= 10 && r.data.gems <= 30);
  assert.equal(r.data.user.gems, gemsBefore + r.data.gems); assert.deepEqual(r.data.user.chests, { en: [0] });
  r = await api('/api/chest', { method: 'POST', body: { course: 'en', unit: 0 } });
  assert.equal(r.status, 400); assert.match(r.data.error, /이미 연 상자/);
  r = await api('/api/chest', { method: 'POST', body: { course: 'en', unit: 99 } });
  assert.equal(r.status, 400);
  ok('상자: 레슨 0·1 끝내야 열림, 보석 10~30, 한 번만');

  // ───── 에너지 상점 (보석 40) ─────
  r = await api('/api/shop/energy', { method: 'POST' });
  if ((await api('/api/me')).data.user.gems < 40) assert.match(r.data.error, /보석이 모자라요/);
  for (let i = 0; (await api('/api/me')).data.user.gems < 40; i++) {
    await api('/api/complete', { method: 'POST', body: { course: 'en', unit: 0, lesson: 0, mistakes: 0 } });
    if (i > 20) throw new Error('보석이 안 모임');
  }
  const g = (await api('/api/me')).data.user.gems;
  r = await api('/api/shop/energy', { method: 'POST' });
  assert.equal(r.status, 200); assert.equal(r.data.user.energy.n, 25); assert.equal(r.data.user.gems, g - 40);
  r = await api('/api/shop/energy', { method: 'POST' });
  assert.equal(r.status, 400); assert.match(r.data.error, /이미 가득/);
  ok('에너지 상점: 보석 40개로 가득, 가득이면 거절');

  r = await api('/api/placement', { method: 'POST', body: { course: 'en', unit: 1 } });
  assert.equal(r.status, 400); assert.match(r.data.error, /이미 시작한 코스/);
  ok('이미 시작한 코스는 단계 고르기 안 됨');

  // ───── 새 계정으로: 단계 고르기, 에너지 바닥, 건너뛰기, 연습 ─────
  const mina = token;
  token = (await api('/api/guest', { method: 'POST', auth: false })).data.token;

  r = await api('/api/placement', { method: 'POST', body: { course: 'ja', unit: 2 } });
  assert.equal(r.status, 200); assert.equal(r.data.user.course, 'ja');
  const jaDone = Object.keys(r.data.user.progress.ja.done).sort();
  assert.equal(jaDone.length, 8); assert.ok(jaDone.includes('1-3') && !jaDone.includes('2-0'));
  assert.equal(r.data.user.xp, 0);
  r = await api('/api/placement', { method: 'POST', body: { course: 'ja', unit: 1 } });
  assert.equal(r.status, 400);
  r = await api('/api/placement', { method: 'POST', body: { course: 'zh', unit: 99 } });
  assert.equal(r.status, 400);
  ok('단계 고르기: 앞 단원 레슨을 XP 없이 끝낸 것으로, 한 번만');

  for (let i = 0; i < 25; i++) await api('/api/energy', { method: 'POST' });
  r = await api('/api/energy', { method: 'POST' });
  assert.equal(r.data.energy.n, 0);
  r = await api('/api/lesson?course=chess&unit=0&lesson=0');
  assert.equal(r.status, 403); assert.match(r.data.error, /에너지가 없어요/);
  ok('에너지 0이면 더 안 줄고, 보통 레슨은 403');

  r = await api('/api/lesson?course=chess&unit=1&mode=jump');
  assert.equal(r.status, 200); assert.equal(r.data.unit, 1); assert.equal(r.data.lesson, 3); assert.ok(r.data.exercises.length >= 6);
  r = await api('/api/jump', { method: 'POST', body: { course: 'chess', unit: 1, mistakes: 3 } });
  assert.equal(r.data.passed, false); assert.equal(r.data.xp, 0);
  assert.equal(Object.keys((r.data.user.progress.chess || { done: {} }).done).length, 0);
  r = await api('/api/jump', { method: 'POST', body: { course: 'chess', unit: 1, mistakes: 2 } });
  assert.equal(r.data.passed, true); assert.equal(r.data.xp, 10); assert.equal(r.data.gems, 5); assert.equal(r.data.user.gems, 5);
  assert.equal(Object.keys(r.data.user.progress.chess.done).length, 8); assert.equal(r.data.user.todayXp, 10); assert.equal(r.data.user.streak.count, 1);
  r = await api('/api/lesson?course=chess&unit=1&mode=jump');
  assert.equal(r.status, 400); assert.match(r.data.error, /이미 끝낸 단원/);
  ok('건너뛰기: 에너지 없이 시험, 실수 2개까지 통과 → 단원까지 끝, +10 XP, 보석 5');

  r = await api('/api/lesson?course=es&mode=practice');
  assert.equal(r.status, 400); assert.match(r.data.error, /먼저 레슨을 하나/);
  r = await api('/api/lesson?course=chess&mode=practice');
  assert.equal(r.status, 200); assert.ok(r.data.exercises.length >= 6);
  assert.ok(r.data.unit <= 1 && r.data.lesson >= 0 && r.data.lesson < 4);
  r = await api('/api/practice', { method: 'POST', body: { course: 'chess', mistakes: 0 } });
  assert.equal(r.data.xp, 5); assert.equal(r.data.energy, 5); assert.equal(r.data.user.energy.n, 5); assert.equal(r.data.user.todayXp, 15);
  ok('연습: 끝낸 레슨에서 골라 줌(에너지 필요 없음), 끝내면 +5 XP, 에너지 +5');

  r = await api('/api/shop/energy', { method: 'POST' });
  assert.equal(r.status, 400); assert.match(r.data.error, /보석이 모자라요/);
  ok('보석이 모자라면 에너지 상점 거절');
  token = mina;

  // ───── 대결 ─────
  const minaTok = token;
  token = null;
  r = await api('/api/signup', { method: 'POST', body: { code: CODE, id: 'jun', pass: '1234', nick: '준' } });
  const junTok = r.data.token;
  const guestRes = await api('/api/guest', { method: 'POST', auth: false });
  const guestTok = guestRes.data.token;
  const guestId = guestRes.data.user.id;
  token = minaTok;

  r = await api('/api/users');
  assert.equal(r.status, 200);
  assert.ok(r.data.list.some((x) => x.id === 'jun') && !r.data.list.some((x) => x.id === 'mina' || x.id.startsWith('guest_')));
  ok('대결 상대 목록: 나와 체험 계정은 빼고');

  for (const opponent of ['mina', 'nobody', guestId]) {
    r = await api('/api/duel', { method: 'POST', body: { opponent } });
    assert.equal(r.status, 400, opponent);
  }
  ok('나 자신·없는 아이디·체험 계정에는 도전 안 됨');

  const meBefore = (await api('/api/me')).data.user;
  r = await api('/api/duel', { method: 'POST', body: {} });
  assert.equal(r.status, 200);
  let duel = r.data.duel;
  assert.deepEqual(duel.to, { id: 'seul', nick: '슬' }); assert.equal(duel.from.id, 'mina'); assert.equal(duel.status, 'waiting');
  assert.equal(duel.exercises.length, 8); assert.ok(duel.exercises.every((e) => e.type !== 'match'));
  r = await api('/api/duel/finish', { method: 'POST', body: { id: duel.id, correct: 8, ms: 1000 } });
  assert.equal(r.status, 200); assert.equal(r.data.duel.status, 'done'); assert.equal(r.data.won, true); assert.equal(r.data.duel.winner, 'mina');
  assert.equal(r.data.duel.exercises, undefined); assert.ok(r.data.duel.results.seul.correct >= 5 && r.data.duel.results.seul.ms >= 25000);
  assert.equal(r.data.user.gems, meBefore.gems + 10); assert.equal(r.data.user.xp, meBefore.xp + 10);
  r = await api('/api/duel/finish', { method: 'POST', body: { id: duel.id, correct: 8, ms: 1000 } });
  assert.equal(r.status, 400);
  ok('슬 봇 대결: 8문제(짝 맞추기 없음), 끝내면 봇 결과 바로, 이기면 보석 10·XP 10, 한 번만');

  r = await api('/api/duel', { method: 'POST', body: { opponent: 'jun' } });
  duel = r.data.duel;
  assert.equal(duel.to.id, 'jun');
  const minaXp = (await api('/api/me')).data.user.xp;
  r = await api('/api/duel/finish', { method: 'POST', body: { id: duel.id, correct: 3, ms: 5000 } });
  assert.equal(r.data.won, null); assert.equal(r.data.duel.status, 'waiting');
  r = await api('/api/duel?id=' + duel.id);
  assert.equal(r.data.duel.myTurn, false); assert.equal(r.data.duel.exercises, undefined);

  token = junTok;
  r = await api('/api/duels');
  const item = r.data.list.find((d) => d.id === duel.id);
  assert.ok(item && item.myTurn === true && item.exercises === undefined);
  r = await api('/api/duel?id=' + duel.id);
  assert.equal(r.data.duel.exercises.length, 8);
  r = await api('/api/duel/finish', { method: 'POST', body: { id: duel.id, correct: 5, ms: 90000 } });
  assert.equal(r.data.won, true); assert.equal(r.data.duel.winner, 'jun'); assert.equal(r.data.user.gems, 10); assert.equal(r.data.user.xp, 10);

  token = guestTok;
  assert.equal((await api('/api/duel?id=' + duel.id)).status, 404);
  assert.equal((await api('/api/duel/finish', { method: 'POST', body: { id: duel.id, correct: 8, ms: 1 } })).status, 404);

  token = minaTok;
  r = await api('/api/duels');
  const mine = r.data.list.find((d) => d.id === duel.id);
  assert.equal(mine.status, 'done'); assert.equal(mine.myTurn, false); assert.equal(mine.winner, 'jun');
  assert.equal((await api('/api/me')).data.user.xp, minaXp + 3);
  ok('친구 대결: 둘 다 끝내면 결과, 맞힌 수 많은 쪽 승리, 진 쪽 XP 3, 참가자만 볼 수 있음');

  r = await api('/api/duel', { method: 'POST', body: { opponent: 'jun' } });
  const tie = r.data.duel.id;
  await api('/api/duel/finish', { method: 'POST', body: { id: tie, correct: 4, ms: 3000 } });
  token = junTok;
  r = await api('/api/duel/finish', { method: 'POST', body: { id: tie, correct: 4, ms: 2000 } });
  assert.equal(r.data.duel.winner, 'jun');
  token = minaTok;
  ok('맞힌 수가 같으면 더 빨리 끝낸 쪽 승리');

  const home = await raw('/');
  assert.equal(home.status, 200); assert.match(home.text, /<title>슬터디<\/title>/);
  for (const p of ['/../config.json', '/%2e%2e/config.json', '/..%2fconfig.json', '/%2e%2e%5cconfig.json']) {
    const t = await raw(p);
    assert.ok(!t.text.includes(CODE) && !t.text.includes('inviteCodes'), `${p}가 설정을 보여 줌!`);
  }
  ok('화면은 index.html, ../config.json 같은 경로로 설정이 새지 않음');

  const saved = token;
  token = null;
  r = await api('/api/guest', { method: 'POST', auth: false });
  assert.equal(r.status, 200); assert.match(r.data.user.id, /^guest_[0-9a-f]{6}$/); assert.equal(r.data.user.nick, '체험'); assert.equal(r.data.user.guest, true);
  token = r.data.token;
  assert.equal((await api('/api/me')).data.user.guest, true);
  assert.equal((await api('/api/lesson?course=en&unit=0&lesson=0')).status, 200);
  token = saved;
  assert.equal((await api('/api/me')).data.user.guest, false);
  ok('체험하기: 가입 코드 없이 guest_ 계정, guest 표시');

  for (let i = 0; i < 9; i++) await api('/api/guest', { method: 'POST', auth: false });
  r = await api('/api/guest', { method: 'POST', auth: false });
  assert.equal(r.status, 429);
  ok('체험하기는 IP당 10분에 10번까지');

  writeFileSync(join(tmp, 'config.json'), JSON.stringify({ port: PORT, inviteCodes: [CODE], geminiKeys: [], grokKeys: [], allowGuest: false }));
  r = await api('/api/guest', { method: 'POST', auth: false });
  assert.equal(r.status, 403); assert.match(r.data.error, /체험하기가 꺼져/);
  ok('allowGuest: false면 체험하기 403');

  r = await api('/api/logout', { method: 'POST' });
  r = await api('/api/me');
  assert.equal(r.status, 401);
  ok('로그아웃하면 토큰이 더는 안 됨');

  console.log(`\n모두 통과 (${n})`);
} catch (err) {
  console.error('\n실패:', err.message, '\n--- 서버 기록 ---\n' + log);
  process.exitCode = 1;
} finally {
  child.kill();
  await new Promise((r) => setTimeout(r, 300));
  try { rmSync(tmp, { recursive: true, force: true }); } catch { /* 윈도우에서 가끔 잠김 */ }
}
