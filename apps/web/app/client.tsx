// Keep first: Zod caches its eval probe on the first parse.
import './lib/zod-jitless.js';
import { StrictMode, startTransition } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { StartClient } from '@tanstack/react-start/client';

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <StartClient />
    </StrictMode>,
  );
});
