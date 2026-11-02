import { cn } from '@app/design-system';

import { LocalDbErrorBanner, PersistenceErrorBanner } from './PersistenceErrorBanner.js';
import { RendererImportBanner } from './RendererImportBanner.js';

/**
 * One in-flow notice stack shared by the shell and the reader. The banners used
 * to be fixed overlays at the top of the viewport, which covered the page header
 * and the first row of content at 390px and 1440px. Sticky keeps each notice
 * visible while scrolling without ever painting over the header.
 */
export function AppNotices({ className }: { readonly className?: string }) {
  return (
    <div
      data-app-notices
      className={cn('sticky top-0 z-40 flex shrink-0 flex-col gap-2', className)}
    >
      <LocalDbErrorBanner />
      <RendererImportBanner />
      <PersistenceErrorBanner />
    </div>
  );
}
