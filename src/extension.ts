import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { ConnectionManager } from './connection';
import { RemoteTreeItem, RemoteTreeProvider } from './remoteTree';
import {
  pickProfile,
  resolveLocalPath,
  setProfilePassword,
} from './profiles';
import { syncLocalToRemote } from './sync';

let connections: ConnectionManager;
let remoteTree: RemoteTreeProvider;

export function activate(context: vscode.ExtensionContext): void {
  connections = new ConnectionManager();
  remoteTree = new RemoteTreeProvider(connections);

  void vscode.commands.executeCommand('setContext', 'cursorFtpSftp.connected', false);

  const treeView = vscode.window.createTreeView('cursorFtpSftp.remoteExplorer', {
    treeDataProvider: remoteTree,
    showCollapseAll: true,
  });
  context.subscriptions.push(treeView);

  context.subscriptions.push(
    vscode.commands.registerCommand('cursorFtpSftp.connect', () => connectCommand(context)),
    vscode.commands.registerCommand('cursorFtpSftp.disconnect', () => disconnectCommand()),
    vscode.commands.registerCommand('cursorFtpSftp.refreshRemote', () => remoteTree.refresh()),
    vscode.commands.registerCommand('cursorFtpSftp.setPassword', () => setPasswordCommand(context)),
    vscode.commands.registerCommand('cursorFtpSftp.uploadFile', () => uploadFileCommand()),
    vscode.commands.registerCommand('cursorFtpSftp.downloadFile', () => downloadFileCommand()),
    vscode.commands.registerCommand('cursorFtpSftp.uploadWorkspace', () => uploadWorkspaceCommand()),
    vscode.commands.registerCommand('cursorFtpSftp.syncToRemote', () => syncToRemoteCommand()),
    vscode.commands.registerCommand('cursorFtpSftp.openRemote', (item?: RemoteTreeItem) =>
      openRemoteCommand(context, item),
    ),
    vscode.commands.registerCommand('cursorFtpSftp.downloadRemote', (item?: RemoteTreeItem) =>
      downloadRemoteCommand(item),
    ),
    vscode.commands.registerCommand('cursorFtpSftp.uploadToRemote', (item?: RemoteTreeItem) =>
      uploadToRemoteCommand(item),
    ),
  );

  const uploadOnSave = vscode.workspace.onDidSaveTextDocument(async (doc) => {
    if (!vscode.workspace.getConfiguration().get('cursorFtpSftp.uploadOnSave', false)) {
      return;
    }
    if (doc.uri.scheme !== 'file' || !connections.isConnected) {
      return;
    }
    const remotePath = connections.mapLocalToRemote(doc.uri.fsPath);
    if (!remotePath || !connections.active) {
      return;
    }
    try {
      await connections.active.client.upload(doc.uri.fsPath, remotePath);
      void vscode.window.setStatusBarMessage(`$(cloud-upload) Uploaded ${path.basename(remotePath)}`, 3000);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      void vscode.window.showErrorMessage(`Upload on save failed: ${message}`);
    }
  });
  context.subscriptions.push(uploadOnSave);
}

export async function deactivate(): Promise<void> {
  await connections?.disconnect();
}

async function connectCommand(context: vscode.ExtensionContext): Promise<void> {
  const profile = await pickProfile();
  if (!profile) {
    return;
  }
  try {
    await connections.connect(profile, context);
    remoteTree.refresh();
    void vscode.window.showInformationMessage(
      `Connected to ${profile.name} (${profile.protocol.toUpperCase()})`,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    void vscode.window.showErrorMessage(`Connection failed: ${message}`);
  }
}

async function disconnectCommand(): Promise<void> {
  await connections.disconnect();
  remoteTree.refresh();
  void vscode.window.showInformationMessage('FTP/SFTP disconnected');
}

async function setPasswordCommand(context: vscode.ExtensionContext): Promise<void> {
  const profile = await pickProfile();
  if (!profile) {
    return;
  }
  const password = await vscode.window.showInputBox({
    prompt: `Password for profile "${profile.name}"`,
    password: true,
    ignoreFocusOut: true,
  });
  if (!password) {
    return;
  }
  await setProfilePassword(context, profile.name, password);
  void vscode.window.showInformationMessage(`Password stored for profile "${profile.name}"`);
}

async function uploadFileCommand(): Promise<void> {
  const session = connections.active;
  if (!session) {
    void vscode.window.showWarningMessage('Connect to an FTP/SFTP profile first.');
    return;
  }
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.uri.scheme !== 'file') {
    void vscode.window.showWarningMessage('Open a saved local file to upload.');
    return;
  }
  const localPath = editor.document.uri.fsPath;
  const remotePath = connections.mapLocalToRemote(localPath);
  if (!remotePath) {
    void vscode.window.showErrorMessage(
      'File is outside the profile localPath. Adjust localPath or workspace folder.',
    );
    return;
  }
  await runTransfer('Uploading', async () => {
    const remoteDir = path.posix.dirname(remotePath);
    await session.client.ensureDir(remoteDir);
    await session.client.upload(localPath, remotePath);
  });
}

async function downloadFileCommand(): Promise<void> {
  const session = connections.active;
  if (!session) {
    void vscode.window.showWarningMessage('Connect to an FTP/SFTP profile first.');
    return;
  }
  const remotePath = await vscode.window.showInputBox({
    prompt: 'Remote file path',
    value: session.remoteRoot,
    ignoreFocusOut: true,
  });
  if (!remotePath) {
    return;
  }
  const localPath = await vscode.window.showSaveDialog({
    defaultUri: vscode.Uri.file(path.join(session.localRoot, path.basename(remotePath))),
  });
  if (!localPath) {
    return;
  }
  await runTransfer('Downloading', async () => {
    await session.client.download(remotePath, localPath.fsPath);
    await vscode.window.showTextDocument(localPath);
  });
}

async function uploadWorkspaceCommand(): Promise<void> {
  const session = connections.active;
  if (!session) {
    void vscode.window.showWarningMessage('Connect to an FTP/SFTP profile first.');
    return;
  }
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    void vscode.window.showWarningMessage('Open a workspace folder first.');
    return;
  }
  const localRoot = folder.uri.fsPath;
  await runTransfer('Uploading workspace', async () => {
    const ignore = session.profile.ignore ?? ['**/.git/**', '**/node_modules/**'];
    const result = await syncLocalToRemote(session.client, {
      localRoot,
      remoteRoot: session.remoteRoot,
      ignore,
      onProgress: (msg) => {
        void vscode.window.setStatusBarMessage(msg, 2000);
      },
    });
    void vscode.window.showInformationMessage(
      `Upload complete: ${result.uploaded} files (${result.skipped} skipped)`,
    );
  });
}

async function syncToRemoteCommand(): Promise<void> {
  const session = connections.active;
  if (!session) {
    void vscode.window.showWarningMessage('Connect to an FTP/SFTP profile first.');
    return;
  }
  const localRoot = resolveLocalPath(session.profile.localPath);
  if (!fs.existsSync(localRoot)) {
    void vscode.window.showErrorMessage(`Local path does not exist: ${localRoot}`);
    return;
  }
  const confirm = await vscode.window.showWarningMessage(
    `Sync "${localRoot}" to remote "${session.remoteRoot}"?`,
    { modal: true },
    'Sync',
  );
  if (confirm !== 'Sync') {
    return;
  }
  await runTransfer('Syncing to remote', async () => {
    const ignore = session.profile.ignore ?? ['**/.git/**', '**/node_modules/**'];
    const result = await syncLocalToRemote(session.client, {
      localRoot,
      remoteRoot: session.remoteRoot,
      ignore,
    });
    void vscode.window.showInformationMessage(
      `Sync complete: ${result.uploaded} uploaded, ${result.skipped} skipped`,
    );
  });
}

async function openRemoteCommand(
  context: vscode.ExtensionContext,
  item?: RemoteTreeItem,
): Promise<void> {
  const session = connections.active;
  if (!session || !item?.remotePath) {
    return;
  }
  const tempDir = path.join(context.globalStorageUri.fsPath, 'remote-cache');
  fs.mkdirSync(tempDir, { recursive: true });
  const localPath = path.join(tempDir, path.basename(item.remotePath));
  await runTransfer('Downloading remote file', async () => {
    await session.client.download(item.remotePath!, localPath);
    const doc = await vscode.workspace.openTextDocument(localPath);
    await vscode.window.showTextDocument(doc, { preview: true });
  });
}

async function downloadRemoteCommand(item?: RemoteTreeItem): Promise<void> {
  const session = connections.active;
  if (!session || !item?.remotePath) {
    return;
  }
  const rel = path.posix.relative(session.remoteRoot, item.remotePath);
  const target = path.join(session.localRoot, rel);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  await runTransfer('Downloading', async () => {
    await session.client.download(item.remotePath!, target);
    void vscode.window.showInformationMessage(`Downloaded to ${target}`);
  });
}

async function uploadToRemoteCommand(item?: RemoteTreeItem): Promise<void> {
  const session = connections.active;
  if (!session) {
    return;
  }
  const files = await vscode.window.showOpenDialog({
    canSelectMany: true,
    openLabel: 'Upload',
  });
  if (!files?.length) {
    return;
  }
  const remoteDir = item?.remotePath ?? session.remoteRoot;
  await runTransfer('Uploading', async () => {
    for (const file of files) {
      const remotePath = path.posix.join(remoteDir.replace(/\\/g, '/'), path.basename(file.fsPath));
      await session.client.upload(file.fsPath, remotePath);
    }
  });
}

async function runTransfer(title: string, fn: () => Promise<void>): Promise<void> {
  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title, cancellable: false },
    async () => {
      try {
        await fn();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        void vscode.window.showErrorMessage(`${title} failed: ${message}`);
        throw err;
      }
    },
  );
}
