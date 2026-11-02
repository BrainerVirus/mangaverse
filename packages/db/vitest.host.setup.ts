import { afterAll } from 'vitest';
import { hostCallCount, hostHarnessCount } from './src/testing/host-harness.js';

// Reach check: a file that opened a harness must have sent repository calls over the port.
// Were the routing plugin bypassed, the calls would run in-process and this would count none.
afterAll(() => {
  if (hostHarnessCount() > 0 && hostCallCount() === 0) {
    throw new Error('No repository call crossed the data host.');
  }
});
