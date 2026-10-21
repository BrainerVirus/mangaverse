import { describe, expect, it } from 'vitest';
import { readIdChunks } from './read-id-chunks.js';

describe('readIdChunks', () => {
  it.each([0, 1, 499, 500, 501, 1000, 1001, 32767])(
    'Given %i ids, When querying chunks, Then every unique id is read once in order',
    (size) => {
      const ids = Array.from({ length: size }, (_, index) => `id-${index}`);
      const sizes: number[] = [];
      const result = readIdChunks([...ids, ...ids], (chunk) => {
        sizes.push(chunk.length);
        return chunk;
      });
      expect(result).toEqual(ids);
      expect(sizes.length).toBe(Math.ceil(size / 500));
      expect(sizes.every((length) => length > 0 && length <= 500)).toBe(true);
    },
  );
});
