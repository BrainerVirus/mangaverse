import { useRef, useCallback, type ReactNode } from 'react';
import { useGSAP } from '@gsap/react';
import { gsap } from 'gsap';
import { Maximize2, Settings, SkipBack, SkipForward } from 'lucide-react';
import { cn } from '../lib/cn.js';
import { chromeShow, chromeHide } from '@app/motion';
import { useReducedMotion } from '@app/motion';
import { Button } from './ui/button.js';
import { ReaderProgressRail } from './reader-progress-rail.js';
import { Badge } from './ui/badge.js';

export type ReaderMode = 'single' | 'double' | 'scroll' | 'webtoon';

export interface ReaderChromeProps {
  visible: boolean;
  chapterTitle?: string;
  currentPage: number;
  totalPages: number;
  onPageChange?: (page: number) => void;
  mode?: ReaderMode;
  onModeChange?: (mode: ReaderMode) => void;
  onOpenSettings?: () => void;
  onToggleFullscreen?: () => void;
  /** Small page thumbnail for the rail's hover/drag preview. */
  renderPagePreview?: (page: number) => ReactNode;
  /** Ref for the settings button so sheets can restore focus to it on close. */
  settingsButtonRef?: React.Ref<HTMLButtonElement>;
}

const readerModes: { value: ReaderMode; label: string }[] = [
  { value: 'single', label: 'Single' },
  { value: 'double', label: 'Double' },
  { value: 'scroll', label: 'Scroll' },
];

export function ReaderChrome({
  visible,
  chapterTitle,
  currentPage,
  totalPages,
  onPageChange,
  mode = 'single',
  onModeChange,
  onOpenSettings,
  onToggleFullscreen,
  renderPagePreview,
  settingsButtonRef,
}: ReaderChromeProps) {
  const ref = useRef<HTMLDivElement>(null);
  const modeBarRef = useRef<HTMLDivElement>(null);
  const modeHighlightRef = useRef<HTMLDivElement>(null);
  const modeButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const reducedMotion = useReducedMotion();

  // The active-mode pill morphs between options instead of blinking: one
  // highlight element is tweened to the active button's box (transform + width).
  useGSAP(
    () => {
      const highlight = modeHighlightRef.current;
      const active = mode ? modeButtonRefs.current[mode] : null;
      const bar = modeBarRef.current;
      if (!highlight || !active || !bar) return;
      const barRect = bar.getBoundingClientRect();
      const rect = active.getBoundingClientRect();
      const x = rect.left - barRect.left;
      if (reducedMotion) {
        gsap.set(highlight, { x, width: rect.width, autoAlpha: 1 });
        return;
      }
      gsap.to(highlight, {
        x,
        width: rect.width,
        autoAlpha: 1,
        duration: 0.28,
        ease: 'power3.out',
      });
    },
    { scope: modeBarRef, dependencies: [mode, reducedMotion] },
  );

  useGSAP(
    () => {
      if (!ref.current) return;

      if (visible) {
        chromeShow(ref.current, { reducedMotion });
      } else {
        chromeHide(ref.current, { reducedMotion });
      }
    },
    { scope: ref, dependencies: [visible, reducedMotion] },
  );

  const handlePrevious = useCallback(() => {
    if (currentPage > 1 && onPageChange) {
      onPageChange(currentPage - 1);
    }
  }, [currentPage, onPageChange]);

  const handleNext = useCallback(() => {
    if (currentPage < totalPages && onPageChange) {
      onPageChange(currentPage + 1);
    }
  }, [currentPage, totalPages, onPageChange]);

  return (
    <div
      ref={ref}
      className={cn(
        'fixed inset-x-0 top-0 z-50 flex flex-col bg-gradient-to-b from-black/80 to-transparent',
        'opacity-0',
      )}
      style={{ pointerEvents: visible ? 'auto' : 'none' }}
      role="toolbar"
      aria-label="Reader controls"
    >
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          {chapterTitle && <span className="text-sm font-medium text-white">{chapterTitle}</span>}
          <Badge variant="secondary" className="bg-white/20 text-white">
            {currentPage} / {totalPages}
          </Badge>
        </div>

        <div className="flex items-center gap-2">
          {mode && onModeChange && (
            <div
              ref={modeBarRef}
              className="relative flex items-center gap-1 rounded-full bg-white/10 p-1"
            >
              <div
                ref={modeHighlightRef}
                aria-hidden
                className="pointer-events-none absolute top-1 bottom-1 left-0 rounded-full bg-white opacity-0"
                style={{ width: 0 }}
              />
              {readerModes.map((m) => (
                <button
                  key={m.value}
                  ref={(node) => {
                    modeButtonRefs.current[m.value] = node;
                  }}
                  onClick={() => onModeChange(m.value)}
                  className={cn(
                    'relative z-10 rounded-full px-3 py-1 text-xs font-medium transition-colors',
                    mode === m.value ? 'text-black' : 'text-white/70 hover:text-white',
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>
          )}
          <Button
            size="icon"
            variant="ghost"
            className="text-white hover:bg-white/20"
            aria-label="Settings"
            onClick={onOpenSettings}
            ref={settingsButtonRef}
          >
            <Settings className="h-5 w-5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="text-white hover:bg-white/20"
            aria-label="Maximize"
            onClick={onToggleFullscreen}
          >
            <Maximize2 className="h-5 w-5" />
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-between px-4 py-2">
        <Button
          size="icon"
          variant="ghost"
          onClick={handlePrevious}
          disabled={currentPage <= 1}
          className="text-white hover:bg-white/20 disabled:opacity-30"
          aria-label="Previous page"
        >
          <SkipBack className="h-5 w-5" />
        </Button>

        <div className="flex flex-1 items-center gap-4 px-4">
          <span className="text-xs text-white/70">{currentPage}</span>
          <ReaderProgressRail
            value={currentPage}
            min={1}
            max={totalPages}
            onChange={(next) => onPageChange?.(next)}
            reducedMotion={reducedMotion}
            {...(renderPagePreview !== undefined ? { renderPreview: renderPagePreview } : {})}
          />
          <span className="text-xs text-white/70">{totalPages}</span>
        </div>

        <Button
          size="icon"
          variant="ghost"
          onClick={handleNext}
          disabled={currentPage >= totalPages}
          className="text-white hover:bg-white/20 disabled:opacity-30"
          aria-label="Next page"
        >
          <SkipForward className="h-5 w-5" />
        </Button>
      </div>
    </div>
  );
}
