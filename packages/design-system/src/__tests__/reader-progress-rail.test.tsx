import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ReaderProgressRail } from '../components/reader-progress-rail.js';

// jsdom ships no PointerEvent, so clientX would be dropped from fired events.
if (typeof window.PointerEvent === 'undefined') {
  class PointerEventPolyfill extends MouseEvent {}
  (window as unknown as { PointerEvent: typeof MouseEvent }).PointerEvent = PointerEventPolyfill;
  (globalThis as unknown as { PointerEvent: typeof MouseEvent }).PointerEvent =
    PointerEventPolyfill;
}

beforeEach(() => {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 100,
    bottom: 8,
    width: 100,
    height: 8,
    toJSON: () => ({}),
  } as DOMRect);
});

describe('ReaderProgressRail', () => {
  it('Given a half-progress value, When rendered, Then the fill is scaled to the value', () => {
    render(
      <ReaderProgressRail value={5} min={1} max={10} onChange={vi.fn<(value: number) => void>()} />,
    );
    expect(screen.getByTestId('reader-rail-fill').style.transform).toBe(
      'scaleX(0.4444444444444444)',
    );
  });

  it('Given a half-progress value, When rendered, Then the thumb sits at that fraction of the track', () => {
    render(
      <ReaderProgressRail value={5} min={1} max={10} onChange={vi.fn<(value: number) => void>()} />,
    );
    // (5 - 1) / (10 - 1) = 44.44% — a percentage translate would only move the
    // thumb by its own 16px box, which this pins against.
    expect(screen.getByTestId('reader-rail-thumb').style.left).toBe('44.44444444444444%');
  });

  it('Given a pointer at a quarter of the track, When pressed, Then the value follows the position', () => {
    const onChange = vi.fn<(value: number) => void>();
    render(<ReaderProgressRail value={1} min={1} max={11} onChange={onChange} />);
    const track = screen.getByRole('slider', { name: 'Page slider' });

    fireEvent.pointerDown(track, { clientX: 25, pointerId: 1 });
    // ratio 0.25 over a span of 10 → round(1 + 2.5) = 4
    expect(onChange).toHaveBeenCalledWith(4);
  });

  it('Given a focused rail, When arrow keys and Home/End are pressed, Then the value moves by one and to the bounds', () => {
    const onChange = vi.fn<(value: number) => void>();
    render(<ReaderProgressRail value={5} min={1} max={10} onChange={onChange} />);
    const track = screen.getByRole('slider', { name: 'Page slider' });

    fireEvent.keyDown(track, { key: 'ArrowRight' });
    fireEvent.keyDown(track, { key: 'ArrowLeft' });
    fireEvent.keyDown(track, { key: 'Home' });
    fireEvent.keyDown(track, { key: 'End' });

    expect(onChange).toHaveBeenNthCalledWith(1, 6);
    expect(onChange).toHaveBeenNthCalledWith(2, 4);
    expect(onChange).toHaveBeenNthCalledWith(3, 1);
    expect(onChange).toHaveBeenNthCalledWith(4, 10);
  });

  it('Given a preview renderer, When hovering the rail, Then the preview appears and leaves with the pointer', () => {
    render(
      <ReaderProgressRail
        value={3}
        min={1}
        max={10}
        onChange={vi.fn<(value: number) => void>()}
        renderPreview={(page) => <div>preview {page}</div>}
      />,
    );
    const track = screen.getByRole('slider', { name: 'Page slider' });

    expect(screen.queryByTestId('reader-rail-preview')).not.toBeInTheDocument();
    fireEvent.pointerEnter(track, { clientX: 50 });
    fireEvent.pointerMove(track, { clientX: 50, pointerId: 1 });
    expect(screen.getByTestId('reader-rail-preview')).toBeInTheDocument();
    expect(screen.getByText(/preview \d+/)).toBeInTheDocument();

    fireEvent.pointerLeave(track);
    expect(screen.queryByTestId('reader-rail-preview')).not.toBeInTheDocument();
  });

  it('Given a drag in progress, When the pointer moves, Then the value keeps following until release', () => {
    const onChange = vi.fn<(value: number) => void>();
    const onScrubEnd = vi.fn<() => void>();
    render(
      <ReaderProgressRail value={1} min={1} max={11} onChange={onChange} onScrubEnd={onScrubEnd} />,
    );
    const track = screen.getByRole('slider', { name: 'Page slider' });

    fireEvent.pointerDown(track, { clientX: 10, pointerId: 1 });
    fireEvent.pointerMove(track, { clientX: 90, pointerId: 1 });
    fireEvent.pointerUp(track, { clientX: 90, pointerId: 1 });

    expect(onChange).toHaveBeenLastCalledWith(10);
    expect(onScrubEnd).toHaveBeenCalledTimes(1);
  });
});
