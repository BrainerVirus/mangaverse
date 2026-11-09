import { describe, expect, it } from 'vitest';
import { hidesApplicationMenu } from './application-menu.js';

describe('hidesApplicationMenu', () => {
  it('Given Windows or Linux, Then the default in-window menu bar is dropped', () => {
    expect(hidesApplicationMenu('win32')).toBe(true);
    expect(hidesApplicationMenu('linux')).toBe(true);
  });

  it('Given macOS, Then the application menu stays, since the Cmd shortcuts are menu items', () => {
    expect(hidesApplicationMenu('darwin')).toBe(false);
  });
});
