import * as z from 'zod';

/**
 * Electron's production CSP has no `unsafe-eval`; without jitless, Zod's first
 * parse fires a caught `new Function()` probe that still reports a CSP violation.
 */
z.config({ jitless: true });
