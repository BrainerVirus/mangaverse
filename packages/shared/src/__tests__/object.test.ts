import { describe, expect, it } from 'vitest';
import { isPlainObject } from '../object.js';

describe('isPlainObject', () => {
  it('accepts objects, including non-error instances', () => {
    expect(isPlainObject({})).toBe(true);
    expect(isPlainObject({ message: 'failure' })).toBe(true);
    expect(isPlainObject(new Date())).toBe(true);
  });

  it('rejects null, arrays and primitives', () => {
    expect(isPlainObject(null)).toBe(false);
    expect(isPlainObject([])).toBe(false);
    expect(isPlainObject('backup')).toBe(false);
    expect(isPlainObject(0)).toBe(false);
    expect(isPlainObject(undefined)).toBe(false);
  });
});
