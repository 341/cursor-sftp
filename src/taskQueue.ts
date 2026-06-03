/** Serialize async work so only one task runs at a time (required for basic-ftp). */
export class TaskQueue {
  private tail: Promise<void> = Promise.resolve();

  run<T>(task: () => Promise<T>): Promise<T> {
    const runTask = this.tail.then(task);
    this.tail = runTask.then(
      () => undefined,
      () => undefined,
    );
    return runTask;
  }
}
