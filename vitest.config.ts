import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      vscode: path.join(rootDir, 'test/mocks/vscode.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: [
        'src/connectionErrors.ts',
        'src/clientErrors.ts',
        'src/taskQueue.ts',
        'src/sync.ts',
        'src/queuedClient.ts',
        'src/profiles.ts',
        'src/sftpJsonConfig.ts',
        'src/trustStore.ts',
      ],
      thresholds: {
        lines: 60,
        functions: 50,
        branches: 55,
        statements: 60,
      },
    },
  },
});
