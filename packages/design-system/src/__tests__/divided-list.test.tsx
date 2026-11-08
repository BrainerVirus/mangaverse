import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DividedList, DividedRow } from '../components/divided-list.js';

describe('DividedList', () => {
  it('Given rows, Then they are separated by hairlines and carry no fill or border of their own', () => {
    render(
      <DividedList aria-label="Things">
        <DividedRow data-testid="row">One</DividedRow>
        <DividedRow>Two</DividedRow>
      </DividedList>,
    );

    const list = screen.getByRole('list', { name: 'Things' });
    expect(list.tagName).toBe('UL');
    expect(list).toHaveClass('flex', 'flex-col', 'divide-y', 'divide-border');
    const row = screen.getByTestId('row');
    expect(row.tagName).toBe('LI');
    // Flush with the surface at both ends, never a second box inside it.
    expect(row).toHaveClass('py-3', 'first:pt-0', 'last:pb-0');
    expect(row.className).not.toMatch(/(^| )(bg-|border(?!-)|rounded)/);
  });

  it('Given a stacked row, Then its lines stack instead of spreading to both ends', () => {
    render(
      <DividedList>
        <DividedRow layout="stacked" data-testid="row">
          One
        </DividedRow>
      </DividedList>,
    );

    expect(screen.getByTestId('row')).toHaveClass('flex-col');
    expect(screen.getByTestId('row')).not.toHaveClass('justify-between');
  });

  it('Given label and value pairs, Then a dl holds div rows', () => {
    render(
      <DividedList as="dl" aria-label="Facts">
        <DividedRow as="div" data-testid="pair">
          <dt>Key</dt>
          <dd>Value</dd>
        </DividedRow>
      </DividedList>,
    );

    expect(screen.getByLabelText('Facts').tagName).toBe('DL');
    expect(screen.getByTestId('pair').tagName).toBe('DIV');
  });
});
