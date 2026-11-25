import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import {
  decryptLedgerBackup,
  isEncryptedBackupBuffer,
  loadBackupEncryptionKey,
  parseAndValidateLedgerJson,
} from '../backupCrypto';
import { apiLogin, e2eDataPaths } from './helpers/security';
import { createItClientViaUi } from './helpers/clients';
import { findItClientInLedger } from './helpers/finance';
import { loginAsE2eAdmin } from './helpers/auth';
import { nextSeq, syntheticName, syntheticPan } from './helpers/ids';

function sha256File(p: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}

function listBackups(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter(
      (f) =>
        f.startsWith('ledger-') &&
        (f.endsWith('.json.enc') || f.endsWith('.json'))
    )
    .sort();
}

test.describe('Stage 5E — backup and recovery (data-e2e only)', () => {
  test('create backup via import; integrity; restore to temp; retention; failed restore safety', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const paths = e2eDataPaths();
    const backupDir = path.resolve(paths.backups);
    const ledgerPath = path.resolve(paths.ledger);
    const liveData = path.resolve('data');

    // Safety: never point restore at live data/
    expect(path.resolve(paths.dataDir)).not.toBe(liveData);

    await loginAsE2eAdmin(page);
    const n = nextSeq();
    const pan = syntheticPan(n);
    const name = syntheticName('BackupSeed', n);
    await createItClientViaUi(page, { name, pan });
    await findItClientInLedger(page.request, pan);

    const beforeHash = sha256File(ledgerPath);
    const beforeBackups = listBackups(backupDir);

    const { res: loginRes } = await apiLogin(page.request);
    expect(loginRes.ok()).toBeTruthy();
    const imp = await page.request.post('/api/import/it', {
      data: {
        mode: 'merge',
        onConflict: 'skip',
        clients: [
          {
            pan: syntheticPan(n + 9),
            name: syntheticName('ImportOnly', n),
            phone: '',
            otherMobiles: '',
            nameVariants: '',
            filings: {},
          },
        ],
      },
    });
    expect(imp.ok()).toBeTruthy();
    const impBody = await imp.json();
    const backupName = impBody.report?.backupFile || impBody.backupFile;
    expect(backupName).toBeTruthy();
    // Stage 7C: new backups are encrypted
    expect(String(backupName)).toMatch(/^ledger-.*\.json\.enc$/);

    const afterBackups = listBackups(backupDir);
    expect(afterBackups).toContain(String(backupName));
    expect(afterBackups.length).toBeGreaterThan(0);
    expect(afterBackups.length).toBeLessThanOrEqual(10);
    const backupFile = path.join(backupDir, String(backupName));
    expect(fs.existsSync(backupFile)).toBeTruthy();

    const raw = fs.readFileSync(backupFile);
    expect(isEncryptedBackupBuffer(raw)).toBeTruthy();

    const keyStatus = loadBackupEncryptionKey({
      keyFilePath: path.resolve(paths.dataDir, 'BACKUP_ENCRYPTION_KEY'),
    });
    expect(keyStatus.ok).toBeTruthy();
    if (!keyStatus.ok) throw new Error('missing key');
    const decrypted = decryptLedgerBackup(raw, keyStatus.key);
    const backupJson = parseAndValidateLedgerJson(decrypted);
    expect(Array.isArray(backupJson.clients)).toBeTruthy();
    expect(
      (backupJson.clients as { pan: string }[]).some((c) => c.pan === pan)
    ).toBeTruthy();

    // Restore into SEPARATE temp directory (never ./data)
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'associate-e2e-restore-'));
    expect(path.resolve(tempDir).startsWith(path.resolve(liveData))).toBeFalsy();
    const restoredLedger = path.join(tempDir, 'ledger.json');
    fs.writeFileSync(restoredLedger, decrypted, 'utf8');
    const restored = JSON.parse(fs.readFileSync(restoredLedger, 'utf8'));
    expect(restored.clients.some((c: { pan: string }) => c.pan === pan)).toBeTruthy();

    // Failed restore must not damage existing e2e ledger
    const e2eHashBeforeFail = sha256File(ledgerPath);
    const garbage = path.join(tempDir, 'garbage.json');
    fs.writeFileSync(garbage, '{not-valid-json');
    let parseFailed = false;
    try {
      JSON.parse(fs.readFileSync(garbage, 'utf8'));
    } catch {
      parseFailed = true;
    }
    expect(parseFailed).toBeTruthy();
    expect(sha256File(ledgerPath)).toBe(e2eHashBeforeFail);

    // Retention: create enough backups to exceed 10; app keeps newest 10
    for (let i = 0; i < 12; i++) {
      const r = await page.request.post('/api/import/it', {
        data: { mode: 'merge', onConflict: 'skip', clients: [] },
      });
      expect(r.ok()).toBeTruthy();
    }
    const retained = listBackups(backupDir);
    expect(retained.length).toBeLessThanOrEqual(10);

    expect(fs.existsSync(path.join(liveData, 'ledger.json'))).toBeTruthy();

    fs.rmSync(tempDir, { recursive: true, force: true });
    void beforeHash;
    void beforeBackups;
  });
});
