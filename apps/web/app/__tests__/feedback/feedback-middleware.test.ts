import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createFeedback,
  SAVING_INDICATOR_DELAY_MS,
  type FeedbackDeps,
} from '../../lib/feedback.js';

function harness(pathname = '/library') {
  const path = { current: pathname };
  const notify = {
    failure: vi.fn<FeedbackDeps['notify']['failure']>(),
    success: vi.fn<FeedbackDeps['notify']['success']>(),
    saving: vi.fn<FeedbackDeps['notify']['saving']>(),
    saved: vi.fn<FeedbackDeps['notify']['saved']>(),
    dismissSaving: vi.fn<FeedbackDeps['notify']['dismissSaving']>(),
  };
  const record = vi.fn<FeedbackDeps['record']>();
  const feedback = createFeedback({
    record,
    notify,
    pathname: () => path.current,
    isOnline: () => true,
  });
  return { feedback, notify, record, path };
}

describe('failure surfaces', () => {
  it('Given a toast failure, When it fails, Then it logs the raw text and toasts safe copy', () => {
    const { feedback, notify, record } = harness();
    feedback.onFailure(new Error('internal stack text'), {
      source: 'mutation',
      feedback: { surface: 'toast', message: 'Could not save.' },
    });
    expect(notify.failure).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Could not save.' }),
    );
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'error',
        code: 'unexpected',
        message: 'mutation: internal stack text',
      }),
    );
  });

  it('Given the same failure repeats, When toasts fire, Then they share one key', () => {
    const { feedback, notify } = harness();
    const input = { source: 's', feedback: { surface: 'toast', message: 'No.' } } as const;
    feedback.onFailure(new Error('a'), input);
    feedback.onFailure(new Error('a'), input);
    const [first, second] = notify.failure.mock.calls.map(
      ([call]) => `${call.key}:${call.message}`,
    );
    expect(first).toBe(second);
  });

  it('Given a refresh fails over cached data, When it fails, Then no toast shows and the log records it', () => {
    const { feedback, notify, record } = harness();
    feedback.onFailure(new Error('x'), {
      source: 'query',
      feedback: { surface: 'toast' },
      hasCachedData: true,
    });
    expect(notify.failure).not.toHaveBeenCalled();
    expect(record).toHaveBeenCalledOnce();
  });

  it.each(['silent', 'inline', 'page'] as const)(
    'Given surface %s, When it fails, Then only the log hears it',
    (surface) => {
      const { feedback, notify, record } = harness();
      feedback.onFailure(new Error('x'), { source: 's', feedback: { surface } });
      expect(notify.failure).not.toHaveBeenCalled();
      expect(record).toHaveBeenCalledOnce();
    },
  );

  it('Given someone is reading, When work fails, Then no toast shows', () => {
    const { feedback, notify, record } = harness('/reader/ch-1');
    feedback.onFailure(new Error('x'), { source: 's', feedback: { surface: 'toast' } });
    expect(notify.failure).not.toHaveBeenCalled();
    expect(record).toHaveBeenCalledOnce();
  });

  it('Given a cancelled request, When it rejects, Then nothing is logged or shown', () => {
    const { feedback, notify, record } = harness();
    feedback.onFailure(new DOMException('stop', 'AbortError'), {
      source: 's',
      feedback: { surface: 'toast' },
    });
    expect(notify.failure).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();
  });

  it('Given a retryable failure with a retry, When toasted, Then retry is offered; not-found is not', () => {
    const { feedback, notify } = harness();
    const onRetry = () => undefined;
    feedback.onFailure(new Error('x'), { source: 's', feedback: { surface: 'toast' }, onRetry });
    feedback.onFailure(Object.assign(new Error('x'), { status: 404 }), {
      source: 's',
      feedback: { surface: 'toast' },
      onRetry,
    });
    expect(notify.failure.mock.calls[0]?.[0].onRetry).toBe(onRetry);
    expect(notify.failure.mock.calls[1]?.[0].onRetry).toBeUndefined();
  });
});

describe('saving indicator', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('Given a save under the delay, When it succeeds, Then nothing flashes', () => {
    const { feedback, notify } = harness();
    feedback.onSaveStart(1);
    vi.advanceTimersByTime(SAVING_INDICATOR_DELAY_MS - 1);
    feedback.onSaveEnd(1, 'saved');
    vi.advanceTimersByTime(SAVING_INDICATOR_DELAY_MS * 2);
    expect(notify.saving).not.toHaveBeenCalled();
    expect(notify.saved).not.toHaveBeenCalled();
  });

  it('Given a save over the delay, When it succeeds, Then Saving resolves to saved', () => {
    const { feedback, notify } = harness();
    feedback.onSaveStart(1);
    vi.advanceTimersByTime(SAVING_INDICATOR_DELAY_MS);
    expect(notify.saving).toHaveBeenCalledOnce();
    feedback.onSaveEnd(1, 'saved');
    expect(notify.saved).toHaveBeenCalledOnce();
  });

  it('Given a save over the delay, When it fails, Then Saving is dismissed, not called saved', () => {
    const { feedback, notify } = harness();
    feedback.onSaveStart(1);
    vi.advanceTimersByTime(SAVING_INDICATOR_DELAY_MS);
    feedback.onSaveEnd(1, 'failed');
    expect(notify.dismissSaving).toHaveBeenCalledOnce();
    expect(notify.saved).not.toHaveBeenCalled();
  });

  it('Given two slow saves, When one ends, Then Saving stays until the last', () => {
    const { feedback, notify } = harness();
    feedback.onSaveStart(1);
    feedback.onSaveStart(2);
    vi.advanceTimersByTime(SAVING_INDICATOR_DELAY_MS);
    expect(notify.saving).toHaveBeenCalledOnce();
    feedback.onSaveEnd(1, 'saved');
    expect(notify.saved).not.toHaveBeenCalled();
    feedback.onSaveEnd(2, 'saved');
    expect(notify.saved).toHaveBeenCalledOnce();
  });

  it('Given someone is reading, When a save is slow, Then Saving does not show', () => {
    const { feedback, notify } = harness('/reader/ch-1');
    feedback.onSaveStart(1);
    vi.advanceTimersByTime(SAVING_INDICATOR_DELAY_MS);
    expect(notify.saving).not.toHaveBeenCalled();
  });
});
