import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

const SFTP_JSON = path.join('.vscode', 'sftp.json');

/** Raw profile objects from Natizyskunk/liximomo style `.vscode/sftp.json`. */
export function getRawProfilesFromSftpJson(): Record<string, unknown>[] {
  const folders = vscode.workspace.workspaceFolders ?? [];
  const entries: Record<string, unknown>[] = [];

  for (const folder of folders) {
    const configPath = path.join(folder.uri.fsPath, SFTP_JSON);
    if (!fs.existsSync(configPath)) {
      continue;
    }
    try {
      const raw = JSON.parse(fs.readFileSync(configPath, 'utf8')) as unknown;
      entries.push(...flattenSftpJsonConfig(raw, folder.uri.fsPath));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[cursor-ftp-sftp] Failed to parse ${configPath}: ${message}`);
    }
  }

  return entries;
}

function flattenSftpJsonConfig(raw: unknown, workspaceRoot: string): Record<string, unknown>[] {
  if (Array.isArray(raw)) {
    return raw.flatMap((item) => flattenSftpJsonEntry(item, workspaceRoot));
  }
  return flattenSftpJsonEntry(raw, workspaceRoot);
}

function flattenSftpJsonEntry(raw: unknown, workspaceRoot: string): Record<string, unknown>[] {
  if (typeof raw !== 'object' || raw === null) {
    return [];
  }

  const cfg = raw as Record<string, unknown>;
  const { profiles: nested, ...base } = cfg;
  const baseName = String(base.name ?? 'sftp').trim() || 'sftp';
  const results: Record<string, unknown>[] = [];

  if (base.host) {
    results.push(mapSftpJsonToProfile(base, baseName, workspaceRoot));
  }

  if (nested && typeof nested === 'object' && nested !== null) {
    for (const [subName, subRaw] of Object.entries(nested)) {
      if (typeof subRaw !== 'object' || subRaw === null) {
        continue;
      }
      const merged = { ...base, ...(subRaw as Record<string, unknown>) };
      if (!merged.host) {
        continue;
      }
      results.push(mapSftpJsonToProfile(merged, `${baseName}/${subName}`, workspaceRoot));
    }
  }

  return results;
}

function mapSftpJsonToProfile(
  raw: Record<string, unknown>,
  name: string,
  workspaceRoot: string,
): Record<string, unknown> {
  const context = typeof raw.context === 'string' ? raw.context.replace(/\\/g, '/') : '';
  const localPath = context
    ? `\${workspaceFolder}/${context.replace(/^\/+/, '')}`
    : '${workspaceFolder}';

  const secure = raw.secure;
  let trustServerCertificate: boolean | undefined;
  const secureOptions = raw.secureOptions;
  if (secureOptions && typeof secureOptions === 'object' && secureOptions !== null) {
    const reject = (secureOptions as { rejectUnauthorized?: boolean }).rejectUnauthorized;
    if (reject === false) {
      trustServerCertificate = true;
    }
  }

  const mapped: Record<string, unknown> = {
    name,
    protocol: raw.protocol === 'ftp' ? 'ftp' : 'sftp',
    host: raw.host,
    port: raw.port,
    username: raw.username,
    remotePath: raw.remotePath ?? '/',
    localPath,
    privateKeyPath: raw.privateKeyPath,
    passphrase: typeof raw.passphrase === 'string' ? raw.passphrase : undefined,
    secure,
    passive: raw.passive,
    connectTimeout: raw.connectTimeout,
    ignore: raw.ignore,
    trustServerCertificate,
  };

  if (typeof raw.password === 'string' && raw.password.length > 0) {
    mapped.password = raw.password;
  }

  return mapped;
}
