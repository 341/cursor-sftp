import { TaskQueue } from './taskQueue';
import { FtpSftpProfile, RemoteClient, RemoteEntry } from './types';

/** Wraps a remote client so FTP/SFTP commands never overlap on the same connection. */
export class QueuedRemoteClient implements RemoteClient {
  readonly profile: FtpSftpProfile;
  private readonly queue = new TaskQueue();

  constructor(private readonly inner: RemoteClient) {
    this.profile = inner.profile;
  }

  connect(): Promise<void> {
    return this.queue.run(() => this.inner.connect());
  }

  disconnect(): Promise<void> {
    return this.queue.run(() => this.inner.disconnect());
  }

  list(remotePath: string): Promise<RemoteEntry[]> {
    return this.queue.run(() => this.inner.list(remotePath));
  }

  download(remotePath: string, localPath: string): Promise<void> {
    return this.queue.run(() => this.inner.download(remotePath, localPath));
  }

  upload(localPath: string, remotePath: string): Promise<void> {
    return this.queue.run(() => this.inner.upload(localPath, remotePath));
  }

  mkdir(remotePath: string): Promise<void> {
    return this.queue.run(() => this.inner.mkdir(remotePath));
  }

  ensureDir(remotePath: string): Promise<void> {
    return this.queue.run(() => this.inner.ensureDir(remotePath));
  }
}
