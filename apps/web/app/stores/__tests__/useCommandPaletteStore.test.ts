import { describe, it, expect, beforeEach } from 'vitest';
import { useCommandPaletteStore } from '../useCommandPaletteStore';

describe('useCommandPaletteStore', () => {
  beforeEach(() => {
    useCommandPaletteStore.setState({
      isOpen: false,
      query: '',
      selectedIndex: 0,
    });
  });

  describe('initial state', () => {
    it('has correct initial values', () => {
      const state = useCommandPaletteStore.getState();
      expect(state.isOpen).toBe(false);
      expect(state.query).toBe('');
      expect(state.selectedIndex).toBe(0);
    });
  });

  describe('open', () => {
    it('sets isOpen to true', () => {
      useCommandPaletteStore.getState().open();
      expect(useCommandPaletteStore.getState().isOpen).toBe(true);
    });
  });

  describe('close', () => {
    it('sets isOpen to false', () => {
      useCommandPaletteStore.setState({ isOpen: true });
      useCommandPaletteStore.getState().close();
      expect(useCommandPaletteStore.getState().isOpen).toBe(false);
    });

    it('resets query to empty string', () => {
      useCommandPaletteStore.setState({ query: 'some search' });
      useCommandPaletteStore.getState().close();
      expect(useCommandPaletteStore.getState().query).toBe('');
    });

    it('resets selectedIndex to 0', () => {
      useCommandPaletteStore.setState({ selectedIndex: 5 });
      useCommandPaletteStore.getState().close();
      expect(useCommandPaletteStore.getState().selectedIndex).toBe(0);
    });
  });

  describe('toggle', () => {
    it('toggles isOpen from false to true', () => {
      useCommandPaletteStore.getState().toggle();
      expect(useCommandPaletteStore.getState().isOpen).toBe(true);
    });

    it('toggles isOpen from true to false', () => {
      useCommandPaletteStore.setState({ isOpen: true });
      useCommandPaletteStore.getState().toggle();
      expect(useCommandPaletteStore.getState().isOpen).toBe(false);
    });
  });

  describe('setQuery', () => {
    it('sets query to provided value', () => {
      useCommandPaletteStore.getState().setQuery('library');
      expect(useCommandPaletteStore.getState().query).toBe('library');
    });

    it('can set empty query', () => {
      useCommandPaletteStore.setState({ query: 'some text' });
      useCommandPaletteStore.getState().setQuery('');
      expect(useCommandPaletteStore.getState().query).toBe('');
    });
  });

  describe('setSelectedIndex', () => {
    it('sets selectedIndex to provided value', () => {
      useCommandPaletteStore.getState().setSelectedIndex(3);
      expect(useCommandPaletteStore.getState().selectedIndex).toBe(3);
    });

    it('can set selectedIndex to 0', () => {
      useCommandPaletteStore.setState({ selectedIndex: 5 });
      useCommandPaletteStore.getState().setSelectedIndex(0);
      expect(useCommandPaletteStore.getState().selectedIndex).toBe(0);
    });
  });

  describe('moveSelection', () => {
    it('moves selection up with negative delta', () => {
      useCommandPaletteStore.setState({ selectedIndex: 3 });
      useCommandPaletteStore.getState().moveSelection(-1);
      expect(useCommandPaletteStore.getState().selectedIndex).toBe(2);
    });

    it('moves selection down with positive delta', () => {
      useCommandPaletteStore.setState({ selectedIndex: 2 });
      useCommandPaletteStore.getState().moveSelection(1);
      expect(useCommandPaletteStore.getState().selectedIndex).toBe(3);
    });

    it('does not go below 0', () => {
      useCommandPaletteStore.setState({ selectedIndex: 0 });
      useCommandPaletteStore.getState().moveSelection(-1);
      expect(useCommandPaletteStore.getState().selectedIndex).toBe(0);
    });

    it('does not move selection above maxIndex', () => {
      useCommandPaletteStore.setState({ selectedIndex: 2 });
      useCommandPaletteStore.getState().moveSelection(1, 2);
      expect(useCommandPaletteStore.getState().selectedIndex).toBe(2);
    });

    it('does not move selection below zero when maxIndex is provided', () => {
      useCommandPaletteStore.setState({ selectedIndex: 0 });
      useCommandPaletteStore.getState().moveSelection(-1, 2);
      expect(useCommandPaletteStore.getState().selectedIndex).toBe(0);
    });
  });
});