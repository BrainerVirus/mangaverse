import { describe, it, expect } from 'vitest';
import { PACKAGE_NAME } from './index';

describe('smoke', () => {
  it('should export PACKAGE_NAME', () => {
    expect(PACKAGE_NAME).toBe('@app/extensions-sdk');
  });
});