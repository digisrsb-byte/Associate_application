import { describe, expect, it, vi, afterEach } from 'vitest';
import { apiFetch, revealPortalPassword } from '../../src/utils/api.ts';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('apiFetch', () => {
  it('sets JSON content-type and credentials when body is present', async () => {
    const fetchMock = vi.fn(async () => new Response('ok'));
    vi.stubGlobal('fetch', fetchMock);

    await apiFetch('/api/x', { method: 'POST', body: '{"a":1}' });

    expect(fetchMock).toHaveBeenCalledOnce();
    const args = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(args[1].credentials).toBe('include');
    const headers = new Headers(args[1].headers);
    expect(headers.get('Content-Type')).toBe('application/json');
  });

  it('does not override Content-Type for FormData', async () => {
    const fetchMock = vi.fn(async () => new Response('ok'));
    vi.stubGlobal('fetch', fetchMock);
    const fd = new FormData();
    fd.append('f', '1');
    await apiFetch('/api/upload', { method: 'POST', body: fd });
    const args = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const headers = new Headers(args[1].headers);
    expect(headers.has('Content-Type')).toBe(false);
  });
});

describe('revealPortalPassword', () => {
  it('returns password for IT and GST paths', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ password: 'it-secret' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ password: 'gst-secret' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );
    vi.stubGlobal('fetch', fetchMock);

    await expect(revealPortalPassword('it', 'c1')).resolves.toBe('it-secret');
    await expect(revealPortalPassword('gst', 'g1')).resolves.toBe('gst-secret');

    expect(String(fetchMock.mock.calls[0][0])).toContain(
      '/api/clients/c1/reveal-portal-password'
    );
    expect(String(fetchMock.mock.calls[1][0])).toContain(
      '/api/gst/clients/g1/reveal-portal-password'
    );
  });

  it('throws when reveal fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ error: 'denied' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    );
    await expect(revealPortalPassword('it', 'x')).rejects.toThrow(/denied/);
  });
});
