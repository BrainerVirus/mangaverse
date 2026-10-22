/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { toProviderId, toProviderMangaId, toProviderMappingId } from '@app/shared';
import { MangaProviderSwitcher } from './MangaProviderSwitcher.js';

const MAP_A = toProviderMappingId('map-a');
const MAP_B = toProviderMappingId('map-b');

const mappings = [
  {
    id: MAP_A,
    providerId: toProviderId('prov-a'),
    providerMangaId: toProviderMangaId('remote-a'),
  },
  {
    id: MAP_B,
    providerId: toProviderId('prov-b'),
    providerMangaId: toProviderMangaId('remote-b'),
  },
];

describe('MangaProviderSwitcher', () => {
  it('shows every mapping with default, chapter source and viewing indicators', () => {
    render(
      <MangaProviderSwitcher
        mappings={mappings}
        defaultMappingId={MAP_A}
        preferredMappingId={MAP_B}
        activeMappingId={MAP_A}
        providerLabels={{ 'prov-a': 'Provider A', 'prov-b': 'Provider B' }}
        onSelectMapping={() => {}}
        onSetDefault={() => {}}
        onSetPreferred={() => {}}
      />,
    );

    expect(screen.getByText('Provider A')).toBeInTheDocument();
    expect(screen.getByText('Provider B')).toBeInTheDocument();
    expect(screen.getByText(/remote-a/)).toBeInTheDocument();
    expect(screen.getByText(/remote-b/)).toBeInTheDocument();
    expect(screen.getByText('Default')).toBeInTheDocument();
    expect(screen.getByText('Chapter source')).toBeInTheDocument();
    expect(screen.getByText('Viewing')).toBeInTheDocument();
  });

  it('switches the viewed mapping, default provider and chapter source', () => {
    const onSelectMapping = vi.fn<(mappingId: typeof MAP_B) => void>();
    const onSetDefault = vi.fn<(mappingId: typeof MAP_B) => void>();
    const onSetPreferred = vi.fn<(mappingId: typeof MAP_B) => void>();

    render(
      <MangaProviderSwitcher
        mappings={mappings}
        defaultMappingId={MAP_A}
        activeMappingId={MAP_A}
        providerLabels={{ 'prov-a': 'Provider A', 'prov-b': 'Provider B' }}
        onSelectMapping={onSelectMapping}
        onSetDefault={onSetDefault}
        onSetPreferred={onSetPreferred}
      />,
    );

    fireEvent.click(screen.getAllByRole('button', { name: 'View chapters' })[0]!);
    expect(onSelectMapping).toHaveBeenCalledWith(MAP_B);

    fireEvent.click(screen.getAllByRole('button', { name: 'Set default' })[0]!);
    expect(onSetDefault).toHaveBeenCalledWith(MAP_B);

    fireEvent.click(screen.getAllByRole('button', { name: 'Use for chapters' })[1]!);
    expect(onSetPreferred).toHaveBeenCalledWith(MAP_B);
  });

  it('keeps the selection and shows the error when a switch fails', async () => {
    const onSelectMapping = vi.fn<() => Promise<void>>(async () => {
      throw new Error('Provider switch failed.');
    });

    render(
      <MangaProviderSwitcher
        mappings={mappings}
        defaultMappingId={MAP_A}
        activeMappingId={MAP_A}
        onSelectMapping={onSelectMapping}
      />,
    );

    fireEvent.click(screen.getAllByRole('button', { name: 'View chapters' })[0]!);
    expect(await screen.findByRole('alert')).toHaveTextContent('Provider switch failed.');
    expect(screen.getByText('Viewing')).toBeInTheDocument();
  });

  it('renders an empty state when no provider is attached', () => {
    render(
      <MangaProviderSwitcher mappings={[]} defaultMappingId={MAP_A} activeMappingId={MAP_A} />,
    );

    expect(screen.getByText('No provider source is attached to this title.')).toBeInTheDocument();
  });
});
