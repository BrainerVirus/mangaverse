import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { gsap } from 'gsap';
import { fadeIn } from '../helpers/fade.js';
import { slideUp } from '../helpers/slide.js';
import { scaleIn } from '../helpers/scale.js';
import { chromeShow } from '../reader-safe/chrome.js';
import { pageTurn } from '../reader-safe/page-turn.js';
import { settingsDrawerTransition } from '../reader-safe/settings-drawer.js';

vi.mock('gsap', () => ({
  gsap: {
    fromTo: vi.fn(() => ({ then: vi.fn() })),
    to: vi.fn(() => ({ then: vi.fn() })),
    set: vi.fn(() => ({ then: vi.fn() })),
  },
}));

const helperModules = [
  'helpers/fade.ts',
  'helpers/slide.ts',
  'helpers/scale.ts',
  'reader-safe/chrome.ts',
  'reader-safe/page-turn.ts',
  'reader-safe/settings-drawer.ts',
];

describe('motion helpers are hook-free', () => {
  it('helper source files do not import useReducedMotion', () => {
    const srcRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

    for (const modulePath of helperModules) {
      const source = readFileSync(join(srcRoot, modulePath), 'utf8');
      expect(source).not.toContain('useReducedMotion');
      expect(source).not.toContain("from '../hooks/use-reduced-motion.js'");
      expect(source).not.toContain('from "../hooks/use-reduced-motion.js"');
    }
  });

  describe('when called outside a React component', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('fadeIn animates when reducedMotion is false', () => {
      fadeIn('.element', { reducedMotion: false });
      expect(gsap.fromTo).toHaveBeenCalled();
    });

    it('fadeIn snaps when reducedMotion is true', () => {
      fadeIn('.element', { reducedMotion: true });
      expect(gsap.set).toHaveBeenCalledWith('.element', { autoAlpha: 1 });
      expect(gsap.fromTo).not.toHaveBeenCalled();
    });

    it('slideUp accepts reducedMotion without throwing', () => {
      expect(() => slideUp('.element', { reducedMotion: true })).not.toThrow();
    });

    it('scaleIn accepts reducedMotion without throwing', () => {
      expect(() => scaleIn('.element', { reducedMotion: true })).not.toThrow();
    });

    it('chromeShow accepts reducedMotion without throwing', () => {
      expect(() => chromeShow('.element', { reducedMotion: true })).not.toThrow();
    });

    it('pageTurn accepts reducedMotion without throwing', () => {
      expect(() => pageTurn('.element', 'forward', { reducedMotion: true })).not.toThrow();
    });

    it('settingsDrawerTransition accepts reducedMotion without throwing', () => {
      expect(() => settingsDrawerTransition('.element', 'open', { reducedMotion: true })).not.toThrow();
    });
  });
});
