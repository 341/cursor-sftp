import * as fs from 'fs';
import * as path from 'path';
import { minimatch } from 'minimatch';
import { RemoteClient } from './types';

export interface SyncOptions {
  localRoot: string;
  remoteRoot: string;
  ignore: string[];
  onProgress?: (message: string) => void;
}

export async function syncLocalToRemote(
  client: RemoteClient,
  options: SyncOptions,
): Promise<{ uploaded: number; skipped: number }> {
  let uploaded = 0;
  let skipped = 0;

  if (!fs.existsSync(options.localRoot)) {
    throw new Error(`Local path does not exist: ${options.localRoot}`);
  }

  await client.ensureDir(options.remoteRoot);

  async function walk(localDir: string, remoteDir: string): Promise<void> {
    const entries = fs.readdirSync(localDir, { withFileTypes: true });
    for (const entry of entries) {
      const localPath = path.join(localDir, entry.name);
      const rel = path.relative(options.localRoot, localPath).split(path.sep).join('/');
      const remotePath = path.posix.join(remoteDir.replace(/\\/g, '/'), entry.name);

      if (shouldIgnore(rel, options.ignore)) {
        skipped += 1;
        continue;
      }

      if (entry.isDirectory()) {
        await client.ensureDir(remotePath);
        options.onProgress?.(`Sync dir ${rel}`);
        await walk(localPath, remotePath);
      } else if (entry.isFile()) {
        options.onProgress?.(`Upload ${rel}`);
        await client.upload(localPath, remotePath);
        uploaded += 1;
      }
    }
  }

  await walk(options.localRoot, options.remoteRoot.replace(/\\/g, '/'));
  return { uploaded, skipped };
}

function shouldIgnore(relativePath: string, patterns: string[]): boolean {
  const normalized = relativePath.replace(/\\/g, '/');
  return patterns.some((pattern) => minimatch(normalized, pattern, { dot: true }));
}
