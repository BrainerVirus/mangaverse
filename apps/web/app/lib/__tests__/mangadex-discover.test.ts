import { describe, expect, it } from 'vitest';
import {
  getEnabledMangadexSections,
  MANGADEX_SECTION_DEFINITIONS,
} from '../../queries/mangadex-discover.js';

describe('getEnabledMangadexSections', () => {
  it('Given only the latest capability, When filtering, Then only the latest section is enabled', () => {
    const enabled = getEnabledMangadexSections({ 'discovery.latest': true });
    expect(enabled.map((section) => section.id)).toEqual(['latest']);
  });

  it('Given no declared capabilities, When filtering, Then no sections are enabled', () => {
    expect(getEnabledMangadexSections({})).toEqual([]);
  });

  it('Given both discovery capabilities, When filtering, Then every defined section is enabled', () => {
    const enabled = getEnabledMangadexSections({
      'discovery.latest': true,
      'discovery.popular': true,
    });
    expect(enabled.map((section) => section.id)).toEqual(
      MANGADEX_SECTION_DEFINITIONS.map((section) => section.id),
    );
  });
});
