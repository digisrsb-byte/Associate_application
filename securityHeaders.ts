import type { NextFunction, Request, Response } from 'express';

export type SecurityHeadersConfig = {
  nodeEnv: string;
  e2eIsolation: boolean;
  cookieSecureMode: string;
  trustProxy: boolean;
  host: string;
};

function isLoopbackHost(host: string): boolean {
  const h = host.toLowerCase();
  return h === '127.0.0.1' || h === 'localhost' || h === '::1';
}

/**
 * Vite @vitejs/plugin-react Refresh preamble (inline module) — non-production only.
 * Hash from browser CSP violation when preamble was blocked under script-src 'self'.
 */
export const VITE_REACT_REFRESH_PREAMBLE_SHA256 =
  "'sha256-Z2/iFzh9VMlVkEOar1f/oSHWwQk3ve1qk/C2WdsC4Xk='";

/**
 * Production CSP: same-origin scripts/API; Google Fonts; React inline styles;
 * no script unsafe-inline / unsafe-eval.
 * Non-production: also allows Vite React Refresh preamble hash + HMR websockets.
 */
export function buildContentSecurityPolicy(options: {
  allowViteWebSockets: boolean;
}): string {
  const connectSrc = options.allowViteWebSockets
    ? "'self' ws: wss:"
    : "'self'";
  const scriptSrc = options.allowViteWebSockets
    ? `script-src 'self' ${VITE_REACT_REFRESH_PREAMBLE_SHA256}`
    : "script-src 'self'";
  return [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data:",
    `connect-src ${connectSrc}`,
    "object-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
}

/**
 * HSTS only when production + not E2E + not loopback HTTP + proven HTTPS.
 * Does not use includeSubDomains (subdomain HTTPS not confirmed).
 */
export function shouldSendHsts(
  config: SecurityHeadersConfig,
  reqSecure: boolean
): boolean {
  if (config.e2eIsolation) return false;
  if (config.nodeEnv !== 'production') return false;
  if (config.cookieSecureMode === 'false') return false;
  if (isLoopbackHost(config.host)) return false;

  if (config.cookieSecureMode === 'true') return true;
  if (config.trustProxy && reqSecure) return true;
  // auto / unknown: only if the request is already marked secure
  return reqSecure;
}

export function createSecurityHeadersMiddleware(config: SecurityHeadersConfig) {
  const allowViteWebSockets = config.nodeEnv !== 'production';
  const csp = buildContentSecurityPolicy({ allowViteWebSockets });

  return function securityHeadersMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
  ): void {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=()'
    );
    res.setHeader('Content-Security-Policy', csp);

    if (shouldSendHsts(config, Boolean(req.secure))) {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000');
    }

    next();
  };
}
