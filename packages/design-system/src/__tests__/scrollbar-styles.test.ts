// @vitest-environment node
// Node (not jsdom) so `import.meta.url` is a file URL: the check pins the CSS
// recipe in the stylesheet itself, next to the tokens it consumes.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../styles/globals.css', import.meta.url), 'utf8');

describe('scrollbar recipe', () => {
  it('derives the idle thumb from the theme instead of hard-coding a colour', () => {
    expect(css).toMatch(
      /--scrollbar-thumb:\s*color-mix\(in oklab, var\(--muted-foreground\) 65%, transparent\)/,
    );
    expect(css).toMatch(/--scrollbar-thumb-hover:\s*var\(--muted-foreground\)/);
    // A literal grey or a fixed `--border` here would drop every custom theme.
    expect(css).not.toMatch(/scrollbar-color:\s*#[0-9a-f]{3,8}/i);
  });

  it('keeps the native bar thin with a transparent track', () => {
    // `scrollbar-color` inherits, but Chromium computes `scrollbar-width: auto`
    // on a nested scroller when the thin width only sits on `html`.
    expect(css).toMatch(/\*\s*\{\s*scrollbar-width:\s*thin;/);
    expect(css).toContain('scrollbar-color: var(--scrollbar-thumb) transparent;');
  });

  it('ships the WebKit fallback: 10px bar, inset rounded thumb, transparent track and corner', () => {
    expect(css).toMatch(/::-webkit-scrollbar\s*\{[^}]*width:\s*10px;[^}]*height:\s*10px;/);
    expect(css).toMatch(/::-webkit-scrollbar-track\s*\{[^}]*background-color:\s*transparent;/);
    expect(css).toMatch(/::-webkit-scrollbar-thumb\s*\{[^}]*background-clip:\s*content-box;/);
    expect(css).toMatch(/::-webkit-scrollbar-thumb:hover\s*\{[^}]*--scrollbar-thumb-hover/);
    expect(css).toMatch(/::-webkit-scrollbar-corner\s*\{[^}]*background-color:\s*transparent;/);
  });

  it('strengthens the bar when the user asks for more contrast', () => {
    expect(css).toMatch(
      /prefers-contrast: more\)\s*\{\s*html\s*\{[^}]*scrollbar-color:\s*var\(--foreground\) var\(--background\)/,
    );
  });

  it('reserves the page gutter only on md+, so a short page cannot shift a long one', () => {
    expect(css).toMatch(
      /@media \(width >= 48rem\)\s*\{\s*\[data-app-shell\] > main\s*\{\s*scrollbar-gutter:\s*stable;/,
    );
    expect(css).not.toMatch(/html\s*\{[^}]*scrollbar-gutter:\s*stable/);
  });
});
