import { describe, expect, it } from 'vitest';
import { isClientClosedError } from '../src/clientErrors';

describe('isClientClosedError', () => {
  it('detects basic-ftp concurrent task errors', () => {
    expect(
      isClientClosedError(
        new Error(
          "Client is closed because User launched a task while another one is still running. Forgot to use 'await' or '.then()'?",
        ),
      ),
    ).toBe(true);
  });

  it('detects generic closed connection messages', () => {
    expect(isClientClosedError(new Error('Client is closed'))).toBe(true);
    expect(isClientClosedError(new Error('not connected'))).toBe(true);
  });
});
