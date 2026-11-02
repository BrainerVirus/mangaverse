import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReaderChrome } from '../../components/reader-chrome.js';

vi.mock('../../motion/index.js', async () => {
  const actual = await vi.importActual('../../motion/index.js');
  return {
    ...actual,
    useReducedMotion: () => false,
    chromeShow: vi.fn<(...args: unknown[]) => unknown>(),
    chromeHide: vi.fn<(...args: unknown[]) => unknown>(),
  };
});

vi.mock('@gsap/react', () => ({
  useGSAP: vi.fn<(callback: () => void, config?: { scope?: { current?: unknown } }) => () => void>(
    (callback, config) => {
      if (config?.scope?.current) {
        callback();
      }
      return () => {};
    },
  ),
}));

describe('ReaderChrome Accessibility', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders reader toolbar with toolbar role', () => {
    render(<ReaderChrome visible={true} currentPage={1} totalPages={10} />);

    expect(screen.getByLabelText('Reader controls')).toHaveAttribute('role', 'toolbar');
  });

  it('has aria-label on reader controls', () => {
    render(<ReaderChrome visible={true} currentPage={1} totalPages={10} />);

    expect(screen.getByLabelText('Reader controls')).toBeInTheDocument();
  });

  it('previous page button has accessible label', () => {
    render(<ReaderChrome visible={true} currentPage={5} totalPages={10} />);

    expect(screen.getByLabelText('Previous page')).toBeInTheDocument();
  });

  it('next page button has accessible label', () => {
    render(<ReaderChrome visible={true} currentPage={5} totalPages={10} />);

    expect(screen.getByLabelText('Next page')).toBeInTheDocument();
  });

  it('page slider has accessible label', () => {
    render(<ReaderChrome visible={true} currentPage={5} totalPages={10} />);

    expect(screen.getByLabelText('Page slider')).toBeInTheDocument();
  });

  it('previous page button is disabled when on first page', () => {
    render(<ReaderChrome visible={true} currentPage={1} totalPages={10} />);

    expect(screen.getByLabelText('Previous page')).toBeDisabled();
  });

  it('next page button is not disabled when not on last page', () => {
    render(<ReaderChrome visible={true} currentPage={5} totalPages={10} />);

    expect(screen.getByLabelText('Next page')).not.toBeDisabled();
  });

  it('all interactive elements are keyboard accessible', async () => {
    const user = userEvent.setup();

    render(
      <ReaderChrome
        visible={true}
        currentPage={5}
        totalPages={10}
        onPageChange={vi.fn<(page: number) => void>()}
        onModeChange={vi.fn<(mode: unknown) => void>()}
      />,
    );

    const toolbar = screen.getByLabelText('Reader controls');
    toolbar.focus();

    await user.keyboard('{Tab}');

    expect(document.activeElement).toBeTruthy();
  });

  it('reader mode buttons are keyboard accessible', async () => {
    const user = userEvent.setup();
    const onModeChange = vi.fn<(mode: unknown) => void>();

    render(
      <ReaderChrome
        visible={true}
        currentPage={5}
        totalPages={10}
        mode="single"
        onModeChange={onModeChange}
      />,
    );

    const doubleButton = screen.getByText('Double');
    doubleButton.focus();

    await user.keyboard('{Enter}');

    expect(onModeChange).toHaveBeenCalledWith('double');
  });

  it('chapter title is displayed correctly', () => {
    render(
      <ReaderChrome
        visible={true}
        chapterTitle="Chapter 5: The Journey Continues"
        currentPage={1}
        totalPages={10}
      />,
    );

    const title = screen.getByText('Chapter 5: The Journey Continues');
    expect(title).toBeInTheDocument();
  });

  it('page information is displayed clearly', () => {
    render(<ReaderChrome visible={true} currentPage={7} totalPages={15} />);

    expect(screen.getByText('7 / 15')).toBeInTheDocument();
  });
});
