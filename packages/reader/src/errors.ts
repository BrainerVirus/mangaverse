import { createAppError, err, ok, type AppResult } from '@app/shared';
import type { ReaderSessionInput } from './types.js';

export function createReaderError(input: {
  code: string;
  message: string;
  cause?: unknown;
  providerId?: string;
  retryable?: boolean;
  details?: Readonly<Record<string, string | number | boolean | null>>;
}) {
  return createAppError(input);
}

export function validateReaderSessionInput(input: unknown): AppResult<ReaderSessionInput> {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return err(createReaderError({ code: 'reader.input.invalid', message: 'Session input must be an object' }));
  }

  const session = input as Record<string, unknown>;

  if (!session.chapter || typeof session.chapter !== 'object') {
    return err(createReaderError({ code: 'reader.input.invalid', message: 'Chapter is required' }));
  }

  const chapter = session.chapter as Record<string, unknown>;
  if (!chapter.id || typeof chapter.id !== 'string') {
    return err(createReaderError({ code: 'reader.input.invalid', message: 'Chapter id is required' }));
  }
  if (!chapter.pages || !Array.isArray(chapter.pages)) {
    return err(createReaderError({ code: 'reader.input.invalid', message: 'Chapter pages must be an array' }));
  }
  if (typeof chapter.pageCount !== 'number' || chapter.pageCount < 0) {
    return err(createReaderError({ code: 'reader.input.invalid', message: 'Chapter pageCount must be a non-negative number' }));
  }

  if (!session.viewport || typeof session.viewport !== 'object') {
    return err(createReaderError({ code: 'reader.input.invalid', message: 'Viewport is required' }));
  }

  const viewport = session.viewport as Record<string, unknown>;
  if (typeof viewport.width !== 'number' || viewport.width <= 0) {
    return err(createReaderError({ code: 'reader.layout.invalid', message: 'Viewport width must be positive' }));
  }
  if (typeof viewport.height !== 'number' || viewport.height <= 0) {
    return err(createReaderError({ code: 'reader.layout.invalid', message: 'Viewport height must be positive' }));
  }

  if (!session.settings || typeof session.settings !== 'object') {
    return err(createReaderError({ code: 'reader.input.invalid', message: 'Settings are required' }));
  }

  const settings = session.settings as Record<string, unknown>;
  const validModes = ['rtl', 'ltr', 'vertical'];
  if (typeof settings.readingMode !== 'string' || !validModes.includes(settings.readingMode)) {
    return err(createReaderError({ code: 'reader.input.invalid', message: 'Invalid readingMode' }));
  }

  const validPageLayouts = ['single', 'double', 'smartSpread'];
  if (settings.pageLayout !== undefined && (typeof settings.pageLayout !== 'string' || !validPageLayouts.includes(settings.pageLayout))) {
    return err(createReaderError({ code: 'reader.input.invalid', message: 'Invalid pageLayout' }));
  }

  const validTapZoneLayouts = ['leftRight', 'lShaped', 'grid'];
  if (settings.tapZoneLayout !== undefined && (typeof settings.tapZoneLayout !== 'string' || !validTapZoneLayouts.includes(settings.tapZoneLayout))) {
    return err(createReaderError({ code: 'reader.input.invalid', message: 'Invalid tapZoneLayout' }));
  }

  const validWheelBehaviors = ['none', 'scroll', 'zoom'];
  if (settings.wheelBehavior !== undefined && (typeof settings.wheelBehavior !== 'string' || !validWheelBehaviors.includes(settings.wheelBehavior))) {
    return err(createReaderError({ code: 'reader.input.invalid', message: 'Invalid wheelBehavior' }));
  }

  if (settings.minZoom !== undefined || settings.maxZoom !== undefined) {
    const minZoom = typeof settings.minZoom === 'number' ? settings.minZoom : 1;
    const maxZoom = typeof settings.maxZoom === 'number' ? settings.maxZoom : 3;
    if (minZoom > maxZoom) {
      return err(createReaderError({ code: 'reader.input.invalid', message: 'minZoom cannot exceed maxZoom' }));
    }
  }

  if (settings.preloadAhead !== undefined && (typeof settings.preloadAhead !== 'number' || settings.preloadAhead < 0)) {
    return err(createReaderError({ code: 'reader.input.invalid', message: 'preloadAhead must be non-negative' }));
  }

  if (settings.verticalGapPx !== undefined && (typeof settings.verticalGapPx !== 'number' || settings.verticalGapPx < 0)) {
    return err(createReaderError({ code: 'reader.input.invalid', message: 'verticalGapPx must be non-negative' }));
  }

  return ok(input as ReaderSessionInput);
}

export function validatePageIndex(index: number, pageCount: number): AppResult<number> {
  if (typeof index !== 'number' || !Number.isFinite(index)) {
    return err(createReaderError({ code: 'reader.page.missing', message: 'Page index must be a finite number' }));
  }

  if (index < 0) {
    return err(createReaderError({ code: 'reader.page.missing', message: 'Page index cannot be negative' }));
  }

  if (index >= pageCount) {
    return err(createReaderError({ code: 'reader.page.missing', message: `Page index ${index} exceeds page count ${pageCount}` }));
  }

  return ok(index);
}