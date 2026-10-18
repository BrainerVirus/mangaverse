import { describe, expect, it } from 'vitest';
import { getEnabledSections, getSectionTitle } from '@/queries/provider-discover.js';
import { getProviderBinding, type ProviderAppBinding } from '../provider-registry.js';

function registeredBinding(): ProviderAppBinding {
  const binding = getProviderBinding('mangadex');
  if (binding === null) throw new Error('mangadex provider binding is not registered');
  return binding;
}

const binding = registeredBinding();

describe('getEnabledSections', () => {
  it('Given only the latest capability, When filtering, Then only the latest section is enabled', () => {
    expect(getEnabledSections(binding, { 'discovery.latest': true }).map((s) => s.id)).toEqual([
      'latest',
    ]);
  });

  it('Given no declared capabilities, When filtering, Then no sections are enabled', () => {
    expect(getEnabledSections(binding, {})).toEqual([]);
  });

  it('Given both discovery capabilities, When filtering, Then every declared section is enabled', () => {
    const enabled = getEnabledSections(binding, {
      'discovery.latest': true,
      'discovery.popular': true,
    });
    expect(enabled.map((section) => section.id)).toEqual(
      binding.sections.map((section) => section.id),
    );
  });
});

describe('getSectionTitle', () => {
  it('Given a declared section, When resolved, Then its title is returned', () => {
    expect(getSectionTitle(binding, 'popular')).toBe('Popular');
  });

  it('Given an unknown section, When resolved, Then nothing is returned', () => {
    expect(getSectionTitle(binding, 'nope')).toBeNull();
  });
});
