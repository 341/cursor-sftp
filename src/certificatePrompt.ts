import * as vscode from 'vscode';
import { formatConnectionError } from './connectionErrors';
import { FtpSftpProfile } from './types';

let outputChannel: vscode.OutputChannel | undefined;

export function getFtpSftpOutputChannel(): vscode.OutputChannel {
  if (!outputChannel) {
    outputChannel = vscode.window.createOutputChannel('FTP/SFTP');
  }
  return outputChannel;
}

export function logConnectionError(context: string, err: unknown): void {
  const channel = getFtpSftpOutputChannel();
  channel.appendLine(`[${new Date().toISOString()}] ${context}`);
  channel.appendLine(formatConnectionError(err));
  channel.appendLine('---');
}

/** Ask the user to trust a mismatched or invalid TLS certificate (FTPS). */
export async function promptTlsCertificateTrust(
  profile: FtpSftpProfile,
  err: unknown,
): Promise<boolean> {
  const detail = formatConnectionError(err);
  logConnectionError(`Certificate verification failed (${profile.name})`, err);

  const port = profile.port ?? 21;
  const choice = await vscode.window.showWarningMessage(
    `Certificate for "${profile.host}:${port}" could not be verified. This often happens when connecting by IP or the hostname does not match the certificate.`,
    {
      modal: true,
      detail,
    },
    'Trust and connect',
    'Reject',
  );

  return choice === 'Trust and connect';
}

export async function showConnectionFailure(err: unknown): Promise<void> {
  const detail =
    err instanceof Error && 'detail' in err
      ? String((err as { detail: string }).detail)
      : formatConnectionError(err);

  logConnectionError('Connection failed', err);

  const summary = detail.split('\n')[0] ?? 'Connection failed';
  await vscode.window.showErrorMessage(summary, {
    modal: true,
    detail,
  });
}
