/** Minimal vscode API mock for unit tests (Vitest). */

export enum ConfigurationTarget {
  Global = 1,
  Workspace = 2,
  WorkspaceFolder = 3,
}

const configStore = new Map<string, unknown>();

let quickPickResult: unknown;

export function resetMockVscode(): void {
  configStore.clear();
  workspace.workspaceFolders = undefined;
  quickPickResult = undefined;
  window.showErrorMessageCalls = 0;
}

export function setMockConfig(key: string, value: unknown): void {
  configStore.set(key, value);
}

export function getMockConfig(key: string): unknown {
  return configStore.get(key);
}

export function setMockQuickPickResult<T>(value: T | undefined): void {
  quickPickResult = value;
}

export const workspace = {
  workspaceFolders: undefined as Array<{ uri: { fsPath: string } }> | undefined,
  getConfiguration: (_section?: string) => ({
    get: <T>(key: string, defaultValue: T): T =>
      (configStore.has(key) ? configStore.get(key) : defaultValue) as T,
    update: async (key: string, value: unknown): Promise<void> => {
      configStore.set(key, value);
    },
  }),
};

export const window = {
  showErrorMessageCalls: 0,
  showErrorMessage: async (): Promise<undefined> => {
    window.showErrorMessageCalls += 1;
    return undefined;
  },
  showWarningMessage: async (): Promise<undefined> => undefined,
  showInformationMessage: async (): Promise<undefined> => undefined,
  showQuickPick: async (): Promise<unknown> => quickPickResult,
  showInputBox: async (): Promise<undefined> => undefined,
  createOutputChannel: () => ({
    appendLine: (): void => undefined,
  }),
};

export const Uri = {
  file: (fsPath: string) => ({ fsPath, scheme: 'file' as const }),
};

export const commands = {
  executeCommand: async (): Promise<undefined> => undefined,
};

export const ProgressLocation = { Notification: 15 };

export class EventEmitter<T = void> {
  private listener: ((e: T) => void) | undefined;
  event = (listener: (e: T) => void): { dispose: () => void } => {
    this.listener = listener;
    return { dispose: () => undefined };
  };
  fire(data: T): void {
    this.listener?.(data);
  }
  dispose(): void {}
}

export class TreeItem {
  label?: string;
  constructor(label: string) {
    this.label = label;
  }
}

TreeItem.prototype.CollapsibleState = { None: 0, Collapsed: 1, Expanded: 2 };

export const ThemeIcon = class {
  constructor(public readonly id: string) {}
};

export enum TreeItemCollapsibleState {
  None = 0,
  Collapsed = 1,
  Expanded = 2,
}

export type ExtensionContext = {
  secrets: {
    store: (key: string, value: string) => Promise<void>;
    get: (key: string) => Promise<string | undefined>;
    delete: (key: string) => Promise<void>;
  };
  globalState: {
    get: <T>(key: string, defaultValue: T) => T;
    update: (key: string, value: unknown) => Promise<void>;
  };
};
