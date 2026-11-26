/**
 * Phase 7 — smoke-verify Electron shell (unpackaged).
 * Does not connect to production. Uses loopback mock HTTP only.
 */
import { spawn } from 'child_process';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const electronPath = require('electron');
const {
  resolveDesktopAppUrl,
} = require('../electron/urlConfig.cjs');

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function run() {
  const results = [];

  // 1) Packaged URL guards (logic)
  const missing = resolveDesktopAppUrl({
    packaged: true,
    env: {},
    userDataPath: path.join(root, 'node_modules', '.cache'),
  });
  assert(missing.ok === false && missing.reason === 'missing', 'missing URL');
  results.push('packaged missing URL → setup reason');

  const badHttp = resolveDesktopAppUrl({
    packaged: true,
    env: { DESKTOP_APP_URL: 'http://127.0.0.1:9' },
    userDataPath: path.join(root, 'node_modules', '.cache'),
  });
  assert(badHttp.reason === 'https_required', 'http rejected when packaged');
  results.push('packaged HTTP rejected');

  const httpsOk = resolveDesktopAppUrl({
    packaged: true,
    env: { DESKTOP_APP_URL: 'https://example.com' },
    userDataPath: path.join(root, 'node_modules', '.cache'),
  });
  assert(httpsOk.ok === true, 'https accepted when packaged');
  results.push('packaged HTTPS accepted');

  // 2) Mock loopback HTTP + brief Electron launch
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(
      '<!doctype html><html><body><h1>ASSOCIATE mock host</h1></body></html>'
    );
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const mockUrl = `http://127.0.0.1:${port}/`;

  const child = spawn(electronPath, ['.'], {
    cwd: root,
    env: {
      ...process.env,
      DESKTOP_APP_URL: mockUrl,
      ELECTRON_ENABLE_LOGGING: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stderr = '';
  child.stderr.on('data', (c) => {
    stderr += String(c);
    if (stderr.length > 4000) stderr = stderr.slice(-4000);
  });

  await new Promise((r) => setTimeout(r, 4000));
  const running = child.exitCode === null;
  if (running) {
    child.kill('SIGTERM');
    await new Promise((r) => setTimeout(r, 1000));
    if (child.exitCode === null) child.kill('SIGKILL');
  }
  server.close();

  assert(running, `Electron exited early: ${stderr.slice(-500)}`);
  results.push(`Electron launched against mock ${mockUrl}`);

  // 3) Missing URL launch (setup page) — brief
  const child2 = spawn(electronPath, ['.'], {
    cwd: root,
    env: {
      ...process.env,
      DESKTOP_APP_URL: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise((r) => setTimeout(r, 3500));
  const running2 = child2.exitCode === null;
  if (running2) {
    child2.kill('SIGTERM');
    await new Promise((r) => setTimeout(r, 1000));
    if (child2.exitCode === null) child2.kill('SIGKILL');
  }
  assert(running2, 'Electron with missing URL should stay open on setup page');
  results.push('Electron setup page launch OK');

  console.log(
    JSON.stringify(
      {
        ok: true,
        results,
      },
      null,
      2
    )
  );
}

run().catch((err) => {
  console.error(String(err && err.stack ? err.stack : err).slice(0, 800));
  process.exit(1);
});
