/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { getRouter } from '../router.js';

/**
 * The Electron renderer prerenders this component's markup into `index.html` for every URL, so
 * it is the first paint of /library and of every other route until the route's chunk loads.
 */
describe('the pending route component', () => {
  const Pending = getRouter().options.defaultPendingComponent as () => React.ReactNode;

  it('paints no content placeholder, because which page is coming is not known', () => {
    const { container } = render(<Pending />);

    expect(container.querySelectorAll('.animate-pulse')).toHaveLength(0);
    expect(container.querySelector('.grid')).toBeNull();
    expect(container.querySelector('[class*="aspect-"]')).toBeNull();
  });

  it('announces itself to assistive technology instead', () => {
    render(<Pending />);

    expect(screen.getByRole('status', { name: 'Loading page' })).toBeInTheDocument();
  });
});
