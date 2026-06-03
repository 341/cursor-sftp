import * as vscode from 'vscode';
import { defaultPort } from './profiles';
import { FtpSftpProfile } from './types';

const TRUST_KEY = 'cursorFtpSftp.trustedTlsHosts';

type TrustMap = Record<string, { acceptedAt: string }>;

function trustKey(profile: FtpSftpProfile): string {
  const port = profile.port ?? defaultPort(profile.protocol);
  return `${profile.name}|${profile.host}|${port}`;
}

export async function isTlsTrusted(
  context: vscode.ExtensionContext,
  profile: FtpSftpProfile,
): Promise<boolean> {
  if (profile.trustServerCertificate === true) {
    return true;
  }
  const map = context.globalState.get<TrustMap>(TRUST_KEY, {});
  return trustKey(profile) in map;
}

export async function setTlsTrusted(
  context: vscode.ExtensionContext,
  profile: FtpSftpProfile,
): Promise<void> {
  const map = context.globalState.get<TrustMap>(TRUST_KEY, {});
  map[trustKey(profile)] = { acceptedAt: new Date().toISOString() };
  await context.globalState.update(TRUST_KEY, map);
}

export async function clearTlsTrust(
  context: vscode.ExtensionContext,
  profile: FtpSftpProfile,
): Promise<void> {
  const map = context.globalState.get<TrustMap>(TRUST_KEY, {});
  delete map[trustKey(profile)];
  await context.globalState.update(TRUST_KEY, map);
}
