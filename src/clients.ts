import * as path from 'path';
import { Client as FtpClient } from 'basic-ftp';
import SftpClient from 'ssh2-sftp-client';
import * as vscode from 'vscode';
import {
  defaultPort,
  getProfilePassword,
  readPrivateKey,
} from './profiles';
import { FtpSftpProfile, RemoteClient, RemoteEntry } from './types';

export async function createRemoteClient(
  profile: FtpSftpProfile,
  context: vscode.ExtensionContext,
): Promise<RemoteClient> {
  const password = await getProfilePassword(context, profile.name);
  if (profile.protocol === 'sftp') {
    return new SftpRemoteClient(profile, password);
  }
  return new FtpRemoteClient(profile, password);
}

class SftpRemoteClient implements RemoteClient {
  readonly profile: FtpSftpProfile;
  private readonly client = new SftpClient();
  private readonly password: string | undefined;

  constructor(profile: FtpSftpProfile, password: string | undefined) {
    this.profile = profile;
    this.password = password;
  }

  async connect(): Promise<void> {
    const port = this.profile.port ?? defaultPort('sftp');
    const config: Record<string, unknown> = {
      host: this.profile.host,
      port,
      username: this.profile.username,
      readyTimeout: 20000,
    };

    if (this.profile.privateKeyPath) {
      const key = readPrivateKey(this.profile.privateKeyPath);
      if (!key) {
        throw new Error(`Private key not found: ${this.profile.privateKeyPath}`);
      }
      config.privateKey = key;
      if (this.profile.passphrase) {
        config.passphrase = this.profile.passphrase;
      }
    } else if (this.password) {
      config.password = this.password;
    } else {
      throw new Error(
        `Profile "${this.profile.name}" needs a password (command: Set Profile Password) or privateKeyPath.`,
      );
    }

    await this.client.connect(config);
  }

  async disconnect(): Promise<void> {
    await this.client.end();
  }

  async list(remotePath: string): Promise<RemoteEntry[]> {
    const entries = await this.client.list(remotePath);
    return entries
      .filter((e: { name: string }) => e.name !== '.' && e.name !== '..')
      .map((e: { name: string; type: string; size?: number; modifyTime?: number }) => ({
        name: e.name,
        path: posixJoin(remotePath, e.name),
        type: (e.type === 'd' ? 'directory' : 'file') as 'file' | 'directory',
        size: e.size,
        modifyTime: e.modifyTime,
      }))
      .sort((a: RemoteEntry, b: RemoteEntry) => {
        if (a.type !== b.type) {
          return a.type === 'directory' ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });
  }

  async download(remotePath: string, localPath: string): Promise<void> {
    await this.client.fastGet(remotePath, localPath);
  }

  async upload(localPath: string, remotePath: string): Promise<void> {
    await this.client.fastPut(localPath, remotePath);
  }

  async mkdir(remotePath: string): Promise<void> {
    await this.client.mkdir(remotePath, true);
  }

  async ensureDir(remotePath: string): Promise<void> {
    const exists = await this.client.exists(remotePath);
    if (!exists) {
      await this.client.mkdir(remotePath, true);
    }
  }
}

class FtpRemoteClient implements RemoteClient {
  readonly profile: FtpSftpProfile;
  private readonly client = new FtpClient();
  private readonly password: string | undefined;

  constructor(profile: FtpSftpProfile, password: string | undefined) {
    this.profile = profile;
    this.password = password;
  }

  async connect(): Promise<void> {
    const port = this.profile.port ?? defaultPort('ftp');
    if (!this.password) {
      throw new Error(
        `Profile "${this.profile.name}" needs a password (command: Set Profile Password).`,
      );
    }
    await this.client.access({
      host: this.profile.host,
      port,
      user: this.profile.username,
      password: this.password,
      secure: this.profile.secure !== false,
    });
  }

  async disconnect(): Promise<void> {
    this.client.close();
  }

  async list(remotePath: string): Promise<RemoteEntry[]> {
    const entries = await this.client.list(remotePath);
    return entries
      .map((e) => ({
        name: e.name,
        path: posixJoin(remotePath, e.name),
        type: (e.isDirectory ? 'directory' : 'file') as 'file' | 'directory',
        size: e.size,
        modifyTime: e.rawModifiedAt ? Date.parse(e.rawModifiedAt) : undefined,
      }))
      .sort((a: RemoteEntry, b: RemoteEntry) => {
        if (a.type !== b.type) {
          return a.type === 'directory' ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });
  }

  async download(remotePath: string, localPath: string): Promise<void> {
    await this.client.downloadTo(localPath, remotePath);
  }

  async upload(localPath: string, remotePath: string): Promise<void> {
    await this.client.uploadFrom(localPath, remotePath);
  }

  async mkdir(remotePath: string): Promise<void> {
    await this.client.ensureDir(remotePath);
  }

  async ensureDir(remotePath: string): Promise<void> {
    await this.client.ensureDir(remotePath);
  }
}

function posixJoin(base: string, segment: string): string {
  const normalized = base.replace(/\\/g, '/').replace(/\/+$/, '') || '/';
  if (normalized === '/') {
    return `/${segment}`;
  }
  return path.posix.join(normalized, segment);
}
