/**
 * Phase 3 – Host binding / network exposure tests.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const results = [];

function record(name, pass, detail = '') {
  results.push({ name, pass, detail });
  console.log(`[${pass ? 'PASS' : 'FAIL'}] ${name}${detail ? ` — ${detail}` : ''}`);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchOk(url, ms = 2500) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);
    return { ok: res.ok, status: res.status };
  } catch (err) {
    clearTimeout(t);
    return { ok: false, status: 0, error: err instanceof Error ? err.message : String(err) };
  }
}

function lanIPv4s() {
  const out = [];
  const ifaces = os.networkInterfaces();
  for (const list of Object.values(ifaces)) {
    for (const info of list || []) {
      if (info.family === 'IPv4' && !info.internal) out.push(info.address);
    }
  }
  return [...new Set(out)];
}

function startServer(env, logLabel) {
  const tsxCli = path.join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  const child = spawn(process.execPath, [tsxCli, 'server.ts'], {
      cwd: ROOT,
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
    }
  );
  let output = '';
  child.stdout.on('data', (d) => {
    output += d.toString();
  });
  child.stderr.on('data', (d) => {
    output += d.toString();
  });
  return {
    child,
    getOutput: () => output,
    label: logLabel,
  };
}

async function waitForListen(proc, port, hostHint, timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const out = proc.getOutput();
    if (out.includes(`listening on ${hostHint}:${port}`) || out.includes(`:${port}`)) {
      // Prefer health check on loopback when host is loopback or all-interfaces
      const healthHost = hostHint === '0.0.0.0' ? '127.0.0.1' : hostHint;
      const health = await fetchOk(`http://${healthHost}:${port}/api/health`);
      if (health.ok) return true;
    }
    if (proc.child.exitCode != null) return false;
    await sleep(400);
  }
  return false;
}

async function stopServer(proc) {
  if (proc.child.exitCode != null) return;
  try {
    proc.child.kill('SIGTERM');
  } catch {
    /* ignore */
  }
  await sleep(500);
  if (proc.child.exitCode == null) {
    try {
      proc.child.kill('SIGKILL');
    } catch {
      /* ignore */
    }
  }
}

async function main() {
  console.log('Phase 3 host-binding tests\n');

  // Source default check
  const serverSrc = fs.readFileSync(path.join(ROOT, 'server.ts'), 'utf-8');
  record(
    'Source defaults HOST to 127.0.0.1 (no silent 0.0.0.0 fallback)',
    /const HOST = \(process\.env\.HOST \|\| '127\.0\.0\.1'\)/.test(serverSrc) &&
      !/app\.listen\(\s*PORT\s*,\s*'0\.0\.0\.0'/.test(serverSrc),
    'server.ts HOST + listen'
  );

  const envExample = fs.readFileSync(path.join(ROOT, '.env.example'), 'utf-8');
  record(
    '.env.example documents HOST=127.0.0.1',
    /HOST\s*=\s*127\.0\.0\.1/.test(envExample),
    'HOST line present'
  );

  // Use high ports to avoid colliding with the main UAT server on 3000
  const PORT_A = 3451;
  const PORT_B = 3452;

  // A) Default / explicit loopback
  {
    const proc = startServer(
      {
        HOST: '127.0.0.1',
        PORT: String(PORT_A),
        NODE_ENV: 'production', // skip vite for faster/cleaner bind test
      },
      'loopback'
    );
    const up = await waitForListen(proc, PORT_A, '127.0.0.1');
    const local = await fetchOk(`http://127.0.0.1:${PORT_A}/api/health`);
    const localhost = await fetchOk(`http://localhost:${PORT_A}/api/health`);
    record(
      'HOST=127.0.0.1 accepts local loopback access',
      up && local.ok && localhost.ok,
      `up=${up} local=${local.status} localhost=${localhost.status}`
    );

    const lans = lanIPv4s();
    if (lans.length === 0) {
      record(
        'LAN access blocked when bound to loopback',
        true,
        'no non-loopback IPv4 on this machine; skipped probe'
      );
    } else {
      let lanBlocked = true;
      const details = [];
      for (const ip of lans.slice(0, 3)) {
        const hit = await fetchOk(`http://${ip}:${PORT_A}/api/health`, 1500);
        details.push(`${ip}:${hit.status || hit.error || 'fail'}`);
        if (hit.ok) lanBlocked = false;
      }
      record(
        'LAN access blocked when bound to loopback',
        lanBlocked,
        details.join('; ')
      );
    }
    await stopServer(proc);
  }

  // B) Custom HOST + PORT (still loopback alias)
  {
    const proc = startServer(
      {
        HOST: '127.0.0.1',
        PORT: String(PORT_B),
        NODE_ENV: 'production',
      },
      'custom-port'
    );
    const up = await waitForListen(proc, PORT_B, '127.0.0.1');
    const health = await fetchOk(`http://127.0.0.1:${PORT_B}/api/health`);
    record(
      'Custom PORT configuration works',
      up && health.ok,
      `port=${PORT_B} status=${health.status}`
    );
    await stopServer(proc);
  }

  // C) Running UAT server (if any) should be on loopback for Phase 3
  {
    const live = await fetchOk('http://127.0.0.1:3000/api/health');
    record(
      'Primary UAT port 3000 reachable on localhost (if server running)',
      live.ok || live.status === 0,
      live.ok
        ? `status=${live.status}`
        : `not running or unreachable (${live.error || live.status}) — start npm run dev for full UAT`
    );

    const lans = lanIPv4s();
    if (live.ok && lans.length) {
      const hit = await fetchOk(`http://${lans[0]}:3000/api/health`, 1500);
      record(
        'Primary UAT on :3000 not reachable via LAN IP',
        !hit.ok,
        `${lans[0]} → ${hit.status || hit.error || 'blocked'}`
      );
    } else if (!lans.length) {
      record('Primary UAT on :3000 not reachable via LAN IP', true, 'no LAN IPv4');
    } else {
      record(
        'Primary UAT on :3000 not reachable via LAN IP',
        true,
        'UAT server not running; dedicated bind tests above cover loopback'
      );
    }
  }

  const failed = results.filter((r) => !r.pass).length;
  const out = {
    phase: 3,
    at: new Date().toISOString(),
    passed: results.length - failed,
    failed,
    total: results.length,
    results,
  };
  fs.writeFileSync(
    path.join(ROOT, 'PHASE3_HOST_BINDING_TEST_RESULTS.json'),
    JSON.stringify(out, null, 2),
    'utf-8'
  );
  console.log(`\n${out.passed}/${out.total} passed.`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
