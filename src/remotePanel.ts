import * as vscode from 'vscode';

const REMOTE_VIEW_IDS = [
  'cursorFtpSftp.remoteExplorerRight',
  'cursorFtpSftp.remoteExplorer',
] as const;

const REMOTE_CONTAINER_IDS = ['cursorFtpSftpRemote', 'cursorFtpSftp'] as const;

/** Focus the FTP/SFTP remote tree (right sidebar first, then left activity bar). */
export async function focusRemotePanel(): Promise<void> {
  try {
    await vscode.commands.executeCommand('workbench.action.focusAuxiliaryBar');
  } catch {
    // Auxiliary bar may be unavailable on older builds.
  }

  const openers: string[] = [];
  for (const containerId of REMOTE_CONTAINER_IDS) {
    openers.push(`workbench.view.extension.${containerId}`);
  }
  for (const viewId of REMOTE_VIEW_IDS) {
    openers.push(`${viewId}.focus`);
  }

  for (const command of openers) {
    try {
      await vscode.commands.executeCommand(command);
      return;
    } catch {
      // try next opener
    }
  }
}
