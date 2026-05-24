/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import { findScrollParent } from './find-scroll-parent.js';

describe('findScrollParent', () => {
  it('returns the nearest ancestor with overflow auto or scroll', () => {
    const root = document.createElement('div');
    const scrollContainer = document.createElement('main');
    const content = document.createElement('section');
    const target = document.createElement('div');

    scrollContainer.style.overflow = 'auto';
    root.append(scrollContainer);
    scrollContainer.append(content);
    content.append(target);
    document.body.append(root);

    expect(findScrollParent(target)).toBe(scrollContainer);

    root.remove();
  });

  it('returns null when no scrollable ancestor exists', () => {
    const root = document.createElement('div');
    const target = document.createElement('div');

    root.append(target);
    document.body.append(root);

    expect(findScrollParent(target)).toBeNull();

    root.remove();
  });
});
