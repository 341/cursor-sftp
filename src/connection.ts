import * as path from 'path';
import * as vscode from 'vscode';
import { createRemoteClient } from './clients';
import { resolveLocalPath } from './profiles';
import { FtpSftpProfile, RemoteClient } from './types';

export interface ActiveSession {
  profile: FtpSftpProfile;
  client: RemoteClient;
  remoteRoot: string;
  localRoot: string;
}

export class ConnectionManager {
  private session: ActiveSession | undefined;

  get active(): ActiveSession | undefined {
    return this.session;
  }

  get isConnected(): boolean {
    return this.session !== undefined;
  }

  async connect(
    profile: FtpSftpProfile,
    context: vscode.ExtensionContext,
  ): Promise<ActiveSession> {
    if (this.session) {
      await this.disconnect();
    }

    const client = await createRemoteClient(profile, context);
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Connecting to ${profile.name} (${profile.protocol})`,
        cancellable: false,
      },
      async () => {
        await client.connect();
      },
    );

    const remoteRoot = normalizeRemotePath(profile.remotePath ?? '/');
    const localRoot = resolveLocalPath(profile.localPath);

    this.session = { profile, client, remoteRoot, localRoot };
    await vscode.commands.executeCommand('setContext', 'cursorFtpSftp.connected', true);
    return this.session;
  }

  async disconnect(): Promise<void> {
    if (!this.session) {
      return;
    }
    try {
      await this.session.client.disconnect();
    } catch {
      // ignore close errors
    }
    this.session = undefined;
    await vscode.commands.executeCommand('setContext', 'cursorFtpSftp.connected', false);
  }

  mapLocalToRemote(localFilePath: string): string | undefined {
    if (!this.session) {
      return undefined;
    }
    const rel = path.relative(this.session.localRoot, localFilePath);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      return undefined;
    }
    const posixRel = rel.split(path.sep).join('/');
    return path.posix.join(this.session.remoteRoot, posixRel);
  }
}

function normalizeRemotePath(remotePath: string): string {
  const normalized = remotePath.replace(/\\/g, '/');
  if (!normalized.startsWith('/')) {
    return `/${normalized}`;
  }
  return normalized.replace(/\/+$/, '') || '/';
}
