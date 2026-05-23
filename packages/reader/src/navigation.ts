import type {
  ReaderState,
  ReaderNavigationAction,
  ReaderEngineSettings,
} from './types.js';

export function resolveNavigationAction(
  state: ReaderState,
  action: ReaderNavigationAction
): ReaderNavigationAction {
  const { activePageIndex } = state;
  const pageCount = state.pages.length;

  switch (action.type) {
    case 'prevPage': {
      const rtl = state.settings.readingMode === 'rtl';
      const inverted = state.settings.navigationDirection === 'inverted';
      const goingForward = inverted !== rtl;

      if (goingForward) {
        const nextIndex = Math.min(activePageIndex + 1, pageCount - 1);
        return { type: 'goToPage', pageIndex: nextIndex };
      } else {
        const prevIndex = Math.max(activePageIndex - 1, 0);
        return { type: 'goToPage', pageIndex: prevIndex };
      }
    }

    case 'nextPage': {
      const rtl = state.settings.readingMode === 'rtl';
      const inverted = state.settings.navigationDirection === 'inverted';
      const goingForward = inverted !== rtl;

      if (goingForward) {
        const prevIndex = Math.max(activePageIndex - 1, 0);
        return { type: 'goToPage', pageIndex: prevIndex };
      } else {
        const nextIndex = Math.min(activePageIndex + 1, pageCount - 1);
        return { type: 'goToPage', pageIndex: nextIndex };
      }
    }

    case 'goToPage':
      return action;

    case 'firstPage':
      return { type: 'goToPage', pageIndex: 0 };

    case 'lastPage':
      return { type: 'goToPage', pageIndex: pageCount - 1 };

    case 'prevChapter':
    case 'nextChapter':
    case 'none':
    default:
      return { type: 'none' };
  }
}

export function applyNavigationAction(state: ReaderState, action: ReaderNavigationAction): ReaderState {
  if (action.type === 'none' || action.type === 'prevChapter' || action.type === 'nextChapter') {
    return state;
  }

  const newPageIndex =
    action.type === 'goToPage' && action.pageIndex !== undefined
      ? action.pageIndex
      : state.activePageIndex;

  return {
    ...state,
    activePageIndex: newPageIndex,
    zoom: {
      scale: 1,
      translateX: 0,
      translateY: 0,
      minZoom: state.zoom.minZoom,
      maxZoom: state.zoom.maxZoom,
    },
    visiblePageIndexes: [newPageIndex],
  };
}

export function resolveKeyboardAction(
  event: { key: string },
  settings: ReaderEngineSettings
): ReaderNavigationAction {
  const { readingMode, navigationDirection } = settings;
  const rtl = readingMode === 'rtl';
  const inverted = navigationDirection === 'inverted';

  const nextKey = inverted !== rtl ? 'ArrowLeft' : 'ArrowRight';
  const prevKey = inverted !== rtl ? 'ArrowRight' : 'ArrowLeft';

  switch (event.key) {
    case nextKey:
      return { type: 'nextPage' };
    case prevKey:
      return { type: 'prevPage' };
    case 'ArrowDown':
    case 'PageDown':
      return { type: 'nextPage' };
    case 'ArrowUp':
    case 'PageUp':
      return { type: 'prevPage' };
    case 'Home':
      return { type: 'firstPage' };
    case 'End':
      return { type: 'lastPage' };
    case ' ':
      return { type: 'nextPage' };
    default:
      return { type: 'none' };
  }
}

export function resolveWheelAction(
  event: { deltaX: number; deltaY: number; ctrlKey?: boolean },
  settings: ReaderEngineSettings
): { type: 'scroll' | 'zoom' | 'none'; delta?: number } {
  const { wheelBehavior, readingMode } = settings;
  const isVertical = readingMode === 'vertical';

  if (wheelBehavior === 'none') {
    return { type: 'none' };
  }

  if (wheelBehavior === 'zoom' && event.ctrlKey) {
    return { type: 'zoom', delta: event.deltaY };
  }

  if (isVertical && wheelBehavior === 'scroll') {
    return { type: 'scroll' };
  }

  if (event.deltaX !== 0 || !isVertical) {
    return { type: 'scroll' };
  }

  return { type: 'none' };
}