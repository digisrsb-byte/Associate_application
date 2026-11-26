import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  resolveDesktopAppUrl,
  isAllowedNavigation,
} = require('../../electron/urlConfig.cjs') as {
  resolveDesktopAppUrl: (opts: Record<string, unknown>) => {
    ok: boolean;
    reason?: string;
    origin?: string;
    message?: string;
  };
  isAllowedNavigation: (url: string, origin: string) => boolean;
};

describe('desktop urlConfig', () => {
  it('rejects missing URL in packaged mode', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'assoc-desk-'));
    const r = resolveDesktopAppUrl({
      packaged: true,
      env: {},
      userDataPath: dir,
      exeDir: dir,
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('missing');
  });

  it('rejects http and localhost in packaged mode', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'assoc-desk-'));
    const http = resolveDesktopAppUrl({
      packaged: true,
      env: { DESKTOP_APP_URL: 'http://example.com' },
      userDataPath: dir,
    });
    expect(http.ok).toBe(false);
    expect(http.reason).toBe('https_required');

    const local = resolveDesktopAppUrl({
      packaged: true,
      env: { DESKTOP_APP_URL: 'https://127.0.0.1/app' },
      userDataPath: dir,
    });
    expect(local.ok).toBe(false);
    expect(local.reason).toBe('localhost_forbidden');
  });

  it('accepts https hosted URL in packaged mode', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'assoc-desk-'));
    const r = resolveDesktopAppUrl({
      packaged: true,
      env: { DESKTOP_APP_URL: 'https://associate.example.com/' },
      userDataPath: dir,
    });
    expect(r.ok).toBe(true);
    expect(r.origin).toBe('https://associate.example.com');
  });

  it('allows loopback http in unpackaged/dev mode', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'assoc-desk-'));
    const r = resolveDesktopAppUrl({
      packaged: false,
      env: { DESKTOP_APP_URL: 'http://127.0.0.1:3000' },
      userDataPath: dir,
    });
    expect(r.ok).toBe(true);
  });

  it('rejects non-loopback http in unpackaged mode', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'assoc-desk-'));
    const r = resolveDesktopAppUrl({
      packaged: false,
      env: { DESKTOP_APP_URL: 'http://example.com' },
      userDataPath: dir,
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('http_remote_forbidden');
  });

  it('reads desktop-config.json from userData', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'assoc-desk-'));
    fs.writeFileSync(
      path.join(dir, 'desktop-config.json'),
      JSON.stringify({ appUrl: 'https://hosted.example.org' }),
      'utf8'
    );
    const r = resolveDesktopAppUrl({
      packaged: true,
      env: {},
      userDataPath: dir,
    });
    expect(r.ok).toBe(true);
    expect(r.origin).toBe('https://hosted.example.org');
  });

  it('isAllowedNavigation restricts to app origin', () => {
    expect(
      isAllowedNavigation(
        'https://hosted.example.org/login',
        'https://hosted.example.org'
      )
    ).toBe(true);
    expect(
      isAllowedNavigation(
        'https://evil.example/phish',
        'https://hosted.example.org'
      )
    ).toBe(false);
  });
});
