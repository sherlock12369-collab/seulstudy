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
  assert.equal(r.status, 200); assert.ok(r.data.token); assert.equal(r.data.user.id, 'mina'); assert.equal(r.data.user.hearts.n, 5);
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

  r = await api('/api/heart', { method: 'POST' });
  assert.equal(r.data.hearts.n, 4); assert.ok(r.data.hearts.next > Date.now());
  ok('하트 하나 잃기 (5 → 4, 다시 차는 시각 있음)');

  r = await api('/api/complete', { method: 'POST', body: { course: 'en', unit: 0, lesson: 0, mistakes: 0 } });
  assert.equal(r.data.xp, 15); assert.equal(r.data.first, true); assert.equal(r.data.streakUp, true);
  assert.equal(r.data.user.streak.count, 1); assert.equal(r.data.user.todayXp, 15);
  ok('첫 완료: 15 XP, 연속 1일');

  r = await api('/api/complete', { method: 'POST', body: { course: 'en', unit: 0, lesson: 0, mistakes: 0 } });
  assert.equal(r.data.xp, 10); assert.equal(r.data.streakUp, false);
  r = await api('/api/complete', { method: 'POST', body: { course: 'en', unit: 0, lesson: 0, mistakes: 2 } });
  assert.equal(r.data.xp, 5); assert.equal(r.data.user.xp, 30); assert.equal(r.data.user.streak.count, 1);
  ok('다시 하기: 실수 없으면 10, 있으면 5 XP, 연속은 그대로');

  r = await api('/api/lesson?course=en&unit=0&lesson=0');
  assert.equal(r.status, 200);
  ok('다시 하는 레슨도 받아짐 (키 없으면 내장)');

  r = await api('/api/leaderboard');
  assert.equal(r.status, 200); assert.equal(r.data.list[0].id, 'mina'); assert.equal(r.data.list[0].weekXp, 30);
  ok('이번 주 순위에 나옴');

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
