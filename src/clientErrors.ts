export function isClientClosedError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return (
    /client is closed/i.test(message) ||
    /another one is still running/i.test(message) ||
    /not connected/i.test(message)
  );
}
