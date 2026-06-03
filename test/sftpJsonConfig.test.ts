import { describe, expect, it } from 'vitest';
import { parseSftpJsonConfig } from '../src/sftpJsonConfig';
import { normalizeProfile } from '../src/profiles';

describe('parseSftpJsonConfig', () => {
  it('parses a single profile', () => {
    const raw = {
      name: 'site',
      protocol: 'ftp',
      host: 'ftp.example.com',
      username: 'deploy',
      remotePath: '/public',
    };
    const entries = parseSftpJsonConfig(raw);
    expect(entries).toHaveLength(1);
    const profile = normalizeProfile(entries[0]);
    expect(profile?.name).toBe('site');
    expect(profile?.protocol).toBe('ftp');
  });

  it('expands nested profiles', () => {
    const raw = {
      name: 'root',
      protocol: 'sftp',
      host: 'main.example.com',
      username: 'u',
      profiles: {
        staging: { host: 'staging.example.com' },
      },
    };
    const entries = parseSftpJsonConfig(raw);
    expect(entries).toHaveLength(2);
    expect(entries.map((e) => e.name)).toEqual(['root', 'root/staging']);
  });

  it('parses an array of profile configs', () => {
    const entries = parseSftpJsonConfig([
      { name: 'a', protocol: 'sftp', host: 'h1', username: 'u' },
      { name: 'b', protocol: 'ftp', host: 'h2', username: 'u' },
    ]);
    expect(entries).toHaveLength(2);
  });

  it('maps context to localPath and trust from secureOptions', () => {
    const raw = {
      name: 'ctx',
      protocol: 'ftp',
      host: 'h',
      username: 'u',
      context: 'apps/web',
      secureOptions: { rejectUnauthorized: false },
    };
    const entry = parseSftpJsonConfig(raw)[0];
    expect(entry.localPath).toBe('${workspaceFolder}/apps/web');
    const profile = normalizeProfile(entry);
    expect(profile?.trustServerCertificate).toBe(true);
  });
});
