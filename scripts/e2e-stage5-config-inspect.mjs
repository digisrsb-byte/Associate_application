/**
 * Stage 5F — configuration / deployment security inspection (no secrets printed).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const findings = [];

function note(name, ok, detail = '') {
  findings.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}${detail ? `: ${detail}` : ''}`);
}

const example = fs.readFileSync(path.join(ROOT, '.env.example'), 'utf8');
note(
  '.env.example documents HOST loopback default',
  /HOST=127\.0\.0\.1/.test(example)
);
note(
  '.env.example documents COOKIE_SECURE',
  /COOKIE_SECURE/.test(example)
);
note(
  '.env.example documents TRUST_PROXY caution',
  /TRUST_PROXY/.test(example)
);
note(
  '.env.example documents PORTAL_PASSWORD_ENCRYPTION_KEY without a real value',
  /PORTAL_PASSWORD_ENCRYPTION_KEY=\s*$/m.test(example) ||
    /PORTAL_PASSWORD_ENCRYPTION_KEY=\n/.test(example)
);
note(
  '.env.example documents DATA_DIR / E2E_ISOLATION',
  /DATA_DIR/.test(example) && /E2E_ISOLATION/.test(example)
);

const server = fs.readFileSync(path.join(ROOT, 'server.ts'), 'utf8');
note(
  'server defaults HOST to 127.0.0.1',
  /HOST \|\| '127\.0\.0\.1'/.test(server)
);
note(
  'server uses HttpOnly session cookie builder',
  /HttpOnly/.test(server) && /SameSite=Lax/.test(server)
);
note(
  'login rate limit uses dual IP + account keys',
  /login-ip:/.test(server) &&
    /login-account:/.test(server) &&
    /Too many login attempts/.test(server),
  'Stage 7B — failed attempts only; temporary window'
);
note(
  'requestClientIp honours XFF only when TRUST_PROXY',
  /function requestClientIp/.test(server) &&
    /if \(TRUST_PROXY\)/.test(server) &&
    /x-forwarded-for/.test(server)
);
note(
  'backups retain max 10 artifacts',
  /files\.slice\(10\)/.test(server)
);
note(
  'backupLedgerFile encrypts with AES-GCM (no plaintext copyFileSync to backups)',
  /encryptLedgerBackup/.test(server) &&
    /BACKUP_FILE_SUFFIX/.test(server) &&
    !/copyFileSync\(DATA_FILE,\s*dest\)/.test(server)
);
note(
  'backup key separate from portal key',
  /BACKUP_ENCRYPTION_KEY/.test(server) ||
    fs.existsSync(path.join(ROOT, 'backupCrypto.ts'))
);

const gitignore = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8');
note('.gitignore covers .env*', /\.env\*/.test(gitignore));
note('.gitignore covers data-e2e/', /data-e2e\//.test(gitignore));

const envPath = path.join(ROOT, '.env');
if (fs.existsSync(envPath)) {
  const envText = fs.readFileSync(envPath, 'utf8');
  note(
    '.env exists locally (keys not printed)',
    true,
    `lines=${envText.split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith('#')).length}`
  );
  note(
    '.env must not be committed (.gitignore)',
    gitignore.includes('.env'),
    'verify with git check-ignore in CI if needed'
  );
} else {
  note('.env absent in this workspace', true, 'ok for clean checkout');
}

const failed = findings.some((f) => !f.ok);
fs.writeFileSync(
  path.join(ROOT, 'STAGE5_CONFIG_INSPECT.json'),
  JSON.stringify({ ok: !failed, findings }, null, 2)
);
process.exit(failed ? 1 : 0);
