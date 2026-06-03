export type Protocol = 'ftp' | 'sftp';

export interface FtpSftpProfile {
  name: string;
  protocol: Protocol;
  host: string;
  port?: number;
  username: string;
  remotePath?: string;
  localPath?: string;
  privateKeyPath?: string;
  passphrase?: string;
  secure?: boolean;
  ignore?: string[];
}

export interface RemoteEntry {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  modifyTime?: number;
}

export interface RemoteClient {
  readonly profile: FtpSftpProfile;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  list(remotePath: string): Promise<RemoteEntry[]>;
  download(remotePath: string, localPath: string): Promise<void>;
  upload(localPath: string, remotePath: string): Promise<void>;
  mkdir(remotePath: string): Promise<void>;
  ensureDir(remotePath: string): Promise<void>;
}
