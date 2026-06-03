import { describe, expect, it } from 'vitest';
import { QueuedRemoteClient } from '../src/queuedClient';
import { FtpSftpProfile, RemoteClient } from '../src/types';

class SlowMockClient implements RemoteClient {
  readonly profile: FtpSftpProfile = {
    name: 'mock',
    protocol: 'sftp',
    host: 'h',
    username: 'u',
  };

  active = 0;
  maxActive = 0;

  async connect(): Promise<void> {}
  async disconnect(): Promise<void> {}
  async list(): Promise<never[]> {
    return this.track(async () => []);
  }
  async download(): Promise<void> {
    await this.track(async () => undefined);
  }
  async upload(): Promise<void> {
    await this.track(async () => undefined);
  }
  async mkdir(): Promise<void> {}
  async ensureDir(): Promise<void> {}

  private async track<T>(fn: () => Promise<T>): Promise<T> {
    this.active += 1;
    this.maxActive = Math.max(this.maxActive, this.active);
    await new Promise((r) => setTimeout(r, 20));
    try {
      return await fn();
    } finally {
      this.active -= 1;
    }
  }
}

describe('QueuedRemoteClient', () => {
  it('serializes concurrent list calls', async () => {
    const inner = new SlowMockClient();
    const client = new QueuedRemoteClient(inner);

    await Promise.all([client.list('/a'), client.list('/b')]);
    expect(inner.maxActive).toBe(1);
  });

  it('delegates upload and ensureDir through the queue', async () => {
    const inner = new SlowMockClient();
    const client = new QueuedRemoteClient(inner);

    await Promise.all([
      client.upload('/local/a.txt', '/remote/a.txt'),
      client.ensureDir('/remote/dir'),
    ]);
    expect(inner.maxActive).toBe(1);
  });
});
