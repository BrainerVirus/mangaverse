import { useReducer } from 'react';
import type { Dispatch } from 'react';

function isLazyInitializer<State>(
  initialState: State | (() => State),
): initialState is () => State {
  return typeof initialState === 'function';
}

function resolveInitialState<State>(initialState: State | (() => State)): State {
  return isLazyInitializer(initialState) ? initialState() : initialState;
}

/**
 * Local UI state as events through a reducer: the replacement for `useState`
 * (docs/overhaul/01-engineering-rules.md E2). As with `useState`, a function
 * `initialState` is a lazy initializer that runs once.
 */
export function useStateReducer<State, Event>(
  reducer: (state: State, event: Event) => State,
  initialState: State | (() => State),
): [State, Dispatch<Event>] {
  return useReducer<State, State | (() => State), [Event]>(
    reducer,
    initialState,
    resolveInitialState,
  );
}
