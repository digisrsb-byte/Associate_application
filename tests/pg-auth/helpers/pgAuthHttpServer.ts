/**
 * Spawn an API-only server process with AUTH_BACKEND=postgres
 * pointed exclusively at the validated it_gst_management_test URL.
 * Never logs connection strings or passwords.
 */
import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const appRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..'
);

export type PgAuthHttpServerHandle = {
  baseUrl: string;
  dataDir: string;
  stop: () => Promise<void>;
};

export async function startPgAuthHttpServer(options: {
  /** Already validated PG_AUTH_TEST_DATABASE_URL (test DB only). */
  testDatabaseUrl: string;
  organizationId: string;
  dataDir: string;
  port: number;
  /** Default json — set postgres only for Phase 4B business-data HTTP tests. */
  businessDataBackend?: 'json' | 'postgres';
}): Promise<PgAuthHttpServerHandle> {
  const baseUrl = `http://127.0.0.1:${options.port}`;

  const child = spawn(
    process.execPath,
    // tsx CLI via node_modules
    [path.join(appRoot, 'node_modules/tsx/dist/cli.mjs'), 'server.ts'],
    {
      cwd: appRoot,
      env: {
        ...process.env,
        AUTH_BACKEND: 'postgres',
        // Server requires DATABASE_URL; value is ONLY the validated test URL (never ambient dev URL).
        DATABASE_URL: options.testDatabaseUrl,
        AUTH_ORGANIZATION_ID: options.organizationId,
        // Phase 4B: optional business-data backend (default json unless explicitly postgres).
        BUSINESS_DATA_BACKEND: options.businessDataBackend || 'json',
        PG_AUTH_HTTP_TEST: '1',
        DATA_DIR: options.dataDir,
        HOST: '127.0.0.1',
        PORT: String(options.port),
        COOKIE_SECURE: 'false',
        E2E_ISOLATION: '',
        NODE_ENV: 'development',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  ) as ChildProcessWithoutNullStreams;

  let stderrBuf = '';
  child.stderr.on('data', (chunk) => {
    stderrBuf += String(chunk);
    if (stderrBuf.length > 4000) stderrBuf = stderrBuf.slice(-4000);
  });

  const stop = async () => {
    if (child.killed) return;
    child.kill('SIGTERM');
    await new Promise<void>((resolve) => {
      const t = setTimeout(() => {
        try {
          child.kill('SIGKILL');
        } catch {
          /* ignore */
        }
        resolve();
      }, 5000);
      child.on('exit', () => {
        clearTimeout(t);
        resolve();
      });
    });
  };

  const deadline = Date.now() + 30_000;
  let lastErr = '';
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(
        `PG auth HTTP server exited early (code=${child.exitCode}). ${stderrBuf.slice(-500)}`
      );
    }
    try {
      const res = await fetch(`${baseUrl}/api/health`);
      if (res.ok) {
        return { baseUrl, dataDir: options.dataDir, stop };
      }
      lastErr = `health status ${res.status}`;
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err);
    }
    await new Promise((r) => setTimeout(r, 250));
  }

  await stop();
  throw new Error(
    `Timed out waiting for PG auth HTTP server. last=${lastErr}`
  );
}

export function extractTlSessionCookie(res: Response): string | null {
  const headers =
    typeof res.headers.getSetCookie === 'function'
      ? res.headers.getSetCookie()
      : [];
  for (const line of headers) {
    const m = /^tl_session=([^;]+)/i.exec(line);
    if (m) return `tl_session=${m[1]}`;
  }
  const single = res.headers.get('set-cookie');
  if (single) {
    const m = /^tl_session=([^;]+)/i.exec(single);
    if (m) return `tl_session=${m[1]}`;
  }
  return null;
}

export function readResetTokenFromFile(filePath: string): string {
  const raw = fs.readFileSync(filePath, 'utf8');
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  // Token is the last non-empty line after the header block.
  const token = lines[lines.length - 1];
  if (!token || token.startsWith('ASSOCIATE') || token.startsWith('Single-use')) {
    throw new Error('Reset token file did not contain a usable token line.');
  }
  return token;
}
