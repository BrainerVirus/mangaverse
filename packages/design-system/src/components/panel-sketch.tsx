import { useId, useMemo, useRef } from 'react';
import {
  panelSketchDissolve,
  panelSketchDraw,
  panelSketchParts,
  useGsapContext,
  useReducedMotion,
} from '../motion/index.js';
import { panelSketchLayout, panelSketchPath } from './panel-sketch-layout.js';

export interface PanelSketchProps {
  /** Picks the layout: the same seed always sketches the same page. */
  seed: string;
  /** The page box, in CSS pixels; the sketch fills it. */
  width: number;
  height: number;
  /** Draw on a loop. Off screen it holds the finished drawing still. */
  animate?: boolean;
  /** The real page arrived: the drawing dissolves into it and stays gone. */
  revealed?: boolean;
}

/**
 * A page that has not arrived yet, sketched in ink: panel borders drawn one
 * after another, screentone laid into a few panels, on a gentle loop. It fills
 * its positioned parent and takes no pointer events, so it never changes the
 * page box or the tap zones. The ink is `--stage-ink`, which the reader stage
 * sets for a dark or a light background. Decorative: hidden from assistive
 * technology, which hears the stage's own loading status instead.
 */
export function PanelSketch({
  seed,
  width,
  height,
  animate = true,
  revealed = false,
}: PanelSketchProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  // Whether this sketch was ever on screen before the page arrived: a page
  // that was already there on mount has nothing to dissolve from.
  const shownRef = useRef(false);
  // A later re-run (a resize, a visibility change) must not replay the dissolve.
  const dissolvedRef = useRef(false);
  const reducedMotion = useReducedMotion();
  const toneId = `panel-sketch-tone-${useId().replaceAll(':', '')}`;
  const layout = useMemo(() => panelSketchLayout(seed, width, height), [seed, width, height]);

  useGsapContext(rootRef, () => {
    const root = rootRef.current;
    const parts = root === null ? null : panelSketchParts(root);
    if (root === null || parts === null) return undefined;
    if (revealed) {
      const instant = reducedMotion || !shownRef.current || dissolvedRef.current;
      dissolvedRef.current = true;
      panelSketchDissolve(root, { reducedMotion: instant });
      return undefined;
    }
    shownRef.current = true;
    const timeline = panelSketchDraw(parts, {
      reducedMotion,
      animate,
      clock: performance.now() / 1000,
    });
    // The loop never ends on its own: stop it with the context, whatever owns the timeline.
    return () => {
      timeline?.revert();
      timeline?.kill();
    };
    // Once revealed nothing restarts it: the page box settling to the real image's shape (or a
    // visibility change) must not cut the dissolve short.
  }, [revealed ? null : layout, revealed ? false : animate, revealed, reducedMotion]);

  return (
    <div
      ref={rootRef}
      data-panel-sketch=""
      data-sketch-kind={layout.kind}
      data-sketch-animate={animate && !revealed && !reducedMotion ? '' : undefined}
      className="pointer-events-none absolute inset-0"
      aria-hidden="true"
    >
      <svg
        className="block size-full"
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        preserveAspectRatio="none"
        focusable="false"
      >
        <defs>
          <pattern id={toneId} width="6" height="6" patternUnits="userSpaceOnUse">
            <circle cx="3" cy="3" r="1.1" className="fill-stage-ink/35" />
          </pattern>
        </defs>
        <g data-sketch-drawing="">
          {layout.panels.map((panel, index) =>
            panel.tone ? (
              <path
                // oxlint-disable-next-line react/no-array-index-key -- panels are positional: the layout never reorders them
                key={`tone-${index}`}
                data-sketch-tone=""
                d={panelSketchPath(panel)}
                fill={`url(#${toneId})`}
              />
            ) : null,
          )}
          {layout.panels.map((panel, index) => (
            <path
              // oxlint-disable-next-line react/no-array-index-key -- panels are positional: the layout never reorders them
              key={`stroke-${index}`}
              data-sketch-stroke=""
              d={panelSketchPath(panel)}
              pathLength={1}
              fill="none"
              className="stroke-stage-ink/55"
              strokeWidth={1.5}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}
        </g>
      </svg>
    </div>
  );
}
