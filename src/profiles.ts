import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { getRawProfilesFromSftpJson } from './sftpJsonConfig';
import { FtpSecureMode, FtpSftpProfile, Protocol } from './types';

const CONFIG_KEY = 'cursorFtpSftp.profiles';
const DEFAULT_PROFILE_KEY = 'cursorFtpSftp.defaultProfile';
const UPLOAD_ON_SAVE_KEY = 'cursorFtpSftp.uploadOnSave';
const SECRET_PREFIX = 'cursorFtpSftp.password.';

export const DEFAULT_IGNORE_PATTERNS = ['**/.git/**', '**/node_modules/**', '**/.env'];

export function serializeProfile(profile: FtpSftpProfile): Record<string, unknown> {
  const data: Record<string, unknown> = {
    name: profile.name,
    protocol: profile.protocol,
    host: profile.host,
    username: profile.username,
    remotePath: profile.remotePath ?? '/',
    localPath: profile.localPath ?? '${workspaceFolder}',
    secure: profile.secure ?? true,
    ignore: profile.ignore ?? DEFAULT_IGNORE_PATTERNS,
  };
  if (profile.trustServerCertificate === true) {
    data.trustServerCertificate = true;
  }
  if (profile.port !== undefined) {
    data.port = profile.port;
  }
  if (profile.privateKeyPath) {
    data.privateKeyPath = profile.privateKeyPath;
  }
  if (profile.passphrase) {
    data.passphrase = profile.passphrase;
  }
  return data;
}

export async function saveProfiles(
  profiles: FtpSftpProfile[],
  target: vscode.ConfigurationTarget = vscode.ConfigurationTarget.Global,
): Promise<void> {
  const serialized = profiles.map(serializeProfile);
  await vscode.workspace.getConfiguration().update(CONFIG_KEY, serialized, target);
}

export async function setDefaultProfile(
  name: string,
  target: vscode.ConfigurationTarget = vscode.ConfigurationTarget.Global,
): Promise<void> {
  await vscode.workspace.getConfiguration().update(DEFAULT_PROFILE_KEY, name, target);
}

export function getDefaultProfileName(): string {
  return vscode.workspace.getConfiguration().get<string>(DEFAULT_PROFILE_KEY, '');
}

export function getUploadOnSave(): boolean {
  return vscode.workspace.getConfiguration().get<boolean>(UPLOAD_ON_SAVE_KEY, false);
}

export async function setUploadOnSave(
  enabled: boolean,
  target: vscode.ConfigurationTarget = vscode.ConfigurationTarget.Global,
): Promise<void> {
  await vscode.workspace.getConfiguration().update(UPLOAD_ON_SAVE_KEY, enabled, target);
}

export async function deleteProfilePassword(
  context: vscode.ExtensionContext,
  profileName: string,
): Promise<void> {
  await context.secrets.delete(SECRET_PREFIX + profileName);
}

export async function hasProfilePassword(
  context: vscode.ExtensionContext,
  profileName: string,
): Promise<boolean> {
  const value = await context.secrets.get(SECRET_PREFIX + profileName);
  return value !== undefined && value.length > 0;
}

export function getProfiles(): FtpSftpProfile[] {
  const config = vscode.workspace.getConfiguration();
  const raw = config.get<unknown[]>(CONFIG_KEY, []);
  const fromSettings = raw
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    .map(normalizeProfile)
    .filter((p): p is FtpSftpProfile => p !== null);

  const fromSftpJson = getRawProfilesFromSftpJson()
    .map(normalizeProfile)
    .filter((p): p is FtpSftpProfile => p !== null);
  const byName = new Map<string, FtpSftpProfile>();
  for (const profile of fromSftpJson) {
    byName.set(profile.name, profile);
  }
  for (const profile of fromSettings) {
    byName.set(profile.name, profile);
  }
  return Array.from(byName.values());
}

export function normalizeProfile(raw: Record<string, unknown>): FtpSftpProfile | null {
  const name = String(raw.name ?? '').trim();
  const host = String(raw.host ?? '').trim();
  const username = String(raw.username ?? '').trim();
  const protocol = raw.protocol === 'ftp' ? 'ftp' : raw.protocol === 'sftp' ? 'sftp' : null;
  if (!name || !host || !username || !protocol) {
    return null;
  }
  return {
    name,
    protocol,
    host,
    username,
    port: typeof raw.port === 'number' ? raw.port : undefined,
    remotePath: typeof raw.remotePath === 'string' ? raw.remotePath : '/',
    localPath: typeof raw.localPath === 'string' ? raw.localPath : '${workspaceFolder}',
    privateKeyPath: typeof raw.privateKeyPath === 'string' ? raw.privateKeyPath : undefined,
    passphrase: typeof raw.passphrase === 'string' ? raw.passphrase : undefined,
    secure: parseSecureMode(raw.secure),
    passive: typeof raw.passive === 'boolean' ? raw.passive : undefined,
    connectTimeout: typeof raw.connectTimeout === 'number' ? raw.connectTimeout : undefined,
    password: typeof raw.password === 'string' ? raw.password : undefined,
    trustServerCertificate:
      typeof raw.trustServerCertificate === 'boolean' ? raw.trustServerCertificate : undefined,
    ignore: Array.isArray(raw.ignore)
      ? raw.ignore.filter((x): x is string => typeof x === 'string')
      : undefined,
  };
}

export function resolveLocalPath(template: string | undefined): string {
  const value = (template ?? '${workspaceFolder}').trim();
  const folder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';
  return value.replace(/\$\{workspaceFolder\}/g, folder);
}

export function expandHome(filePath: string): string {
  if (filePath.startsWith('~/')) {
    return path.join(os.homedir(), filePath.slice(2));
  }
  if (filePath === '~') {
    return os.homedir();
  }
  return filePath;
}

export function defaultPort(protocol: Protocol): number {
  return protocol === 'sftp' ? 22 : 21;
}

export async function pickProfile(): Promise<FtpSftpProfile | undefined> {
  const profiles = getProfiles();
  if (profiles.length === 0) {
    void vscode.window.showErrorMessage(
      'No FTP/SFTP profiles configured. Run **FTP/SFTP: Open Settings** to add one.',
    );
    return undefined;
  }

  const defaultName = vscode.workspace.getConfiguration().get<string>(DEFAULT_PROFILE_KEY, '');
  if (defaultName) {
    const found = profiles.find((p) => p.name === defaultName);
    if (found) {
      return found;
    }
  }

  if (profiles.length === 1) {
    return profiles[0];
  }

  const picked = await vscode.window.showQuickPick(
    profiles.map((p) => ({
      label: p.name,
      description: `${p.protocol.toUpperCase()}://${p.username}@${p.host}`,
      profile: p,
    })),
    { placeHolder: 'Select FTP/SFTP profile' },
  );
  return picked?.profile;
}

export async function getProfilePassword(
  context: vscode.ExtensionContext,
  profileName: string,
  profile?: FtpSftpProfile,
): Promise<string | undefined> {
  if (profile?.password) {
    return profile.password;
  }
  return context.secrets.get(SECRET_PREFIX + profileName);
}

function parseSecureMode(value: unknown): FtpSecureMode {
  if (value === false || value === 'false') {
    return false;
  }
  if (value === 'implicit') {
    return 'implicit';
  }
  if (value === 'control' || value === true || value === 'true') {
    return 'control';
  }
  return true;
}

export async function setProfilePassword(
  context: vscode.ExtensionContext,
  profileName: string,
  password: string,
): Promise<void> {
  await context.secrets.store(SECRET_PREFIX + profileName, password);
}

export function readPrivateKey(keyPath: string): Buffer | undefined {
  const resolved = expandHome(keyPath);
  if (!fs.existsSync(resolved)) {
    return undefined;
  }
  return fs.readFileSync(resolved);
}
