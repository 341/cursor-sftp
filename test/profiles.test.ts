import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import {
  DEFAULT_IGNORE_PATTERNS,
  defaultPort,
  deleteProfilePassword,
  expandHome,
  getDefaultProfileName,
  getProfilePassword,
  getProfiles,
  getUploadOnSave,
  hasProfilePassword,
  normalizeProfile,
  pickProfile,
  readPrivateKey,
  resolveLocalPath,
  saveProfiles,
  serializeProfile,
  setDefaultProfile,
  setProfilePassword,
  setUploadOnSave,
} from '../src/profiles';
import { FtpSftpProfile } from '../src/types';
import {
  type ExtensionContext,
  resetMockVscode,
  setMockConfig,
  setMockQuickPickResult,
  window,
} from './mocks/vscode';

const sftpJsonProfiles = vi.hoisted(() => [] as Record<string, unknown>[]);

vi.mock('../src/sftpJsonConfig', () => ({
  getRawProfilesFromSftpJson: () => sftpJsonProfiles,
}));

function baseProfile(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: 'dev',
    protocol: 'sftp',
    host: 'host.example.com',
    username: 'alice',
    ...overrides,
  };
}

function requireProfile(raw: Record<string, unknown>): FtpSftpProfile {
  const profile = normalizeProfile(raw);
  if (profile === null) {
    throw new Error('expected a valid profile fixture');
  }
  return profile;
}

function mockExtensionContext(): ExtensionContext {
  const secrets = new Map<string, string>();
  return {
    secrets: {
      store: async (key: string, value: string) => {
        secrets.set(key, value);
      },
      get: async (key: string) => secrets.get(key),
      delete: async (key: string) => {
        secrets.delete(key);
      },
    },
    globalState: {
      get: <T>(_key: string, defaultValue: T) => defaultValue,
      update: async () => undefined,
    },
  };
}

function clearSftpJsonProfiles(): void {
  sftpJsonProfiles.splice(0, sftpJsonProfiles.length);
}

describe('normalizeProfile', () => {
  it('parses a valid SFTP profile with optional fields', () => {
    const profile = normalizeProfile({
      ...baseProfile(),
      port: 2222,
      remotePath: '/var/www',
      localPath: '${workspaceFolder}/app',
      privateKeyPath: '~/.ssh/id_rsa',
      passphrase: 'secret',
      passive: true,
      connectTimeout: 15000,
      password: 'inline',
      trustServerCertificate: true,
      ignore: ['**/.git/**', 42, '**/dist/**'],
    });

    expect(profile).toMatchObject({
      name: 'dev',
      protocol: 'sftp',
      host: 'host.example.com',
      username: 'alice',
      port: 2222,
      remotePath: '/var/www',
      localPath: '${workspaceFolder}/app',
      privateKeyPath: '~/.ssh/id_rsa',
      passphrase: 'secret',
      passive: true,
      connectTimeout: 15000,
      password: 'inline',
      trustServerCertificate: true,
      ignore: ['**/.git/**', '**/dist/**'],
    });
  });

  it('trims whitespace on required string fields', () => {
    const profile = normalizeProfile({
      name: '  dev  ',
      protocol: 'ftp',
      host: '  ftp.local  ',
      username: '  bob  ',
    });

    expect(profile?.name).toBe('dev');
    expect(profile?.host).toBe('ftp.local');
    expect(profile?.username).toBe('bob');
  });

  it.each([
    ['implicit', 'implicit'],
    [false, false],
    ['false', false],
    ['control', 'control'],
    [true, 'control'],
    ['true', 'control'],
    [undefined, true],
  ] as const)('parses FTP secure mode %s as %s', (secure, expected) => {
    const profile = normalizeProfile({
      ...baseProfile({ protocol: 'ftp' }),
      ...(secure !== undefined ? { secure } : {}),
    });
    expect(profile?.secure).toBe(expected);
  });

  it('returns null for invalid or incomplete profiles', () => {
    expect(normalizeProfile({ name: 'x', protocol: 'ftp' })).toBeNull();
    expect(normalizeProfile({ ...baseProfile(), protocol: 'webdav' })).toBeNull();
    expect(normalizeProfile({ ...baseProfile(), name: '' })).toBeNull();
    expect(normalizeProfile({ ...baseProfile(), host: '   ' })).toBeNull();
  });

  it('applies defaults for remotePath and localPath', () => {
    const profile = normalizeProfile(baseProfile());

    expect(profile?.remotePath).toBe('/');
    expect(profile?.localPath).toBe('${workspaceFolder}');
  });
});

describe('serializeProfile', () => {
  it('serializes optional fields and default ignore patterns', () => {
    const profile = requireProfile({
      ...baseProfile(),
      port: 22,
      passphrase: 'p',
      trustServerCertificate: true,
    });
    const serialized = serializeProfile(profile);

    expect(serialized.port).toBe(22);
    expect(serialized.passphrase).toBe('p');
    expect(serialized.trustServerCertificate).toBe(true);
    expect(serialized.ignore).toEqual(DEFAULT_IGNORE_PATTERNS);
  });

  it('omits trustServerCertificate when not enabled', () => {
    const serialized = serializeProfile(requireProfile(baseProfile()));

    expect(serialized.trustServerCertificate).toBeUndefined();
  });

  it('round-trips core fields through normalizeProfile', () => {
    const profile = requireProfile({
      ...baseProfile({ protocol: 'sftp', name: 'prod' }),
      trustServerCertificate: true,
      privateKeyPath: '~/.ssh/id_rsa',
    });
    const again = normalizeProfile(serializeProfile(profile));

    expect(again?.name).toBe('prod');
    expect(again?.trustServerCertificate).toBe(true);
    expect(again?.privateKeyPath).toBe('~/.ssh/id_rsa');
  });
});

describe('getProfiles', () => {
  beforeEach(() => {
    resetMockVscode();
    clearSftpJsonProfiles();
  });

  afterEach(() => {
    resetMockVscode();
    clearSftpJsonProfiles();
  });

  it('loads profiles from user settings', () => {
    setMockConfig('cursorFtpSftp.profiles', [baseProfile({ name: 'from-settings' })]);

    const profiles = getProfiles();

    expect(profiles).toHaveLength(1);
    expect(profiles[0].name).toBe('from-settings');
  });

  it('merges sftp.json profiles and lets settings override by name', () => {
    sftpJsonProfiles.push(
      baseProfile({ name: 'shared', host: 'json-host' }),
      baseProfile({ name: 'json-only', host: 'only-json' }),
    );
    setMockConfig('cursorFtpSftp.profiles', [
      baseProfile({ name: 'shared', host: 'settings-host' }),
      baseProfile({ name: 'settings-only', host: 'only-settings' }),
    ]);

    const profiles = getProfiles();
    const byName = Object.fromEntries(profiles.map((p) => [p.name, p.host]));

    expect(profiles).toHaveLength(3);
    expect(byName.shared).toBe('settings-host');
    expect(byName['json-only']).toBe('only-json');
    expect(byName['settings-only']).toBe('only-settings');
  });

  it('skips invalid entries in settings', () => {
    setMockConfig('cursorFtpSftp.profiles', [
      baseProfile(),
      { name: 'bad', protocol: 'ftp' },
      null,
    ]);

    expect(getProfiles()).toHaveLength(1);
  });
});

describe('configuration helpers', () => {
  beforeEach(() => resetMockVscode());
  afterEach(() => resetMockVscode());

  it('reads and writes default profile and upload on save', async () => {
    await setDefaultProfile('prod');
    await setUploadOnSave(true);

    expect(getDefaultProfileName()).toBe('prod');
    expect(getUploadOnSave()).toBe(true);
  });

  it('saveProfiles persists serialized profiles', async () => {
    await saveProfiles([requireProfile(baseProfile({ name: 'saved' }))]);

    expect(getProfiles()[0].name).toBe('saved');
  });
});

describe('pickProfile', () => {
  beforeEach(() => resetMockVscode());
  afterEach(() => resetMockVscode());

  it('shows error when no profiles exist', async () => {
    const result = await pickProfile();

    expect(result).toBeUndefined();
    expect(window.showErrorMessageCalls).toBe(1);
  });

  it('returns default profile when configured', async () => {
    const profile = requireProfile(baseProfile({ name: 'defaulted' }));
    setMockConfig('cursorFtpSftp.profiles', [serializeProfile(profile)]);
    setMockConfig('cursorFtpSftp.defaultProfile', 'defaulted');

    expect((await pickProfile())?.name).toBe('defaulted');
  });

  it('returns the only profile without prompting', async () => {
    const profile = requireProfile(baseProfile({ name: 'solo' }));
    setMockConfig('cursorFtpSftp.profiles', [serializeProfile(profile)]);

    expect((await pickProfile())?.name).toBe('solo');
  });

  it('uses quick pick when multiple profiles exist', async () => {
    const profileB = requireProfile(baseProfile({ name: 'b' }));
    setMockConfig('cursorFtpSftp.profiles', [
      serializeProfile(requireProfile(baseProfile({ name: 'a' }))),
      serializeProfile(profileB),
    ]);
    setMockQuickPickResult({
      label: 'b',
      description: 'SFTP://alice@host.example.com',
      profile: profileB,
    });

    expect((await pickProfile())?.name).toBe('b');
  });
});

describe('profile passwords', () => {
  it('prefers inline password on profile over secret storage', async () => {
    const ctx = mockExtensionContext();
    await setProfilePassword(ctx, 'dev', 'from-secrets');
    const profile: FtpSftpProfile = {
      name: 'dev',
      protocol: 'sftp',
      host: 'h',
      username: 'u',
      password: 'from-profile',
    };

    expect(await getProfilePassword(ctx, 'dev', profile)).toBe('from-profile');
  });

  it('stores, checks, and deletes secrets', async () => {
    const ctx = mockExtensionContext();

    expect(await hasProfilePassword(ctx, 'dev')).toBe(false);
    await setProfilePassword(ctx, 'dev', 'secret');
    expect(await hasProfilePassword(ctx, 'dev')).toBe(true);
    expect(await getProfilePassword(ctx, 'dev')).toBe('secret');
    await deleteProfilePassword(ctx, 'dev');
    expect(await hasProfilePassword(ctx, 'dev')).toBe(false);
  });
});

describe('expandHome', () => {
  it('expands tilde paths', () => {
    expect(expandHome('~/keys/id_rsa')).toBe(path.join(os.homedir(), 'keys/id_rsa'));
    expect(expandHome('~')).toBe(os.homedir());
    expect(expandHome('/absolute')).toBe('/absolute');
  });
});

describe('defaultPort', () => {
  it('returns standard ports', () => {
    expect(defaultPort('sftp')).toBe(22);
    expect(defaultPort('ftp')).toBe(21);
  });
});

describe('resolveLocalPath', () => {
  beforeEach(() => resetMockVscode());
  afterEach(() => resetMockVscode());

  it('substitutes workspace folder variable', () => {
    vscode.workspace.workspaceFolders = [{ uri: { fsPath: '/tmp/ws' } }];

    expect(resolveLocalPath('${workspaceFolder}/dist')).toBe('/tmp/ws/dist');
    expect(resolveLocalPath(undefined)).toBe('/tmp/ws');
  });
});

describe('readPrivateKey', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cursor-ftp-sftp-key-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('reads an existing key file', () => {
    const keyPath = path.join(tempDir, 'id_rsa');
    fs.writeFileSync(keyPath, 'PRIVATE KEY');

    expect(readPrivateKey(keyPath)?.toString()).toBe('PRIVATE KEY');
  });

  it('returns undefined when the key file is missing', () => {
    expect(readPrivateKey(path.join(tempDir, 'missing'))).toBeUndefined();
  });
});
