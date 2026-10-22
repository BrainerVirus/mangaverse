import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Slider } from '../components/ui/slider.js';

describe('Slider', () => {
  it('Given a value, Then the shared track reports the filled length as a CSS variable', () => {
    render(<Slider aria-label="Volume" value={25} min={0} max={100} onChange={() => {}} />);

    const slider = screen.getByRole('slider');
    expect(slider).toHaveClass('slider-track');
    expect(slider.style.getPropertyValue('--slider-fill')).toBe('25%');
  });

  it('Given a non-default range, Then the fill is the position inside that range', () => {
    render(<Slider aria-label="Zoom" value={0.5} min={0} max={1} step={0.1} onChange={() => {}} />);

    expect(screen.getByRole('slider').style.getPropertyValue('--slider-fill')).toBe('50%');
  });

  it('Given a value outside the range, Then the fill is clamped', () => {
    render(<Slider aria-label="Clamped" value={150} min={0} max={100} onChange={() => {}} />);

    expect(screen.getByRole('slider').style.getPropertyValue('--slider-fill')).toBe('100%');
  });
});
