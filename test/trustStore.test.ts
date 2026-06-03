import { describe, expect, it } from 'vitest';
import { clearTlsTrust, isTlsTrusted, setTlsTrusted } from '../src/trustStore';
import { FtpSftpProfile } from '../src/types';

function mockContext() {
  const store = new Map<string, unknown>();
  return {
    globalState: {
      get: <T>(key: string, defaultValue: T): T =>
        (store.has(key) ? store.get(key) : defaultValue) as T,
      update: async (key: string, value: unknown): Promise<void> => {
        store.set(key, value);
      },
    },
  } as unknown as import('vscode').ExtensionContext;
}

const profile: FtpSftpProfile = {
  name: 'ftp-test',
  protocol: 'ftp',
  host: '76.13.158.184',
  username: 'user',
  port: 21,
};

describe('trustStore', () => {
  it('trusts when profile flag is set', async () => {
    const ctx = mockContext();
    expect(await isTlsTrusted(ctx, { ...profile, trustServerCertificate: true })).toBe(true);
  });

  it('stores and clears trust entries', async () => {
    const ctx = mockContext();
    expect(await isTlsTrusted(ctx, profile)).toBe(false);
    await setTlsTrusted(ctx, profile);
    expect(await isTlsTrusted(ctx, profile)).toBe(true);
    await clearTlsTrust(ctx, profile);
    expect(await isTlsTrusted(ctx, profile)).toBe(false);
  });
});
