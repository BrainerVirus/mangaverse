import { describe, it, expect, beforeEach } from 'vitest';
import { useLayoutStore } from '../useLayoutStore';

describe('useLayoutStore', () => {
  beforeEach(() => {
    useLayoutStore.setState({
      sidebarOpen: true,
      sidebarExpanded: true,
      deviceLayout: 'desktop',
      readerChromeVisible: true,
    });
  });

  describe('initial state', () => {
    it('has correct initial values', () => {
      const state = useLayoutStore.getState();
      expect(state.sidebarOpen).toBe(true);
      expect(state.sidebarExpanded).toBe(true);
      expect(state.deviceLayout).toBe('desktop');
      expect(state.readerChromeVisible).toBe(true);
    });
  });

  describe('toggleSidebar', () => {
    it('toggles sidebarOpen from true to false', () => {
      useLayoutStore.getState().toggleSidebar();
      expect(useLayoutStore.getState().sidebarOpen).toBe(false);
    });

    it('toggles sidebarOpen from false to true', () => {
      useLayoutStore.setState({ sidebarOpen: false });
      useLayoutStore.getState().toggleSidebar();
      expect(useLayoutStore.getState().sidebarOpen).toBe(true);
    });
  });

  describe('toggleSidebarExpand', () => {
    it('toggles sidebarExpanded from true to false', () => {
      useLayoutStore.getState().toggleSidebarExpand();
      expect(useLayoutStore.getState().sidebarExpanded).toBe(false);
    });

    it('toggles sidebarExpanded from false to true', () => {
      useLayoutStore.setState({ sidebarExpanded: false });
      useLayoutStore.getState().toggleSidebarExpand();
      expect(useLayoutStore.getState().sidebarExpanded).toBe(true);
    });
  });

  describe('setDeviceLayout', () => {
    it('sets deviceLayout to desktop', () => {
      useLayoutStore.getState().setDeviceLayout('desktop');
      expect(useLayoutStore.getState().deviceLayout).toBe('desktop');
    });

    it('sets deviceLayout to tablet', () => {
      useLayoutStore.getState().setDeviceLayout('tablet');
      expect(useLayoutStore.getState().deviceLayout).toBe('tablet');
    });

    it('sets deviceLayout to mobile', () => {
      useLayoutStore.getState().setDeviceLayout('mobile');
      expect(useLayoutStore.getState().deviceLayout).toBe('mobile');
    });
  });

  describe('toggleReaderChrome', () => {
    it('toggles readerChromeVisible from true to false', () => {
      useLayoutStore.getState().toggleReaderChrome();
      expect(useLayoutStore.getState().readerChromeVisible).toBe(false);
    });

    it('toggles readerChromeVisible from false to true', () => {
      useLayoutStore.setState({ readerChromeVisible: false });
      useLayoutStore.getState().toggleReaderChrome();
      expect(useLayoutStore.getState().readerChromeVisible).toBe(true);
    });
  });

  describe('setReaderChrome', () => {
    it('sets readerChromeVisible to false', () => {
      useLayoutStore.getState().setReaderChrome(false);
      expect(useLayoutStore.getState().readerChromeVisible).toBe(false);
    });

    it('sets readerChromeVisible to true', () => {
      useLayoutStore.setState({ readerChromeVisible: false });
      useLayoutStore.getState().setReaderChrome(true);
      expect(useLayoutStore.getState().readerChromeVisible).toBe(true);
    });
  });
});