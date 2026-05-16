import type { AppResult } from '@app/shared';
import { createAppError, err, ok } from '@app/shared';
import { parse, type HTMLElement } from 'node-html-parser';

export type ParsedHtmlRoot = HTMLElement;

export function parseHtml(html: string): AppResult<ParsedHtmlRoot> {
  try {
    const root = parse(html, { lowerCaseTagName: true });
    return ok(root);
  } catch (e) {
    return err(
      createAppError({
        code: 'extensions.sdk.parse.invalid_html',
        message: 'Could not parse HTML.',
        cause: e,
      }),
    );
  }
}

export function parseHtmlText(node: HTMLElement, selector?: string): AppResult<string> {
  const target = selector ? node.querySelector(selector) : node;
  if (!target) {
    return err(
      createAppError({
        code: 'extensions.sdk.parse.missing_node',
        message: 'Selector matched no nodes.',
        details: { selector: selector ?? '' },
      }),
    );
  }
  return ok(target.text.trim());
}

export function parseHtmlAttr(node: HTMLElement, selector: string, attr: string): AppResult<string> {
  const el = node.querySelector(selector);
  if (!el) {
    return err(
      createAppError({
        code: 'extensions.sdk.parse.missing_node',
        message: 'Selector matched no nodes.',
        details: { selector },
      }),
    );
  }
  const v = el.getAttribute(attr);
  if (v == null || v === '') {
    return err(
      createAppError({
        code: 'extensions.sdk.parse.missing_attr',
        message: 'Attribute missing on selected node.',
        details: { selector, attr },
      }),
    );
  }
  return ok(v);
}

export function resolveUrl(baseUrl: string, href: string): AppResult<string> {
  try {
    const resolved = new URL(href, baseUrl).toString();
    return ok(resolved);
  } catch (e) {
    return err(
      createAppError({
        code: 'extensions.sdk.parse.bad_url',
        message: 'Could not resolve URL.',
        cause: e,
        details: { baseUrl, href },
      }),
    );
  }
}

export function querySelectorAllNodes(root: HTMLElement, selector: string): readonly HTMLElement[] {
  return root.querySelectorAll(selector) as unknown as HTMLElement[];
}
