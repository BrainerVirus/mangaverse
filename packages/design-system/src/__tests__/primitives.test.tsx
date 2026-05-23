import { describe, it, expect } from 'vitest';
import { cn } from '../lib/cn.js';

describe('cn() utility', () => {
  it('merges duplicate classes with tailwind-merge', () => {
    const result = cn('text-red-500', 'text-red-500');
    expect(result).toBe('text-red-500');
  });

  it('keeps non-conflicting classes', () => {
    const result = cn('text-red-500', 'bg-blue-500');
    expect(result).toContain('text-red-500');
    expect(result).toContain('bg-blue-500');
  });

  it('merges padding utilities correctly', () => {
    const result = cn('px-2 py-1', 'p-2');
    expect(result).toContain('p-2');
  });

  it('handles multiple class inputs', () => {
    const result = cn('flex', 'items-center', 'gap-2');
    expect(result).toContain('flex');
    expect(result).toContain('items-center');
    expect(result).toContain('gap-2');
  });

  it('handles conditional classes', () => {
    const result = cn('flex', { 'items-center': true, 'hidden': false });
    expect(result).toContain('flex');
    expect(result).toContain('items-center');
    expect(result).not.toContain('hidden');
  });

  it('handles empty inputs', () => {
    const result = cn();
    expect(result).toBe('');
  });

  it('resolves conflicting tailwind classes with tailwind-merge', () => {
    const result = cn('bg-red-500', 'bg-blue-500');
    expect(result).not.toContain('bg-red-500');
    expect(result).toContain('bg-blue-500');
  });

  it('handles clsx string array input', () => {
    const result = cn(['flex', 'items-center']);
    expect(result).toContain('flex');
    expect(result).toContain('items-center');
  });

  it('handles mixed inputs', () => {
    const result = cn('flex', ['items-center', 'gap-2'], { justify: true });
    expect(result).toContain('flex');
    expect(result).toContain('items-center');
    expect(result).toContain('gap-2');
    expect(result).toContain('justify');
  });

  it('returns a string type', () => {
    const result = cn('text-red-500');
    expect(typeof result).toBe('string');
  });

  it('handles object input', () => {
    const result = cn({ 'bg-blue-500': true, 'bg-red-500': false });
    expect(result).toContain('bg-blue-500');
    expect(result).not.toContain('bg-red-500');
  });
});