/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { Alert, AlertDescription, AlertTitle } from '../components/ui/alert.js';

describe('Alert', () => {
  it('Given a warning list, Then the description is a block container that holds it', () => {
    render(
      <Alert>
        <AlertTitle>Review warnings</AlertTitle>
        <AlertDescription>
          <ul>
            <li>Provider declares network access.</li>
          </ul>
        </AlertDescription>
      </Alert>,
    );

    const description = document.querySelector('[data-alert-description]');
    expect(description?.tagName).toBe('DIV');
    expect(description?.querySelector('ul')).not.toBeNull();
    expect(screen.getByRole('listitem')).toHaveTextContent('Provider declares network access.');
  });

  it('Given a destructive alert, Then the copy keeps body contrast and the status colour stays on the icon and title', () => {
    render(
      <Alert variant="destructive">
        <svg aria-hidden="true" />
        <AlertTitle>Install failed</AlertTitle>
        <AlertDescription>The manifest could not be read.</AlertDescription>
      </Alert>,
    );

    const alert = document.querySelector('.group\\/alert');
    expect(alert?.className).toContain('text-foreground');
    expect(alert?.className).toContain('text-destructive-glass');
    expect(alert?.className).toContain('has-[>svg]:grid-cols-[1rem_1fr]');
    // The icon is a grid child, not an absolutely positioned layer over the copy.
    expect(alert?.className).not.toContain('absolute');
  });

  it('Given an alert title, Then it is a level-3 heading that does not skip levels', () => {
    render(
      <Alert>
        <AlertTitle>Storage updated</AlertTitle>
      </Alert>,
    );

    expect(screen.getByRole('heading', { name: 'Storage updated', level: 3 })).toBeInTheDocument();
  });
});
