import { useRef, useCallback } from 'react';
import { useGSAP } from '@gsap/react';
import { Maximize2, Settings, SkipBack, SkipForward } from 'lucide-react';
import { cn } from '../lib/cn.js';
import { chromeShow, chromeHide } from '@app/motion';
import { useReducedMotion } from '@app/motion';
import { Button } from './ui/button.js';
import { Slider } from './ui/slider.js';
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
}

const readerModes: { value: ReaderMode; label: string }[] = [
  { value: 'single', label: 'Single' },
  { value: 'double', label: 'Double' },
  { value: 'scroll', label: 'Scroll' },
  { value: 'webtoon', label: 'Webtoon' },
];

export function ReaderChrome({
  visible,
  chapterTitle,
  currentPage,
  totalPages,
  onPageChange,
  mode = 'single',
  onModeChange,
}: ReaderChromeProps) {
  const ref = useRef<HTMLDivElement>(null);

  const reducedMotion = useReducedMotion();

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

  const progress = totalPages > 0 ? (currentPage / totalPages) * 100 : 0;

  return (
    <div
      ref={ref}
      className={cn(
        'fixed inset-x-0 top-0 z-50 flex flex-col bg-gradient-to-b from-black/80 to-transparent',
        'opacity-0'
      )}
      style={{ pointerEvents: visible ? 'auto' : 'none' }}
      role="toolbar"
      aria-label="Reader controls"
    >
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          {chapterTitle && (
            <span className="text-sm font-medium text-white">{chapterTitle}</span>
          )}
          <Badge variant="secondary" className="bg-white/20 text-white">
            {currentPage} / {totalPages}
          </Badge>
        </div>

        <div className="flex items-center gap-2">
          {mode && onModeChange && (
            <div className="flex items-center gap-1 rounded-full bg-white/10 p-1">
              {readerModes.map((m) => (
                <button
                  key={m.value}
                  onClick={() => onModeChange(m.value)}
                  className={cn(
                    'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                    mode === m.value ? 'bg-white text-black' : 'text-white/70 hover:text-white'
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>
          )}
          <Button size="icon" variant="ghost" className="text-white hover:bg-white/20" aria-label="Settings">
            <Settings className="h-5 w-5" />
          </Button>
          <Button size="icon" variant="ghost" className="text-white hover:bg-white/20" aria-label="Maximize">
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
          <Slider
            value={String(currentPage)}
            min={1}
            max={totalPages}
            step={1}
            onChange={(e) => {
              const val = parseInt((e.target as HTMLInputElement).value, 10);
              if (onPageChange && !isNaN(val)) {
                onPageChange(val);
              }
            }}
            className="flex-1 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-runnable-track]:bg-white/30"
            aria-label="Page slider"
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

      <div className="mx-4 mb-2 h-1 overflow-hidden rounded-full bg-white/20">
        <div
          className="h-full rounded-full bg-white transition-all duration-150"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}