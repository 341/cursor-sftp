import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { syncLocalToRemote } from '../src/sync';
import { RemoteClient, RemoteEntry } from '../src/types';

class MockRemoteClient implements RemoteClient {
  readonly profile = {
    name: 'mock',
    protocol: 'sftp' as const,
    host: 'localhost',
    username: 'test',
  };

  readonly uploads: Array<{ local: string; remote: string }> = [];
  readonly dirs: string[] = [];

  async connect(): Promise<void> {}
  async disconnect(): Promise<void> {}
  async list(): Promise<RemoteEntry[]> {
    return [];
  }
  async download(): Promise<void> {}
  async upload(localPath: string, remotePath: string): Promise<void> {
    this.uploads.push({ local: localPath, remote: remotePath });
  }
  async mkdir(remotePath: string): Promise<void> {
    this.dirs.push(remotePath);
  }
  async ensureDir(remotePath: string): Promise<void> {
    this.dirs.push(remotePath);
  }
}

describe('syncLocalToRemote', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cursor-ftp-sftp-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('uploads files and skips ignored paths', async () => {
    const localRoot = path.join(tempDir, 'project');
    fs.mkdirSync(path.join(localRoot, 'src'), { recursive: true });
    fs.mkdirSync(path.join(localRoot, 'node_modules', 'pkg'), { recursive: true });
    fs.writeFileSync(path.join(localRoot, 'src', 'index.ts'), 'export {};');
    fs.writeFileSync(path.join(localRoot, 'node_modules', 'pkg', 'index.js'), '');

    const client = new MockRemoteClient();
    const result = await syncLocalToRemote(client, {
      localRoot,
      remoteRoot: '/remote',
      ignore: ['**/node_modules/**'],
    });

    expect(result.uploaded).toBe(1);
    expect(result.skipped).toBe(1);
    expect(client.uploads.some((u) => u.remote.endsWith('/src/index.ts'))).toBe(true);
    expect(client.uploads.some((u) => u.remote.includes('node_modules'))).toBe(false);
  });
});
