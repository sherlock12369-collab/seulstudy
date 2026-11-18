// 이 컴퓨터 서버를 인터넷에 잠깐 여는 통로(Cloudflare 무료 터널)를 켜고,
// 새 주소를 public/server.json에 적어 GitHub 사이트에 올린다. (start.bat이 부른다)
//   필요: cloudflared  (winget install --id Cloudflare.cloudflared -e)
// 터널 주소는 켤 때마다 바뀌어서, 바뀔 때마다 사이트에 새 주소를 알려 준다.
import { spawn, execFileSync } from 'node:child_process';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const cfgFile = join(ROOT, 'config.json');
const port = existsSync(cfgFile) ? (JSON.parse(readFileSync(cfgFile, 'utf8')).port || 5173) : 5173;
const SERVER_JSON = join(ROOT, 'public', 'server.json');

function publish(url) {
  writeFileSync(SERVER_JSON, JSON.stringify({ url, updated: new Date().toISOString() }) + '\n');
  try {
    const git = (...a) => execFileSync('git', a, { cwd: ROOT, stdio: 'pipe' });
    git('add', 'public/server.json');
    git('commit', '-m', '서버 주소 바뀜 (터널)', '--', 'public/server.json');
    git('push', '-q', 'origin', 'HEAD:main');
    console.log('  사이트에 새 서버 주소를 올렸어요. 1~2분 뒤 사이트에서 접속돼요.');
  } catch (err) {
    console.log('  사이트에 주소를 올리지 못했어요:', String(err.stderr || err.message).trim().split('\n').pop());
  }
}

const cf = spawn('cloudflared', ['tunnel', '--no-autoupdate', '--url', `http://localhost:${port}`], { stdio: ['ignore', 'pipe', 'pipe'] });
cf.on('error', () => {
  console.log('\n  cloudflared가 없어요. 폰·다른 곳에서도 들어오려면 한 번만 설치해 주세요:');
  console.log('    winget install --id Cloudflare.cloudflared -e\n  (같은 와이파이에서는 터널 없이도 돼요)\n');
  process.exit(0);
});
let found = false;
const onData = (buf) => {
  const m = String(buf).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
  if (m && !found) {
    found = true;
    console.log(`\n  인터넷 주소(터널): ${m[0]}`);
    publish(m[0]);
  }
};
cf.stdout.on('data', onData);
cf.stderr.on('data', onData);
cf.on('exit', (code) => { console.log('  터널이 꺼졌어요 (코드 ' + code + ')'); process.exit(0); });
process.on('SIGINT', () => cf.kill());
