import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import * as React from 'react';
import { GlassSurface } from '../components/glass-surface.js';
import {
  GLASS_BLUR_BUDGET,
  glassElevations,
  glassLevels,
  type GlassElevation,
  type GlassLevel,
} from '../components/glass-variants.js';
import { GlassPanel } from '../components/glass-panel.js';
import { RefractionLayer } from '../components/refraction-layer.js';
import { AmbientBackdrop } from '../components/ambient-backdrop.js';
import { resolveGlassProfile } from '../lib/glass-profile.js';
import { setInAppReducedMotionPreference } from '@app/motion';

const TIERS = ['thin', 'regular', 'thick', 'stage'] as const;
const ELEVATIONS = [0, 1, 2, 3, 4] as const;
const EXPECTED_LEVELS: Record<GlassLevel, string> = {
  thin: 'glass-thin',
  regular: 'glass-regular',
  thick: 'glass-thick',
  stage: 'glass-stage',
};
const EXPECTED_ELEVATIONS: Record<GlassElevation, string> = {
  0: '',
  1: 'shadow-sm',
  2: 'shadow-md',
  3: 'shadow-lg',
  4: 'shadow-xl',
};
const originalMatchMedia = Object.getOwnPropertyDescriptor(window, 'matchMedia');

function resetGlassPreferences(): void {
  setInAppReducedMotionPreference(false);
  vi.unstubAllGlobals();
  delete document.documentElement.dataset.glass;
  delete document.documentElement.dataset.transparency;
  if (originalMatchMedia) {
    Object.defineProperty(window, 'matchMedia', originalMatchMedia);
  } else {
    Reflect.deleteProperty(window, 'matchMedia');
  }
}

function allowFullGlassProfile(
  supports: (property: string, value: string) => boolean = () => true,
): void {
  document.documentElement.dataset.glass = 'full';
  vi.stubGlobal('CSS', { supports: vi.fn<(property: string, value: string) => boolean>(supports) });
}

describe('GlassSurface', () => {
  afterEach(() => {
    cleanup();
    resetGlassPreferences();
  });

  it.each(TIERS)('renders the %s tier class and marks its tier', (level) => {
    const { container } = render(<GlassSurface level={level} />);
    const surface = container.firstElementChild!;

    expect(surface).toHaveClass(glassLevels({ level }));
    expect(surface).toHaveAttribute('data-glass-tier', level);
  });

  it('defaults to the regular tier with the §2.4 elevation per tier', () => {
    const { container } = render(<GlassSurface />);
    expect(container.firstElementChild).toHaveClass('glass-regular', 'shadow-md');
  });

  it.each(TIERS)('gives %s glass its tier elevation by default', (level) => {
    const { container } = render(<GlassSurface level={level} />);
    const surface = container.firstElementChild!;
    const defaults: Record<(typeof TIERS)[number], string> = {
      thin: 'shadow-sm',
      regular: 'shadow-md',
      thick: 'shadow-xl',
      stage: '',
    };

    for (const className of ['shadow-sm', 'shadow-md', 'shadow-lg', 'shadow-xl']) {
      expect(surface.classList.contains(className), `${level} -> ${className}`).toBe(
        className === defaults[level],
      );
    }
  });

  it('honours an explicit elevation over the tier default', () => {
    const { container } = render(<GlassSurface level="thick" elevation={1} />);
    const surface = container.firstElementChild!;

    expect(surface).toHaveClass(glassElevations({ elevation: 1 }));
    expect(surface).not.toHaveClass(glassElevations({ elevation: 4 }));
  });

  it.each(TIERS.flatMap((level) => ELEVATIONS.map((elevation) => [level, elevation] as const)))(
    'Given %s glass at elevation %i, When rendered, Then it keeps the established tier/elevation classes',
    (level, elevation) => {
      const { container } = render(<GlassSurface level={level} elevation={elevation} />);
      const surface = container.firstElementChild!;
      const expectedElevation = EXPECTED_ELEVATIONS[elevation];

      expect(glassLevels({ level })).toBe(EXPECTED_LEVELS[level]);
      expect(glassElevations({ elevation })).toBe(expectedElevation);
      expect(surface).toHaveClass(
        EXPECTED_LEVELS[level],
        ...(expectedElevation ? [expectedElevation] : []),
      );
    },
  );

  it('renders the §2.2 refraction layer, hidden and non-interactive', () => {
    const { container } = render(
      <GlassSurface>
        <span>content</span>
      </GlassSurface>,
    );
    const layer = container.querySelector('[data-refraction="sheen"]')!;

    expect(layer).toBeTruthy();
    expect(layer).toHaveAttribute('aria-hidden', 'true');
    expect(layer).toHaveClass('glass-refraction', 'glass-refraction-edge');
    expect(screen.getByText('content')).toBeInTheDocument();
  });

  it('lets a surface opt into displacement while keeping sheen as the default', () => {
    allowFullGlassProfile();
    const { container, rerender } = render(<GlassSurface refraction="displacement" />);
    const surface = container.querySelector<HTMLDivElement>('[data-glass-tier]')!;
    const layer = surface.querySelector<HTMLDivElement>('[data-refraction="displacement"]')!;
    const filter = layer.querySelector<SVGFilterElement>('filter')!;

    expect(surface).toHaveAttribute('data-refraction-surface', 'displacement');
    expect(surface.style.getPropertyValue('--glass-refraction-filter')).toBe(`url(#${filter.id})`);
    expect(layer).not.toHaveClass('glass-refraction-displacement');
    expect(layer.style.getPropertyValue('--glass-refraction-filter')).toBe('');

    rerender(<GlassSurface />);
    const defaultSurface = container.querySelector<HTMLDivElement>('[data-glass-tier]')!;
    expect(defaultSurface).not.toHaveAttribute('data-refraction-surface');
    expect(defaultSurface.style.getPropertyValue('--glass-refraction-filter')).toBe('');
    expect(defaultSurface.querySelector('[data-refraction="sheen"]')).toBeInTheDocument();
    expect(container.querySelector('filter')).toBeNull();
  });

  it('omits displacement wiring from the surface when reduced motion is enabled', () => {
    allowFullGlassProfile();
    setInAppReducedMotionPreference(true);
    const { container } = render(<GlassSurface refraction="displacement" />);
    const surface = container.querySelector<HTMLDivElement>('[data-glass-tier]')!;

    expect(surface).not.toHaveAttribute('data-refraction-surface');
    expect(surface.style.getPropertyValue('--glass-refraction-filter')).toBe('');
    expect(surface.querySelector('[data-refraction="sheen"]')).toBeInTheDocument();
    expect(surface.querySelector('filter')).toBeNull();
  });

  it.each([
    ['data-glass', 'cheap'],
    ['data-transparency', 'solid'],
  ])('omits surface displacement when %s is %s', (attribute, value) => {
    if (attribute === 'data-transparency') allowFullGlassProfile();
    document.documentElement.setAttribute(attribute, value);
    const { container } = render(<GlassSurface refraction="displacement" />);
    const surface = container.querySelector<HTMLDivElement>('[data-glass-tier]')!;

    expect(surface).not.toHaveAttribute('data-refraction-surface');
    expect(surface.style.getPropertyValue('--glass-refraction-filter')).toBe('');
    expect(surface.querySelector('[data-refraction="sheen"]')).toBeInTheDocument();
    expect(surface.querySelector('filter')).toBeNull();
  });

  it('renders unique filter definitions only for the explicit displacement variant', () => {
    allowFullGlassProfile();
    const { container } = render(
      <>
        <RefractionLayer variant="displacement" />
        <RefractionLayer variant="displacement" />
        <RefractionLayer />
      </>,
    );
    const layers = container.querySelectorAll<HTMLDivElement>('[data-refraction="displacement"]');
    const filters = [...container.querySelectorAll<SVGFilterElement>('filter')];
    const ids = filters.map((filter) => filter.id);

    expect(layers).toHaveLength(2);
    expect(filters).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
    for (const [index, layer] of [...layers].entries()) {
      expect(layer).toHaveAttribute('aria-hidden', 'true');
      expect(layer).toHaveClass('glass-refraction', 'glass-refraction-edge');
      expect(layer).not.toHaveClass('glass-refraction-displacement');
      expect(layer.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
      expect(layer.style.getPropertyValue('--glass-refraction-filter')).toBe('');
      expect(ids[index]).toBeTruthy();
      expect(layer.querySelector('feTurbulence')).toBeInTheDocument();
      expect(layer.querySelector('feDisplacementMap')).toBeInTheDocument();
    }
    expect(container.querySelector('[data-refraction="sheen"] svg')).toBeNull();
  });

  it('falls back to the unchanged sheen when reduced motion is enabled in-app', () => {
    allowFullGlassProfile();
    setInAppReducedMotionPreference(true);
    const { container } = render(<RefractionLayer variant="displacement" />);

    expect(container.firstElementChild).toHaveAttribute('data-refraction', 'sheen');
    expect(container.querySelector('filter')).toBeNull();
  });

  it.each([
    ['data-glass', 'cheap'],
    ['data-transparency', 'solid'],
  ])('falls back to sheen when %s is %s', (attribute, value) => {
    if (attribute === 'data-transparency') allowFullGlassProfile();
    document.documentElement.setAttribute(attribute, value);
    const { container } = render(<RefractionLayer variant="displacement" />);

    expect(container.firstElementChild).toHaveAttribute('data-refraction', 'sheen');
    expect(container.querySelector('filter')).toBeNull();
  });

  it('falls back to sheen when the OS requests reduced transparency', () => {
    allowFullGlassProfile();
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn<
        (media: string) => {
          matches: boolean;
          media: string;
          addEventListener: () => void;
          removeEventListener: () => void;
        }
      >((media) => ({
        matches: media === '(prefers-reduced-transparency: reduce)',
        media,
        addEventListener: () => {},
        removeEventListener: () => {},
      })),
    });
    const { container } = render(
      <>
        <GlassSurface refraction="displacement" />
        <RefractionLayer variant="displacement" />
      </>,
    );
    const surface = container.querySelector<HTMLDivElement>('[data-glass-tier]')!;

    expect(surface).not.toHaveAttribute('data-refraction-surface');
    expect(surface.style.getPropertyValue('--glass-refraction-filter')).toBe('');
    expect(surface.querySelector('[data-refraction="sheen"]')).toBeInTheDocument();
    expect(container.querySelectorAll('filter')).toHaveLength(0);
  });

  it('falls back to sheen when the browser cannot support SVG backdrop filters', () => {
    allowFullGlassProfile(() => false);
    const { container } = render(<GlassSurface refraction="displacement" />);
    const surface = container.querySelector<HTMLDivElement>('[data-glass-tier]')!;

    expect(surface).not.toHaveAttribute('data-refraction-surface');
    expect(surface.style.getPropertyValue('--glass-refraction-filter')).toBe('');
    expect(surface.querySelector('[data-refraction="sheen"]')).toBeInTheDocument();
    expect(surface.querySelector('filter')).toBeNull();
  });

  it('falls back to sheen when the OS requests reduced motion', () => {
    allowFullGlassProfile();
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn<(media: string) => MediaQueryList>((media) => ({
        matches: media === '(prefers-reduced-motion: reduce)',
        media,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      })),
    });
    const { container } = render(<GlassSurface refraction="displacement" />);
    const surface = container.querySelector<HTMLDivElement>('[data-glass-tier]')!;

    expect(surface).not.toHaveAttribute('data-refraction-surface');
    expect(surface.style.getPropertyValue('--glass-refraction-filter')).toBe('');
    expect(surface.querySelector('[data-refraction="sheen"]')).toBeInTheDocument();
    expect(surface.querySelector('filter')).toBeNull();
  });

  it('keeps displacement when only the prefixed backdrop filter is supported', () => {
    allowFullGlassProfile((property) => property === '-webkit-backdrop-filter');
    const { container } = render(<GlassSurface refraction="displacement" />);
    const surface = container.querySelector<HTMLDivElement>('[data-glass-tier]')!;
    const filter = surface.querySelector<SVGFilterElement>('filter')!;

    expect(surface).toHaveAttribute('data-refraction-surface', 'displacement');
    expect(surface.style.getPropertyValue('--glass-refraction-filter')).toBe(`url(#${filter.id})`);
  });

  it('drops the hairline when edge is false but keeps the light', () => {
    const { container } = render(<GlassSurface edge={false} />);
    const layer = container.querySelector('[data-refraction="sheen"]')!;

    expect(layer).toHaveClass('glass-refraction');
    expect(layer).not.toHaveClass('glass-refraction-edge');
  });

  it('renders the §3.5 plate layer only when asked', () => {
    const { container, rerender } = render(<GlassSurface plate />);
    const plate = container.querySelector('[data-glass-plate]')!;

    expect(plate).toHaveClass('glass-plate', 'pointer-events-none', '-z-10');
    expect(plate).toHaveAttribute('aria-hidden', 'true');

    rerender(<GlassSurface />);
    expect(container.querySelector('[data-glass-plate]')).toBeNull();
  });

  it('resolves the opaque tone for the cheap profile', () => {
    const { container } = render(<GlassSurface level="thin" tone="reader" />);
    expect(container.firstElementChild).toHaveAttribute('data-glass-tone', 'reader');
  });

  it('allows a thin tint inside a glass panel (§2.5 exception)', () => {
    const { container } = render(
      <GlassSurface level="thick">
        <GlassSurface level="thin" />
      </GlassSurface>,
    );
    expect(container.querySelectorAll('.glass-thin')).toHaveLength(1);
  });

  it('allows a panel inside thin glass', () => {
    const { container } = render(
      <GlassSurface level="thin">
        <GlassSurface level="regular" />
      </GlassSurface>,
    );
    expect(container.querySelectorAll('.glass-regular')).toHaveLength(1);
  });

  it.each([
    ['regular', 'thick'],
    ['thick', 'stage'],
    ['stage', 'regular'],
  ] as const)('refuses %s glass inside %s glass (§2.5)', (inner, outer) => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() =>
      render(
        <GlassSurface level={outer}>
          <GlassSurface level={inner} />
        </GlassSurface>,
      ),
    ).toThrow(/never nest/);

    error.mockRestore();
  });

  it('states the §2.5 blur budgets', () => {
    expect(GLASS_BLUR_BUDGET).toEqual({
      reader: { resting: 1, transients: 3, sheet: 4 },
      shell: { normal: 2, palette: 4 },
    });
  });
});

describe('GlassPanel', () => {
  afterEach(() => {
    cleanup();
    resetGlassPreferences();
  });

  it('composes the glass material with panel padding', () => {
    const { container } = render(
      <GlassPanel level="regular" padding="md">
        <span>content</span>
      </GlassPanel>,
    );
    const panel = container.firstElementChild!;

    expect(panel).toHaveClass('glass-regular', 'shadow-md', 'p-6');
    expect(screen.getByText('content')).toBeInTheDocument();
  });

  it('carries no padding when padding is none', () => {
    const { container } = render(<GlassPanel padding="none" />);
    expect(container.firstElementChild).not.toHaveClass('p-4');
    expect(container.firstElementChild).not.toHaveClass('p-6');
  });
});

describe('RefractionLayer', () => {
  afterEach(() => {
    cleanup();
    resetGlassPreferences();
  });

  it('is a decorative layer by default', () => {
    const { container } = render(<RefractionLayer />);
    const layer = container.firstElementChild!;

    expect(layer).toHaveAttribute('aria-hidden', 'true');
    expect(layer).toHaveAttribute('data-refraction', 'sheen');
    expect(layer).toHaveClass('glass-refraction', 'glass-refraction-edge');
  });
});

describe('AmbientBackdrop', () => {
  afterEach(() => {
    cleanup();
    resetGlassPreferences();
  });

  it('is a fixed, decorative band', () => {
    allowFullGlassProfile();
    const { container } = render(<AmbientBackdrop />);
    const band = container.firstElementChild!;

    expect(band).toHaveAttribute('aria-hidden', 'true');
    expect(band).toHaveAttribute('data-ambient-backdrop');
    expect(band).toHaveClass('ambient-backdrop');
  });

  it('runs callback-ref cleanup on unmount', () => {
    const cleanupRef = vi.fn<() => void>();
    const forwardedRef = vi.fn<React.RefCallback<HTMLDivElement>>((node) => {
      if (node !== null) return cleanupRef;
      return undefined;
    });
    const { unmount } = render(<AmbientBackdrop ref={forwardedRef} />);

    expect(forwardedRef).toHaveBeenCalledWith(expect.any(HTMLDivElement));
    unmount();

    expect(cleanupRef).toHaveBeenCalledOnce();
    expect(forwardedRef).toHaveBeenCalledTimes(1);
  });

  it('clears an object ref on unmount', () => {
    const ref = React.createRef<HTMLDivElement>();
    const { unmount } = render(<AmbientBackdrop ref={ref} />);

    expect(ref.current).toBeInstanceOf(HTMLDivElement);
    unmount();

    expect(ref.current).toBeNull();
  });

  it('stays static when reduced motion is enabled in-app', () => {
    allowFullGlassProfile();
    setInAppReducedMotionPreference(true);

    const { container } = render(<AmbientBackdrop />);
    const band = container.querySelector<HTMLDivElement>('[data-ambient-backdrop]');

    expect(band).toBeInTheDocument();
    expect(band?.style.transform).toBe('');
  });

  it('waits for the full glass profile before entering', async () => {
    const { container } = render(<AmbientBackdrop />);
    const band = container.querySelector<HTMLDivElement>('[data-ambient-backdrop]');

    expect(band).toBeInTheDocument();
    expect(band?.style.transform).toBe('');
    allowFullGlassProfile();

    await waitFor(() => expect(band?.style.transform).toContain('translate'));
  });

  it.each([
    ['data-glass', 'cheap'],
    ['data-transparency', 'solid'],
  ])('stays static while %s is %s', (attribute, value) => {
    if (attribute === 'data-transparency') allowFullGlassProfile();
    document.documentElement.setAttribute(attribute, value);

    const { container } = render(<AmbientBackdrop />);
    const band = container.querySelector<HTMLDivElement>('[data-ambient-backdrop]');

    expect(band).toBeInTheDocument();
    expect(band?.style.transform).toBe('');
  });
});

describe('resolveGlassProfile', () => {
  it('stays full on a capable device', () => {
    expect(resolveGlassProfile({ hardwareConcurrency: 8, deviceMemory: 8 })).toBe('full');
    expect(resolveGlassProfile()).toBe('full');
  });

  it('goes cheap on four cores, 4 GB or reduced motion', () => {
    expect(resolveGlassProfile({ hardwareConcurrency: 4 })).toBe('cheap');
    expect(resolveGlassProfile({ deviceMemory: 4 })).toBe('cheap');
    expect(
      resolveGlassProfile({ hardwareConcurrency: 16, deviceMemory: 16, reducedMotion: true }),
    ).toBe('cheap');
  });
});
