import { describe, expect, it } from 'vitest';
import { readerStageTone } from './stage-tone';

describe('readerStageTone', () => {
  it.each([
    ['#000000', 'dark'],
    ['#0c0b0a', 'dark'],
    ['#333', 'dark'],
    ['#808080', 'dark'],
    ['#ffffff', 'light'],
    ['#FAF8F5', 'light'],
    ['#f5f2eb', 'light'],
    ['#eee', 'light'],
  ] as const)('Given the stage colour %s, Then the stage is %s', (colour, tone) => {
    expect(readerStageTone(colour)).toBe(tone);
  });

  it('Given a colour it cannot read, Then the stage is the default dark one', () => {
    expect(readerStageTone('black')).toBe('dark');
    expect(readerStageTone('')).toBe('dark');
  });
});
