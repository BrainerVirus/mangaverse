import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PageHeader, type PageHeaderProps } from '../components/page-header.js';

function renderHeader(props: Partial<PageHeaderProps> = {}) {
  return render(
    <PageHeader
      title="Library"
      description="Your saved manga, comics, and webtoons"
      actions={<button type="button">Compact</button>}
      {...props}
    />,
  );
}

describe('PageHeader', () => {
  it('switches to the actions row from its own container width, not the viewport', () => {
    // Regression: at 844×390 with 44 px side insets and the rail expanded the library
    // column is 472 px, while title + search + layout toggle need ~531 px. A viewport
    // `sm:` row would not help a wide window whose main column is narrow.
    const { container } = renderHeader();
    const header = container.firstElementChild as HTMLElement;
    expect(header).toHaveAttribute('data-page-header');
    expect(header).toHaveClass('@container');

    const row = header.firstElementChild as HTMLElement;
    expect(row).toHaveClass('flex-col', '@xl:flex-row', '@xl:flex-wrap');
    expect(row.className).not.toMatch(/\bsm:/);

    const actions = screen.getByRole('button', { name: 'Compact' }).parentElement as HTMLElement;
    expect(actions).toHaveClass('flex-col', '@xl:flex-row', '@xl:flex-wrap');
    expect(actions.className).not.toMatch(/\bsm:/);
  });

  it('keeps the container contract when an unbreakable title is longer than the column', () => {
    const longTitle = 'Donaudampfschifffahrtsgesellschaftskapitänsmützenabzeichen';
    const { container } = renderHeader({
      title: longTitle,
      description: 'Gespeicherte Serien, sortiert nach zuletzt gelesen.',
    });
    const header = container.firstElementChild as HTMLElement;
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent(longTitle);
    // A fixed line keeps the long title from widening the header past its column,
    // and `min-w-0` lets the flex item shrink below a long unbreakable word while
    // `break-words` wraps the word itself instead of overflowing.
    expect(heading.className).not.toMatch(/\b(truncate|whitespace-nowrap)\b/);
    expect(heading).toHaveClass('min-w-0', 'break-words');
    expect(header).toHaveClass('@container');
    expect(header.firstElementChild).toHaveClass('@xl:flex-wrap');
    expect(header.firstElementChild?.firstElementChild).toHaveClass('min-w-0');
  });

  it('keeps the container contract and logical layout in RTL', () => {
    const { container } = render(
      <div dir="rtl" lang="ar">
        <PageHeader
          title="مكتبة المانغا والقصص المصورة المحفوظة"
          description="عناوينك المحفوظة، مرتبة حسب آخر قراءة."
          actions={<button type="button">مدمج</button>}
        />
      </div>,
    );
    const header = container.querySelector('[data-page-header]') as HTMLElement;
    expect(header).toHaveClass('@container');
    expect(header.firstElementChild).toHaveClass('@xl:flex-row', '@xl:flex-wrap');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('مكتبة المانغا');
    expect(screen.getByRole('button', { name: 'مدمج' })).toBeVisible();
    // Physical-direction utilities would pin the row to LTR geometry.
    expect(header.className).not.toMatch(/(^|\s)(ml|mr|pl|pr|left|right)-/);
  });
});
