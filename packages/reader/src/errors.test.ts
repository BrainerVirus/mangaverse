import { describe, it, expect } from 'vitest';
import { createReaderError, validateReaderSessionInput, validatePageIndex } from './errors';

describe('createReaderError', () => {
  it('should create error with code and message', () => {
    const error = createReaderError({ code: 'reader.input.invalid', message: 'Invalid input' });

    expect(error.code).toBe('reader.input.invalid');
    expect(error.message).toBe('Invalid input');
  });

  it('should include optional cause', () => {
    const cause = new Error('underlying');
    const error = createReaderError({ code: 'reader.image.failed', message: 'Failed', cause });

    expect(error.code).toBe('reader.image.failed');
    expect(error.cause).toBe(cause);
  });

  it('should include retryable flag', () => {
    const error = createReaderError({ code: 'reader.image.failed', message: 'Failed', retryable: true });

    expect(error.retryable).toBe(true);
  });
});

describe('validateReaderSessionInput', () => {
  it('should reject null input', () => {
    const result = validateReaderSessionInput(null);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('reader.input.invalid');
    }
  });

  it('should reject array input', () => {
    const result = validateReaderSessionInput([]);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('reader.input.invalid');
    }
  });

  it('should reject missing chapter', () => {
    const result = validateReaderSessionInput({
      viewport: { width: 800, height: 600 },
      settings: { readingMode: 'ltr' },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('reader.input.invalid');
    }
  });

  it('should reject missing chapter pages', () => {
    const result = validateReaderSessionInput({
      chapter: { id: 'ch1', pageCount: 0 },
      viewport: { width: 800, height: 600 },
      settings: { readingMode: 'ltr' },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('reader.input.invalid');
    }
  });

  it('should reject invalid viewport dimensions', () => {
    const result = validateReaderSessionInput({
      chapter: { id: 'ch1', pages: [], pageCount: 0 },
      viewport: { width: -1, height: 600 },
      settings: { readingMode: 'ltr' },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('reader.layout.invalid');
    }
  });

  it('should reject invalid reading mode', () => {
    const result = validateReaderSessionInput({
      chapter: { id: 'ch1', pages: [], pageCount: 0 },
      viewport: { width: 800, height: 600 },
      settings: { readingMode: 'invalid' },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('reader.input.invalid');
    }
  });

  it('should reject invalid pageLayout', () => {
    const result = validateReaderSessionInput({
      chapter: { id: 'ch1', pages: [], pageCount: 0 },
      viewport: { width: 800, height: 600 },
      settings: { readingMode: 'ltr', pageLayout: 'invalid' },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('reader.input.invalid');
    }
  });

  it('should reject invalid tapZoneLayout', () => {
    const result = validateReaderSessionInput({
      chapter: { id: 'ch1', pages: [], pageCount: 0 },
      viewport: { width: 800, height: 600 },
      settings: { readingMode: 'ltr', tapZoneLayout: 'invalid' },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('reader.input.invalid');
    }
  });

  it('should reject minZoom greater than maxZoom', () => {
    const result = validateReaderSessionInput({
      chapter: { id: 'ch1', pages: [], pageCount: 0 },
      viewport: { width: 800, height: 600 },
      settings: { readingMode: 'ltr', minZoom: 3, maxZoom: 1 },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('reader.input.invalid');
    }
  });

  it('should reject negative preloadAhead', () => {
    const result = validateReaderSessionInput({
      chapter: { id: 'ch1', pages: [], pageCount: 0 },
      viewport: { width: 800, height: 600 },
      settings: { readingMode: 'ltr', preloadAhead: -1 },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('reader.input.invalid');
    }
  });

  it('should reject invalid wheelBehavior', () => {
    const result = validateReaderSessionInput({
      chapter: { id: 'ch1', pages: [], pageCount: 0 },
      viewport: { width: 800, height: 600 },
      settings: { readingMode: 'ltr', wheelBehavior: 'invalid' },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('reader.input.invalid');
    }
  });

  it('should reject invalid verticalGapPx', () => {
    const result = validateReaderSessionInput({
      chapter: { id: 'ch1', pages: [], pageCount: 0 },
      viewport: { width: 800, height: 600 },
      settings: { readingMode: 'ltr', verticalGapPx: -5 },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('reader.input.invalid');
    }
  });

  it('should accept valid session input', () => {
    const result = validateReaderSessionInput({
      chapter: { id: 'ch1', pages: [], pageCount: 0 },
      viewport: { width: 800, height: 600 },
      settings: { readingMode: 'ltr' },
    });

    expect(result.ok).toBe(true);
  });
});

describe('validatePageIndex', () => {
  it('should reject non-finite index', () => {
    const result = validatePageIndex(NaN, 10);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('reader.page.missing');
    }
  });

  it('should reject negative index', () => {
    const result = validatePageIndex(-1, 10);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('reader.page.missing');
    }
  });

  it('should reject index beyond page count', () => {
    const result = validatePageIndex(10, 10);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('reader.page.missing');
    }
  });

  it('should accept valid index', () => {
    const result = validatePageIndex(5, 10);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(5);
    }
  });

  it('should accept last page index', () => {
    const result = validatePageIndex(9, 10);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(9);
    }
  });
});