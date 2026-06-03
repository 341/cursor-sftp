/** Build a full, readable connection error for dialogs and the output log. */
export function formatConnectionError(err: unknown): string {
  if (!(err instanceof Error)) {
    return String(err);
  }

  const lines: string[] = [err.message];
  const extra = err as Error & {
    code?: string;
    reason?: string;
    errno?: number;
    host?: string;
    port?: number;
  };

  if (extra.code) {
    lines.push(`Code: ${extra.code}`);
  }
  if (extra.reason) {
    lines.push(`Reason: ${extra.reason}`);
  }
  if (extra.errno !== undefined) {
    lines.push(`Errno: ${extra.errno}`);
  }
  if (extra.host) {
    lines.push(`Host: ${extra.host}`);
  }
  if (extra.port !== undefined) {
    lines.push(`Port: ${extra.port}`);
  }

  if (err.stack) {
    lines.push('', 'Stack trace:', err.stack);
  }

  return lines.join('\n');
}

export function isCertificateTrustError(err: unknown): boolean {
  const text = formatConnectionError(err).toLowerCase();
  return (
    text.includes('hostname/ip does not match') ||
    text.includes("does not match certificate's altnames") ||
    text.includes('altnames') ||
    text.includes('unable to verify the first certificate') ||
    text.includes('self signed certificate') ||
    text.includes('certificate has expired') ||
    text.includes('unable to get local issuer certificate') ||
    text.includes('err_tls_cert_altname_invalid') ||
    text.includes('err_ssl')
  );
}

export class ConnectionError extends Error {
  readonly detail: string;

  constructor(err: unknown) {
    const detail = formatConnectionError(err);
    super(detail.split('\n')[0] ?? 'Connection failed');
    this.name = 'ConnectionError';
    this.detail = detail;
  }
}
