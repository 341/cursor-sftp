import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { FtpSftpProfile, Protocol } from './types';

const CONFIG_KEY = 'cursorFtpSftp.profiles';
const DEFAULT_PROFILE_KEY = 'cursorFtpSftp.defaultProfile';
const SECRET_PREFIX = 'cursorFtpSftp.password.';

export function getProfiles(): FtpSftpProfile[] {
  const config = vscode.workspace.getConfiguration();
  const raw = config.get<unknown[]>(CONFIG_KEY, []);
  return raw
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    .map(normalizeProfile)
    .filter((p): p is FtpSftpProfile => p !== null);
}

function normalizeProfile(raw: Record<string, unknown>): FtpSftpProfile | null {
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
    secure: typeof raw.secure === 'boolean' ? raw.secure : true,
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
      'No FTP/SFTP profiles configured. Add cursorFtpSftp.profiles in Settings.',
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
): Promise<string | undefined> {
  return context.secrets.get(SECRET_PREFIX + profileName);
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
