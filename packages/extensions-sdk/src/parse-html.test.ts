import { describe, expect, it } from 'vitest';

import { parseHtml, parseHtmlAttr, parseHtmlText, resolveUrl } from './parse-html';

describe('parseHtml', () => {
  it('parses simple document', () => {
    const r = parseHtml('<div id="x">hi</div>');
    expect(r.ok).toBe(true);
    if (r.ok) {
      const t = parseHtmlText(r.value, '#x');
      expect(t.ok).toBe(true);
      if (t.ok) expect(t.value).toBe('hi');
    }
  });

  it('resolves relative url', () => {
    const r = resolveUrl('https://a.com/b/c', '../d');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe('https://a.com/d');
  });
});

describe('parseHtmlAttr', () => {
  it('returns err when attr missing', () => {
    const root = parseHtml('<a href="/x">z</a>');
    expect(root.ok).toBe(true);
    if (root.ok) {
      const r = parseHtmlAttr(root.value, 'a', 'data-missing');
      expect(r.ok).toBe(false);
    }
  });
});
