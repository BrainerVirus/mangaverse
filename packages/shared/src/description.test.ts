import { describe, expect, it } from 'vitest';
import { toReadableDescription } from './description.js';

/** The recorded MangaDex description the production E2E seeds into the local database. */
const SEEDED_DESCRIPTION =
  '"If you truly want to get stronger, you have to challenge and defeat those stronger than yourself."\n\nWhile being transmigrated to another world, Kelvin bartered away his memories for a collection of powerful new abilities. Setting out on the ultimate adventure as the world’s strongest Summoner — with his first Follower being the very goddess who brought him over! — he soon discovers his true nature as a battle junkie. Someone wants to pick a fight? Sure, bring it on!\n\nFacing off against one formidable foe after another, Kelvin can hardly contain his delight as he revels in the absolute exhilaration of a good fight! The curtain rises on the start of an epic saga as this black-clad warrior and his allies carve their way into the annals of history! \n___\n**Character Designer:** [Kurogin (DIGS)](https://mangadex.org/author/ad469135-32c7-4fcc-b490-d0ebc07eea16)\n\n**Additional Links:**  \n- [Official Raw Web Novel](https://ncode.syosetu.com/n1222ci/)\n- [Official English Light Novel](https://j-novel.club/series/black-summoner)';

describe('toReadableDescription', () => {
  it('Given the seeded Markdown description, Then no raw syntax survives', () => {
    const text = toReadableDescription(SEEDED_DESCRIPTION);

    expect(text).not.toContain('**');
    expect(text).not.toContain('___');
    expect(text).not.toContain('](');
    expect(text).toContain('Character Designer: Kurogin (DIGS)');
    expect(text).toContain('• Official Raw Web Novel');
    expect(text).toContain('• Official English Light Novel');
  });

  it('Given a provider description, Then headings, quotes, rules and emphasis become plain text', () => {
    const text = toReadableDescription(
      '# About\n> Quoted line\n__Underlined__ and *italic* and `code` and ~~struck~~\n\n---\n',
    );

    expect(text).toBe('About\nQuoted line\nUnderlined and italic and code and struck');
  });

  it('Given snake_case and links with parentheses, Then prose is not mangled', () => {
    const text = toReadableDescription(
      'The hero_name stays. See [the wiki](https://example.com/a_(b)) for more.',
    );

    expect(text).toBe('The hero_name stays. See the wiki for more.');
  });

  it('Given an empty or whitespace-only description, Then the result is empty', () => {
    expect(toReadableDescription('  \n\n ')).toBe('');
  });
});
