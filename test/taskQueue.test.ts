import { describe, expect, it } from 'vitest';
import { TaskQueue } from '../src/taskQueue';

describe('TaskQueue', () => {
  it('runs tasks sequentially', async () => {
    const queue = new TaskQueue();
    const order: number[] = [];

    const first = queue.run(async () => {
      await delay(30);
      order.push(1);
    });
    const second = queue.run(async () => {
      order.push(2);
    });

    await Promise.all([first, second]);
    expect(order).toEqual([1, 2]);
  });

  it('propagates errors without breaking the queue', async () => {
    const queue = new TaskQueue();

    await expect(
      queue.run(async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    await expect(queue.run(async () => 'ok')).resolves.toBe('ok');
  });
});

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
