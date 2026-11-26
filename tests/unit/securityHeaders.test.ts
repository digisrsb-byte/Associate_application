import { afterEach, describe, expect, it } from 'vitest';
import express from 'express';
import type { Server } from 'http';
import {
  buildContentSecurityPolicy,
  createSecurityHeadersMiddleware,
  shouldSendHsts,
  VITE_REACT_REFRESH_PREAMBLE_SHA256,
} from '../../securityHeaders.ts';

function listen(app: express.Express): Promise<{ server: Server; base: string }> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        reject(new Error('No listen address'));
        return;
      }
      resolve({ server, base: `http://127.0.0.1:${addr.port}` });
    });
    server.on('error', reject);
  });
}

describe('security headers (M1)', () => {
  let server: Server | null = null;

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server!.close((err) => (err ? reject(err) : resolve()));
      });
      server = null;
    }
  });

  it('builds production CSP without script unsafe-inline/unsafe-eval; includes Fonts + style unsafe-inline', () => {
    const csp = buildContentSecurityPolicy({ allowViteWebSockets: false });
    expect(csp).toContain("default-src 'self'");
    expect(csp).toMatch(/script-src 'self'(;|$)/);
    expect(csp).not.toContain(VITE_REACT_REFRESH_PREAMBLE_SHA256);
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-eval'/);
    expect(csp).toContain("style-src 'self' 'unsafe-inline' https://fonts.googleapis.com");
    expect(csp).toContain('https://fonts.gstatic.com');
    expect(csp).toContain("img-src 'self' data:");
    expect(csp).toContain("connect-src 'self'");
    expect(csp).not.toContain('ws:');
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("form-action 'self'");
  });

  it('non-production CSP allows Vite HMR websockets and React Refresh preamble hash only', () => {
    const dev = buildContentSecurityPolicy({ allowViteWebSockets: true });
    expect(dev).toContain("connect-src 'self' ws: wss:");
    expect(dev).toContain(
      `script-src 'self' ${VITE_REACT_REFRESH_PREAMBLE_SHA256}`
    );
    expect(VITE_REACT_REFRESH_PREAMBLE_SHA256).toBe(
      "'sha256-Z2/iFzh9VMlVkEOar1f/oSHWwQk3ve1qk/C2WdsC4Xk='"
    );
    expect(dev).not.toMatch(/script-src[^;]*'unsafe-inline'/);
    expect(dev).not.toMatch(/script-src[^;]*'unsafe-eval'/);

    const prod = buildContentSecurityPolicy({ allowViteWebSockets: false });
    expect(prod).toMatch(/script-src 'self'(;|$)/);
    expect(prod).not.toContain(VITE_REACT_REFRESH_PREAMBLE_SHA256);
    expect(prod).not.toContain('ws:');
  });

  it('never sends HSTS for local HTTP, E2E, or non-production', () => {
    expect(
      shouldSendHsts(
        {
          nodeEnv: 'development',
          e2eIsolation: false,
          cookieSecureMode: 'auto',
          trustProxy: false,
          host: '127.0.0.1',
        },
        false
      )
    ).toBe(false);

    expect(
      shouldSendHsts(
        {
          nodeEnv: 'production',
          e2eIsolation: true,
          cookieSecureMode: 'true',
          trustProxy: true,
          host: 'example.com',
        },
        true
      )
    ).toBe(false);

    expect(
      shouldSendHsts(
        {
          nodeEnv: 'production',
          e2eIsolation: false,
          cookieSecureMode: 'false',
          trustProxy: false,
          host: 'example.com',
        },
        true
      )
    ).toBe(false);

    expect(
      shouldSendHsts(
        {
          nodeEnv: 'production',
          e2eIsolation: false,
          cookieSecureMode: 'auto',
          trustProxy: false,
          host: '127.0.0.1',
        },
        false
      )
    ).toBe(false);
  });

  it('sends HSTS for production HTTPS (COOKIE_SECURE=true or trust-proxy + req.secure)', () => {
    expect(
      shouldSendHsts(
        {
          nodeEnv: 'production',
          e2eIsolation: false,
          cookieSecureMode: 'true',
          trustProxy: false,
          host: 'app.example.com',
        },
        false
      )
    ).toBe(true);

    expect(
      shouldSendHsts(
        {
          nodeEnv: 'production',
          e2eIsolation: false,
          cookieSecureMode: 'auto',
          trustProxy: true,
          host: 'app.example.com',
        },
        true
      )
    ).toBe(true);

    // auto + no proven HTTPS → no HSTS
    expect(
      shouldSendHsts(
        {
          nodeEnv: 'production',
          e2eIsolation: false,
          cookieSecureMode: 'auto',
          trustProxy: false,
          host: 'app.example.com',
        },
        false
      )
    ).toBe(false);
  });

  it('sets baseline headers on GET /api/health and GET / without HSTS on local HTTP', async () => {
    const app = express();
    app.use(
      createSecurityHeadersMiddleware({
        nodeEnv: 'development',
        e2eIsolation: false,
        cookieSecureMode: 'auto',
        trustProxy: false,
        host: '127.0.0.1',
      })
    );
    app.get('/api/health', (_req, res) => {
      res.json({ status: 'ok' });
    });
    app.get('/', (_req, res) => {
      res.status(200).type('html').send('<!doctype html><title>ok</title>');
    });

    const listened = await listen(app);
    server = listened.server;

    for (const path of ['/api/health', '/']) {
      const res = await fetch(`${listened.base}${path}`);
      expect(res.ok).toBe(true);
      expect(res.headers.get('x-content-type-options')).toBe('nosniff');
      expect(res.headers.get('x-frame-options')).toBe('DENY');
      expect(res.headers.get('referrer-policy')).toBe(
        'strict-origin-when-cross-origin'
      );
      expect(res.headers.get('permissions-policy')).toBe(
        'camera=(), microphone=(), geolocation=()'
      );
      const csp = res.headers.get('content-security-policy') || '';
      expect(csp).toContain("script-src 'self'");
      expect(csp).toContain('fonts.googleapis.com');
      expect(csp).toContain('ws:');
      expect(res.headers.get('strict-transport-security')).toBeNull();
    }
  });

  it('sets HSTS on responses when production HTTPS config is active', async () => {
    const app = express();
    app.use(
      createSecurityHeadersMiddleware({
        nodeEnv: 'production',
        e2eIsolation: false,
        cookieSecureMode: 'true',
        trustProxy: false,
        host: 'app.example.com',
      })
    );
    app.get('/api/health', (_req, res) => {
      res.json({ status: 'ok' });
    });
    app.get('/', (_req, res) => {
      res.status(200).type('html').send('<!doctype html><title>ok</title>');
    });

    const listened = await listen(app);
    server = listened.server;

    for (const path of ['/api/health', '/']) {
      const res = await fetch(`${listened.base}${path}`);
      expect(res.ok).toBe(true);
      expect(res.headers.get('strict-transport-security')).toBe(
        'max-age=31536000'
      );
      // No includeSubDomains unless architecture confirms all subdomains HTTPS
      expect(res.headers.get('strict-transport-security')).not.toMatch(
        /includeSubDomains/i
      );
      const csp = res.headers.get('content-security-policy') || '';
      expect(csp).toContain("connect-src 'self'");
      expect(csp).not.toContain('ws:');
    }
  });
});
