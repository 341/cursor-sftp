import * as vscode from 'vscode';
import { isClientClosedError } from './clientErrors';
import { ConnectionManager } from './connection';
import { RemoteEntry } from './types';

export class RemoteTreeProvider implements vscode.TreeDataProvider<RemoteTreeItem> {
  private readonly _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChange.event;

  /** Coalesce parallel getChildren calls for the same path (e.g. dual sidebar views). */
  private readonly listInflight = new Map<string, Promise<RemoteTreeItem[]>>();

  constructor(private readonly connections: ConnectionManager) {}

  refresh(): void {
    this.listInflight.clear();
    this._onDidChange.fire();
  }

  getTreeItem(element: RemoteTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: RemoteTreeItem): Promise<RemoteTreeItem[]> {
    const session = this.connections.active;
    if (!session) {
      return [];
    }

    const remotePath = element?.remotePath ?? session.remoteRoot;
    const inflight = this.listInflight.get(remotePath);
    if (inflight) {
      return inflight;
    }

    const promise = this.loadChildren(remotePath, session.profile.name);
    this.listInflight.set(remotePath, promise);
    try {
      return await promise;
    } finally {
      if (this.listInflight.get(remotePath) === promise) {
        this.listInflight.delete(remotePath);
      }
    }
  }

  private async loadChildren(remotePath: string, profileName: string): Promise<RemoteTreeItem[]> {
    const session = this.connections.active;
    if (!session) {
      return [];
    }

    try {
      const entries = await session.client.list(remotePath);
      return entries.map((entry) => RemoteTreeItem.fromEntry(entry, profileName));
    } catch (err) {
      if (!this.connections.isConnected || isClientClosedError(err)) {
        return [];
      }
      const message = err instanceof Error ? err.message : String(err);
      void vscode.window.showErrorMessage(`Remote list failed: ${message}`);
      return [];
    }
  }
}

export class RemoteTreeItem extends vscode.TreeItem {
  readonly remotePath: string;

  constructor(
    label: string,
    remotePath: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    contextValue: string,
  ) {
    super(label, collapsibleState);
    this.remotePath = remotePath;
    this.contextValue = contextValue;
    this.tooltip = remotePath;
  }

  static fromEntry(entry: RemoteEntry, profileName: string): RemoteTreeItem {
    const isDir = entry.type === 'directory';
    const item = new RemoteTreeItem(
      entry.name,
      entry.path,
      isDir ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None,
      isDir ? 'remoteDirectory' : 'remoteFile',
    );
    item.iconPath = isDir ? new vscode.ThemeIcon('folder') : new vscode.ThemeIcon('file');
    item.description = profileName;
    if (!isDir && entry.size !== undefined) {
      item.description = `${formatBytes(entry.size)} · ${profileName}`;
    }
    return item;
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
