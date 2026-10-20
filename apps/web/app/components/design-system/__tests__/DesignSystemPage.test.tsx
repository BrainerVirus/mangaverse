import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DesignSystemPage } from '../DesignSystemPage.js';

const requiredSamples = [
  ...(['full', 'reduced'] as const).flatMap((profile) =>
    (['light', 'dark'] as const).flatMap((theme) => [
      ...(['thin', 'regular', 'thick', 'stage'] as const).map(
        (level) => `glass-${profile}-tier-${level}-${theme}`,
      ),
      `glass-scrim-${profile}-${theme}`,
    ]),
  ),
  'glass-fallback-note',
  'page-header-badge',
  'section-glass',
  'section-type',
  'section-components',
  'type-display-xl',
  'type-display-lg',
  'type-title',
  'type-heading',
  'type-body',
  'type-body-lg',
  'type-label',
  'type-meta',
  'type-micro',
  'type-code',
  'button-glass',
  'button-default',
  'button-outline',
  'button-ghost',
  'button-destructive',
  'button-secondary',
  'button-link',
  'button-glass-trigger',
  'input',
  'input-disabled',
  'tabs',
  'tabs-trigger-reading',
  'tabs-trigger-details',
  'tabs-panel',
  'select',
  'select-trigger',
  'badge',
  'badge-default',
  'badge-secondary',
  'badge-outline',
  'badge-destructive',
  'alert',
  'alert-destructive',
  'dialog-trigger',
  'sheet-trigger',
];

describe('DesignSystemPage', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('Given the page is mounted, When inspected, Then every required glass, type, and component sample is present', () => {
    act(() => root.render(<DesignSystemPage />));

    for (const sample of requiredSamples) {
      expect(container.querySelector(`[data-testid="${sample}"]`)).not.toBeNull();
    }

    expect(container.querySelectorAll('section h2')).toHaveLength(3);
    expect(container.querySelector('[data-testid="section-glass"] h2')?.textContent).toBe(
      'Glass materials',
    );
    expect(
      container.querySelector('[data-glass-tier="thin"] [data-refraction="sheen"]'),
    ).not.toBeNull();
    expect(container.querySelector('[data-glass="cheap"] [data-glass-tier="thin"]')).not.toBeNull();
  });

  it('Given the dialog sample, When its trigger is activated, Then the dialog opens', () => {
    act(() => root.render(<DesignSystemPage />));

    const trigger = container.querySelector<HTMLButtonElement>('[data-testid="dialog-trigger"]');
    expect(trigger).not.toBeNull();
    act(() => trigger?.click());

    expect(document.querySelector('[data-testid="dialog-panel"]')).not.toBeNull();
  });

  it('Given the dialog is open, When Escape is pressed, Then it closes and focus returns to its trigger', () => {
    act(() => root.render(<DesignSystemPage />));

    const trigger = container.querySelector<HTMLButtonElement>('[data-testid="dialog-trigger"]');
    expect(trigger).not.toBeNull();
    act(() => trigger?.click());
    const dialog = document.querySelector<HTMLElement>('[data-testid="dialog-panel"]');
    expect(dialog).not.toBeNull();

    act(() => {
      dialog?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });

    expect(document.querySelector('[data-testid="dialog-panel"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('Given the tabs sample, When Details is selected, Then its panel content is shown', () => {
    act(() => root.render(<DesignSystemPage />));

    const trigger = container.querySelector<HTMLButtonElement>(
      '[data-testid="tabs-trigger-details"]',
    );
    expect(trigger).not.toBeNull();
    act(() => trigger?.click());

    expect(trigger?.getAttribute('aria-selected')).toBe('true');
    expect(container.querySelector('[data-testid="tabs-panel"]')?.textContent).toContain(
      '12 chapters',
    );
  });

  it('Given the sheet sample, When its trigger is activated, Then the sheet opens', () => {
    act(() => root.render(<DesignSystemPage />));

    const trigger = container.querySelector<HTMLButtonElement>('[data-testid="sheet-trigger"]');
    expect(trigger).not.toBeNull();
    act(() => trigger?.click());

    const panel = document.querySelector('[data-testid="sheet-panel"]');
    expect(panel).not.toBeNull();
    expect(panel?.hasAttribute('data-open')).toBe(true);
  });
});
