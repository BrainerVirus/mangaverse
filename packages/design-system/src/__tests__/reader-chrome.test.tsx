import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReaderChrome } from '../components/reader-chrome.js';

vi.mock('@app/motion', async () => {
  const actual = await vi.importActual('@app/motion');
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

describe('ReaderChrome', () => {
  it('removes hidden chrome from keyboard interaction', () => {
    const { container } = render(<ReaderChrome visible={false} currentPage={1} totalPages={3} />);
    expect(container.querySelector('[role="toolbar"]')).toHaveAttribute('inert');
  });
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('displays chapter title when provided', () => {
    render(
      <ReaderChrome
        visible={true}
        chapterTitle="Chapter 1: The Beginning"
        currentPage={1}
        totalPages={10}
      />,
    );

    expect(screen.getByText('Chapter 1: The Beginning')).toBeInTheDocument();
  });

  it('Given a source name, When the chrome is visible, Then attribution is quiet but present', () => {
    render(
      <ReaderChrome
        visible={true}
        chapterTitle="Chapter 1"
        sourceName="MangaDex"
        currentPage={1}
        totalPages={10}
      />,
    );

    expect(screen.getByTestId('reader-source')).toHaveTextContent('MangaDex');
    expect(screen.getByTestId('reader-source')).toHaveAttribute('title', 'MangaDex');
  });

  it('Given chapter actions, When the menu button is clicked, Then the handler runs', async () => {
    const user = userEvent.setup();
    const onOpenChapterActions = vi.fn<() => void>();
    render(
      <ReaderChrome
        visible={true}
        currentPage={1}
        totalPages={10}
        onOpenChapterActions={onOpenChapterActions}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Chapter actions' }));
    expect(onOpenChapterActions).toHaveBeenCalledTimes(1);
  });

  it('displays page badge with correct format', () => {
    render(<ReaderChrome visible={true} currentPage={3} totalPages={20} />);

    expect(screen.getByText('3 / 20')).toBeInTheDocument();
  });

  it('calls onPageChange when previous button is clicked', async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn<(page: number) => void>();

    render(
      <ReaderChrome visible={true} currentPage={5} totalPages={10} onPageChange={onPageChange} />,
    );

    await user.click(screen.getByLabelText('Previous page'));
    expect(onPageChange).toHaveBeenCalledWith(4);
  });

  it('calls onPageChange when next button is clicked', async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn<(page: number) => void>();

    render(
      <ReaderChrome visible={true} currentPage={5} totalPages={10} onPageChange={onPageChange} />,
    );

    await user.click(screen.getByLabelText('Next page'));
    expect(onPageChange).toHaveBeenCalledWith(6);
  });

  it('does not call onPageChange when at first page and previous is clicked', async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn<(page: number) => void>();

    render(
      <ReaderChrome visible={true} currentPage={1} totalPages={10} onPageChange={onPageChange} />,
    );

    const prevButton = screen.getByLabelText('Previous page');
    await user.click(prevButton);
    expect(onPageChange).not.toHaveBeenCalled();
  });

  it('does not call onPageChange when at last page and next is clicked', async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn<(page: number) => void>();

    render(
      <ReaderChrome visible={true} currentPage={10} totalPages={10} onPageChange={onPageChange} />,
    );

    const nextButton = screen.getByLabelText('Next page');
    await user.click(nextButton);
    expect(onPageChange).not.toHaveBeenCalled();
  });

  it('renders page slider with correct min/max values', () => {
    render(<ReaderChrome visible={true} currentPage={5} totalPages={20} />);

    const slider = screen.getByRole('slider', { name: 'Page slider' });
    expect(slider).toHaveAttribute('aria-valuemin', '1');
    expect(slider).toHaveAttribute('aria-valuemax', '20');
    expect(slider).toHaveAttribute('aria-valuenow', '5');
  });

  it('renders all reader mode buttons', () => {
    render(
      <ReaderChrome
        visible={true}
        currentPage={1}
        totalPages={10}
        mode="single"
        onModeChange={vi.fn<(mode: unknown) => void>()}
      />,
    );

    expect(screen.getByText('Single')).toBeInTheDocument();
    expect(screen.getByText('Double')).toBeInTheDocument();
    expect(screen.getByText('Scroll')).toBeInTheDocument();
  });

  it('calls onModeChange when mode button is clicked', async () => {
    const user = userEvent.setup();
    const onModeChange = vi.fn<(mode: unknown) => void>();

    render(
      <ReaderChrome
        visible={true}
        currentPage={1}
        totalPages={10}
        mode="single"
        onModeChange={onModeChange}
      />,
    );

    await user.click(screen.getByText('Double'));
    expect(onModeChange).toHaveBeenCalledWith('double');
  });

  it('fills the rail proportionally to the current page', () => {
    render(<ReaderChrome visible={true} currentPage={5} totalPages={10} />);

    expect(screen.getByTestId('reader-rail-fill')).toHaveClass('reader-progress-fill');
    expect(
      screen.getByTestId('reader-rail-fill').style.getPropertyValue('--reader-progress-scale'),
    ).toBe('0.4444444444444444');
  });

  it('uses one stage surface with a plate under each control row and a thin mode pill', () => {
    const { container } = render(
      <ReaderChrome
        visible={true}
        currentPage={5}
        totalPages={10}
        mode="single"
        onModeChange={vi.fn<(mode: unknown) => void>()}
      />,
    );

    const stage = container.querySelector('[data-testid="reader-chrome-stage"]');
    expect(stage).toHaveAttribute('data-glass-tier', 'stage');
    expect(stage).toHaveAttribute('aria-hidden', 'true');
    expect(container.querySelector('[data-testid="reader-chrome-gradient"]')).toHaveClass(
      'bg-gradient-to-b',
      'from-black/85',
      'to-transparent',
    );

    for (const row of container.querySelectorAll('[data-reader-chrome-row]')) {
      const plate = row.querySelector('[data-glass-plate]');
      expect(plate).toHaveClass('glass-plate', 'absolute', 'inset-0');
    }
    expect(container.querySelector('[data-testid="reader-mode-switcher"]')).toHaveAttribute(
      'data-glass-tier',
      'thin',
    );
  });
});
