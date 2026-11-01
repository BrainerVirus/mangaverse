import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useStateReducer } from './use-state-reducer.js';

type CounterEvent = { type: 'add'; by: number } | { type: 'reset' };

function counter(state: number, event: CounterEvent): number {
  return event.type === 'add' ? state + event.by : 0;
}

describe('useStateReducer', () => {
  it('moves state through the reducer as events dispatch', () => {
    const { result } = renderHook(() => useStateReducer(counter, 1));
    expect(result.current[0]).toBe(1);

    act(() => result.current[1]({ type: 'add', by: 4 }));
    expect(result.current[0]).toBe(5);

    act(() => result.current[1]({ type: 'reset' }));
    expect(result.current[0]).toBe(0);
  });

  it('infers state and event types from the reducer', () => {
    const { result } = renderHook(() => useStateReducer(counter, 1));
    const [state, dispatch] = result.current;
    const inferred: number = state;
    expect(inferred).toBe(1);

    act(() => {
      // @ts-expect-error `remove` is not a CounterEvent.
      dispatch({ type: 'remove' });
      // @ts-expect-error `by` must be a number.
      dispatch({ type: 'add', by: '1' });
      dispatch({ type: 'reset' });
    });
    expect(result.current[0]).toBe(0);

    // @ts-expect-error the initial state must match the reducer's state.
    renderHook(() => useStateReducer(counter, 'one'));
  });

  it('applies events batched in one tick to the latest state, not a captured one', () => {
    const { result } = renderHook(() => useStateReducer(counter, 0));
    const [, dispatch] = result.current;

    act(() => {
      dispatch({ type: 'add', by: 1 });
      dispatch({ type: 'add', by: 1 });
      dispatch({ type: 'add', by: 1 });
    });

    expect(result.current[0]).toBe(3);
  });

  it('keeps dispatch stable so a handler from an old render still updates current state', () => {
    const { result, rerender } = renderHook(() => useStateReducer(counter, 0));
    const firstDispatch = result.current[1];

    act(() => firstDispatch({ type: 'add', by: 2 }));
    rerender();
    act(() => firstDispatch({ type: 'add', by: 3 }));

    expect(result.current[1]).toBe(firstDispatch);
    expect(result.current[0]).toBe(5);
  });

  it('runs the reducer from the latest render, so props it closes over are current', () => {
    const { result, rerender } = renderHook(
      ({ step }) => useStateReducer((state: number, _event: 'tick') => state + step, 0),
      { initialProps: { step: 1 } },
    );

    act(() => result.current[1]('tick'));
    rerender({ step: 10 });
    act(() => result.current[1]('tick'));

    expect(result.current[0]).toBe(11);
  });

  it('runs a lazy initializer once', () => {
    const init = vi.fn<() => number>(() => 7);
    const { result, rerender } = renderHook(() => useStateReducer(counter, init));

    rerender();

    expect(result.current[0]).toBe(7);
    expect(init).toHaveBeenCalledTimes(1);
  });
});
