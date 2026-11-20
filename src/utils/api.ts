/** Same-origin API helper — always sends session cookie. */
export async function apiFetch(
  input: string,
  init: RequestInit = {}
): Promise<Response> {
  const headers = new Headers(init.headers || {});
  if (
    init.body !== undefined &&
    !(init.body instanceof FormData) &&
    !headers.has('Content-Type')
  ) {
    headers.set('Content-Type', 'application/json');
  }
  return fetch(input, {
    ...init,
    headers,
    credentials: 'include',
  });
}

/** Session-authenticated reveal — passwords are never in ordinary ledger JSON. */
export async function revealPortalPassword(
  kind: 'it' | 'gst',
  id: string
): Promise<string> {
  const path =
    kind === 'it'
      ? `/api/clients/${encodeURIComponent(id)}/reveal-portal-password`
      : `/api/gst/clients/${encodeURIComponent(id)}/reveal-portal-password`;
  const res = await apiFetch(path, { method: 'POST', body: '{}' });
  const data = (await res.json().catch(() => ({}))) as {
    error?: string;
    password?: string;
  };
  if (!res.ok || !data.password) {
    throw new Error(data.error || 'Unable to reveal portal password.');
  }
  return data.password;
}
