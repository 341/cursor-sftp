import * as path from 'path';
import * as vscode from 'vscode';
import { promptTlsCertificateTrust } from './certificatePrompt';
import { ConnectionError, isCertificateTrustError } from './connectionErrors';
import { createRemoteClient } from './clients';
import { getProfiles, resolveLocalPath, saveProfiles } from './profiles';
import { isTlsTrusted, setTlsTrusted } from './trustStore';
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

  async connect(profile: FtpSftpProfile, context: vscode.ExtensionContext): Promise<ActiveSession> {
    if (this.session) {
      await this.disconnect();
    }

    let trustTls = await isTlsTrusted(context, profile);

    while (true) {
      const client = await createRemoteClient(profile, context, {
        trustTlsCertificate: trustTls,
      });

      try {
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
      } catch (err) {
        await safeDisconnect(client);

        if (
          profile.protocol === 'ftp' &&
          profile.secure !== false &&
          !trustTls &&
          isCertificateTrustError(err)
        ) {
          const accepted = await promptTlsCertificateTrust(profile, err);
          if (accepted) {
            await setTlsTrusted(context, profile);
            await persistProfileTlsTrust(profile);
            profile = { ...profile, trustServerCertificate: true };
            trustTls = true;
            continue;
          }
          throw new ConnectionError(err);
        }

        throw new ConnectionError(err);
      }

      const remoteRoot = normalizeRemotePath(profile.remotePath ?? '/');
      const localRoot = resolveLocalPath(profile.localPath);

      this.session = { profile, client, remoteRoot, localRoot };
      await vscode.commands.executeCommand('setContext', 'cursorFtpSftp.connected', true);
      return this.session;
    }
  }

  async disconnect(): Promise<void> {
    const session = this.session;
    if (!session) {
      return;
    }
    this.session = undefined;
    await vscode.commands.executeCommand('setContext', 'cursorFtpSftp.connected', false);
    try {
      await session.client.disconnect();
    } catch {
      // ignore close errors
    }
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

async function safeDisconnect(client: RemoteClient): Promise<void> {
  try {
    await client.disconnect();
  } catch {
    // ignore cleanup errors
  }
}

async function persistProfileTlsTrust(profile: FtpSftpProfile): Promise<void> {
  const profiles = getProfiles();
  const index = profiles.findIndex((p) => p.name === profile.name);
  if (index < 0) {
    return;
  }
  profiles[index] = { ...profiles[index], trustServerCertificate: true };
  await saveProfiles(profiles);
}

function normalizeRemotePath(remotePath: string): string {
  const normalized = remotePath.replace(/\\/g, '/');
  if (!normalized.startsWith('/')) {
    return `/${normalized}`;
  }
  return normalized.replace(/\/+$/, '') || '/';
}
