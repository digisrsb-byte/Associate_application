import { describe, expect, it } from 'vitest';
import fs from 'fs';
import {
  createImportSession,
  deleteImportSession,
  getImportSession,
  markSessionCommitted,
  withOrgImportLock,
} from '../../src/import/importSessionStore.ts';

describe('importSessionStore', () => {
  it('creates temp file, binds owner, and cleans up on delete', () => {
    const buf = Buffer.from('PK\u0003\u0004synthetic');
    const session = createImportSession({
      ownerKey: 'owner-a',
      orgKey: 'org-1',
      domain: 'it',
      filename: 'synth.xlsx',
      buffer: buf,
    });
    expect(fs.existsSync(session.tempPath)).toBe(true);
    expect(getImportSession(session.id, 'owner-b')).toBeNull();
    expect(getImportSession(session.id, 'owner-a')?.id).toBe(session.id);
    expect(deleteImportSession(session.id, 'owner-a')).toBe(true);
    expect(fs.existsSync(session.tempPath)).toBe(false);
  });

  it('removes temp file on commit mark', () => {
    const buf = Buffer.from('PK\u0003\u0004synthetic2');
    const session = createImportSession({
      ownerKey: 'owner-a',
      orgKey: 'org-1',
      domain: 'gst',
      filename: 'synth.xlsx',
      buffer: buf,
    });
    const path = session.tempPath;
    markSessionCommitted(session.id);
    expect(fs.existsSync(path)).toBe(false);
    expect(getImportSession(session.id, 'owner-a')).toBeNull();
  });

  it('serializes org import lock', async () => {
    const order: number[] = [];
    await Promise.all([
      withOrgImportLock('lock-org', async () => {
        order.push(1);
        await new Promise((r) => setTimeout(r, 30));
        order.push(2);
      }),
      withOrgImportLock('lock-org', async () => {
        order.push(3);
        order.push(4);
      }),
    ]);
    expect(order).toEqual([1, 2, 3, 4]);
  });
});
