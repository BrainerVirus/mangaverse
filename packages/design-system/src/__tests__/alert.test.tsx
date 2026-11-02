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

    const alert = document.querySelector('[data-alert]');
    expect(alert?.className).toContain('text-foreground');
    expect(alert?.className).toContain('text-destructive-glass');
    // The description must inherit the root foreground; a muted override here
    // dropped the destructive body copy below 4.5:1 on its tinted fill.
    const description = document.querySelector('[data-alert-description]');
    expect(description?.className).not.toContain('text-muted-foreground');
    // Every block after the icon is padded past it; the icon is not a layer.
    expect(alert?.className).toContain('[&>svg~*]:pl-7');
    expect(alert?.className).toContain('[&>svg]:absolute');
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
