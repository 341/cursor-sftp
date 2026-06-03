import { describe, expect, it } from 'vitest';
import {
  ConnectionError,
  formatConnectionError,
  isCertificateTrustError,
} from '../src/connectionErrors';

describe('formatConnectionError', () => {
  it('formats Error with code and stack', () => {
    const err = Object.assign(new Error('TLS failed'), {
      code: 'ERR_TLS',
      host: 'example.com',
      port: 21,
    });
    const text = formatConnectionError(err);
    expect(text).toContain('TLS failed');
    expect(text).toContain('Code: ERR_TLS');
    expect(text).toContain('Host: example.com');
    expect(text).toContain('Stack trace:');
  });

  it('stringifies non-Error values', () => {
    expect(formatConnectionError(42)).toBe('42');
  });
});

describe('isCertificateTrustError', () => {
  it('detects hostname altnames mismatch', () => {
    const err = new Error(
      "Hostname/IP does not match certificate's altnames: IP: 1.2.3.4 is not in the cert's list",
    );
    expect(isCertificateTrustError(err)).toBe(true);
  });

  it('returns false for unrelated errors', () => {
    expect(isCertificateTrustError(new Error('ECONNREFUSED'))).toBe(false);
  });
});

describe('ConnectionError', () => {
  it('exposes detail from wrapped error', () => {
    const wrapped = new ConnectionError(new Error('connect timeout'));
    expect(wrapped.message).toBe('connect timeout');
    expect(wrapped.detail).toContain('connect timeout');
    expect(wrapped.name).toBe('ConnectionError');
  });
});
