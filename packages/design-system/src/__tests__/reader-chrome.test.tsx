import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReaderChrome } from '../components/reader-chrome.js';

vi.mock('@app/motion', async () => {
  const actual = await vi.importActual('@app/motion');
  return {
    ...actual,
    useReducedMotion: () => false,
    chromeShow: vi.fn(),
    chromeHide: vi.fn(),
  };
});

vi.mock('@gsap/react', () => ({
  useGSAP: vi.fn((callback, config) => {
    if (config?.scope?.current) {
      callback();
    }
    return () => {};
  }),
}));

describe('ReaderChrome', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders with visible prop', () => {
    render(
      <ReaderChrome
        visible={true}
        currentPage={1}
        totalPages={10}
      />
    );

    expect(screen.getByLabelText('Reader controls')).toBeInTheDocument();
  });

  it('displays chapter title when provided', () => {
    render(
      <ReaderChrome
        visible={true}
        chapterTitle="Chapter 1: The Beginning"
        currentPage={1}
        totalPages={10}
      />
    );

    expect(screen.getByText('Chapter 1: The Beginning')).toBeInTheDocument();
  });

  it('displays page badge with correct format', () => {
    render(
      <ReaderChrome
        visible={true}
        currentPage={3}
        totalPages={20}
      />
    );

    expect(screen.getByText('3 / 20')).toBeInTheDocument();
  });

  it('calls onPageChange when previous button is clicked', async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();

    render(
      <ReaderChrome
        visible={true}
        currentPage={5}
        totalPages={10}
        onPageChange={onPageChange}
      />
    );

    await user.click(screen.getByLabelText('Previous page'));
    expect(onPageChange).toHaveBeenCalledWith(4);
  });

  it('calls onPageChange when next button is clicked', async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();

    render(
      <ReaderChrome
        visible={true}
        currentPage={5}
        totalPages={10}
        onPageChange={onPageChange}
      />
    );

    await user.click(screen.getByLabelText('Next page'));
    expect(onPageChange).toHaveBeenCalledWith(6);
  });

  it('does not call onPageChange when at first page and previous is clicked', async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();

    render(
      <ReaderChrome
        visible={true}
        currentPage={1}
        totalPages={10}
        onPageChange={onPageChange}
      />
    );

    const prevButton = screen.getByLabelText('Previous page');
    await user.click(prevButton);
    expect(onPageChange).not.toHaveBeenCalled();
  });

  it('does not call onPageChange when at last page and next is clicked', async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();

    render(
      <ReaderChrome
        visible={true}
        currentPage={10}
        totalPages={10}
        onPageChange={onPageChange}
      />
    );

    const nextButton = screen.getByLabelText('Next page');
    await user.click(nextButton);
    expect(onPageChange).not.toHaveBeenCalled();
  });

  it('renders page slider with correct min/max values', () => {
    render(
      <ReaderChrome
        visible={true}
        currentPage={5}
        totalPages={20}
      />
    );

    const slider = screen.getByLabelText('Page slider') as HTMLInputElement;
    expect(slider.min).toBe('1');
    expect(slider.max).toBe('20');
  });

  it('renders all reader mode buttons', () => {
    render(
      <ReaderChrome
        visible={true}
        currentPage={1}
        totalPages={10}
        mode="single"
        onModeChange={vi.fn()}
      />
    );

    expect(screen.getByText('Single')).toBeInTheDocument();
    expect(screen.getByText('Double')).toBeInTheDocument();
    expect(screen.getByText('Scroll')).toBeInTheDocument();
    expect(screen.getByText('Webtoon')).toBeInTheDocument();
  });

  it('calls onModeChange when mode button is clicked', async () => {
    const user = userEvent.setup();
    const onModeChange = vi.fn();

    render(
      <ReaderChrome
        visible={true}
        currentPage={1}
        totalPages={10}
        mode="single"
        onModeChange={onModeChange}
      />
    );

    await user.click(screen.getByText('Double'));
    expect(onModeChange).toHaveBeenCalledWith('double');
  });

  it('has toolbar role for accessibility', () => {
    render(
      <ReaderChrome
        visible={true}
        currentPage={1}
        totalPages={10}
      />
    );

    expect(screen.getByLabelText('Reader controls')).toHaveAttribute('role', 'toolbar');
  });

  it('renders progress bar', () => {
    render(
      <ReaderChrome
        visible={true}
        currentPage={5}
        totalPages={10}
      />
    );

    const progressBar = document.querySelector('[class*="bg-white"]');
    expect(progressBar).toBeInTheDocument();
  });
});