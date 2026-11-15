import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { gsap } from 'gsap';
import { skeletonReveal } from '../shell/skeleton-reveal.js';
import { useSkeletonReveal } from '../hooks/use-skeleton-reveal.js';
import { setInAppReducedMotionPreference } from '../utils/reduced-motion-preference.js';

function Page({ loading }: { loading: boolean }) {
  const ref = useSkeletonReveal(loading);
  return <div ref={ref}>{loading ? <span data-skeleton /> : <p>Content</p>}</div>;
}

describe('skeleton reveal', () => {
  beforeEach(() => {
    setInAppReducedMotionPreference(false);
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    setInAppReducedMotionPreference(false);
  });

  it('fades content up from half-drawn, never from nothing', () => {
    const fromTo = vi.spyOn(gsap, 'fromTo');
    const target = document.createElement('div');
    skeletonReveal(target);
    expect(fromTo).toHaveBeenCalledWith(
      target,
      { opacity: 0.5 },
      expect.objectContaining({ opacity: 1, duration: 0.14, clearProps: 'opacity' }),
    );
  });

  it('does not animate under reduced motion', () => {
    const fromTo = vi.spyOn(gsap, 'fromTo');
    expect(skeletonReveal(document.createElement('div'), { reducedMotion: true })).toBeNull();
    expect(fromTo).not.toHaveBeenCalled();
  });

  it('Given a skeleton, When the content replaces it, Then the content fades in once', () => {
    const fromTo = vi.spyOn(gsap, 'fromTo');
    const { rerender } = render(<Page loading />);
    expect(fromTo).not.toHaveBeenCalled();
    rerender(<Page loading={false} />);
    expect(fromTo).toHaveBeenCalledTimes(1);
    rerender(<Page loading={false} />);
    expect(fromTo).toHaveBeenCalledTimes(1);
  });

  it('Given content ready on the first render (a warm cache), Then it shows as it is', () => {
    const fromTo = vi.spyOn(gsap, 'fromTo');
    render(<Page loading={false} />);
    expect(fromTo).not.toHaveBeenCalled();
  });

  it('Given reduced motion, When the content replaces the skeleton, Then nothing animates', () => {
    setInAppReducedMotionPreference(true);
    const fromTo = vi.spyOn(gsap, 'fromTo');
    const { rerender } = render(<Page loading />);
    rerender(<Page loading={false} />);
    expect(fromTo).not.toHaveBeenCalled();
  });
});
