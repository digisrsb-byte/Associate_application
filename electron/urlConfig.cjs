/**
 * Resolve and validate the desktop application URL.
 * Packaged production: HTTPS only; never silently use localhost.
 * Unpackaged/dev: may allow http://127.0.0.1 (or localhost) for local verification.
 */
const fs = require('fs');
const path = require('path');

function isLoopbackHost(hostname) {
  const h = String(hostname || '').toLowerCase();
  return (
    h === 'localhost' ||
    h === '127.0.0.1' ||
    h === '::1' ||
    h === '[::1]'
  );
}

function readConfigFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!raw || typeof raw !== 'object') return null;
    const appUrl = String(raw.appUrl || raw.url || '').trim();
    return appUrl || null;
  } catch {
    return null;
  }
}

/**
 * @param {{
 *   packaged: boolean,
 *   env?: NodeJS.ProcessEnv,
 *   userDataPath: string,
 *   resourcesPath?: string,
 *   exeDir?: string,
 * }} opts
 */
function resolveDesktopAppUrl(opts) {
  const env = opts.env || process.env;
  const sources = [];

  const fromEnv = String(env.DESKTOP_APP_URL || '').trim();
  if (fromEnv) sources.push({ source: 'env:DESKTOP_APP_URL', value: fromEnv });

  const userCfg = path.join(opts.userDataPath, 'desktop-config.json');
  const fromUser = readConfigFile(userCfg);
  if (fromUser) sources.push({ source: `file:${userCfg}`, value: fromUser });

  if (opts.exeDir) {
    const beside = path.join(opts.exeDir, 'desktop-config.json');
    const fromBeside = readConfigFile(beside);
    if (fromBeside) {
      sources.push({ source: `file:${beside}`, value: fromBeside });
    }
  }

  if (!opts.packaged) {
    const projectExample = path.join(
      __dirname,
      '..',
      'desktop-config.example.json'
    );
    // Never auto-load example as live URL — documentation only.
    void projectExample;
  }

  if (sources.length === 0) {
    return {
      ok: false,
      reason: 'missing',
      message:
        'No application URL configured. Set DESKTOP_APP_URL or create desktop-config.json with an HTTPS appUrl after cloud hosting is ready.',
      configPaths: {
        userData: userCfg,
        besideExecutable: opts.exeDir
          ? path.join(opts.exeDir, 'desktop-config.json')
          : null,
      },
    };
  }

  const chosen = sources[0];
  let parsed;
  try {
    parsed = new URL(chosen.value);
  } catch {
    return {
      ok: false,
      reason: 'invalid',
      message: 'Application URL is not a valid URL.',
      attempted: chosen.source,
    };
  }

  if (opts.packaged) {
    if (parsed.protocol !== 'https:') {
      return {
        ok: false,
        reason: 'https_required',
        message:
          'Packaged desktop builds require an HTTPS application URL. HTTP and localhost are not allowed.',
        attempted: chosen.source,
      };
    }
    if (isLoopbackHost(parsed.hostname)) {
      return {
        ok: false,
        reason: 'localhost_forbidden',
        message:
          'Packaged desktop builds must not connect to localhost. Configure the hosted HTTPS URL.',
        attempted: chosen.source,
      };
    }
  } else {
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return {
        ok: false,
        reason: 'invalid_protocol',
        message: 'Application URL must use http: (local dev only) or https:.',
        attempted: chosen.source,
      };
    }
    if (parsed.protocol === 'http:' && !isLoopbackHost(parsed.hostname)) {
      return {
        ok: false,
        reason: 'http_remote_forbidden',
        message:
          'Non-loopback HTTP URLs are not allowed. Use HTTPS for remote hosts, or http://127.0.0.1 for local verification.',
        attempted: chosen.source,
      };
    }
  }

  // Normalize: origin + pathname (no hash); keep trailing path for subpath hosting.
  const normalized = `${parsed.origin}${parsed.pathname === '/' ? '/' : parsed.pathname.replace(/\/$/, '') || ''}${parsed.search || ''}`;

  return {
    ok: true,
    url: normalized.endsWith('/') && parsed.pathname === '/'
      ? parsed.origin + '/'
      : normalized || parsed.origin,
    origin: parsed.origin,
    source: chosen.source,
  };
}

function isAllowedNavigation(targetUrl, appOrigin) {
  try {
    const u = new URL(targetUrl);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    return u.origin === appOrigin;
  } catch {
    return false;
  }
}

module.exports = {
  resolveDesktopAppUrl,
  isAllowedNavigation,
  isLoopbackHost,
};
