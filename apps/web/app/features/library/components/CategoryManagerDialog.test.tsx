/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { toCategoryId, type LibraryCategory } from '@app/shared';
import { CategoryManagerDialog } from './CategoryManagerDialog.js';
import type { LibraryOrganizationAction } from '../types.js';

const categories: readonly LibraryCategory[] = [{ id: toCategoryId('fantasy'), name: 'Fantasy' }];

const FALLBACK = 'Could not save the category.';
const userFacing = { code: 'category.duplicate', message: 'A category with that name exists.' };

function renderDialog(onOrganize: (action: LibraryOrganizationAction) => Promise<void>) {
  render(
    <CategoryManagerDialog
      open
      categories={categories}
      onOpenChange={() => {}}
      onOrganize={onOrganize}
    />,
  );
  return screen.getByRole('dialog');
}

async function failCreate(dialog: HTMLElement) {
  fireEvent.change(within(dialog).getByLabelText('New category'), { target: { value: 'Action' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Add' }));
  return within(dialog).findByRole('alert');
}

async function failRename(dialog: HTMLElement) {
  fireEvent.click(within(dialog).getByRole('button', { name: 'Rename Fantasy' }));
  fireEvent.change(within(dialog).getByRole('textbox', { name: 'Rename Fantasy' }), {
    target: { value: 'Fantasy 2' },
  });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
  return within(dialog).findByRole('alert');
}

async function failDelete(dialog: HTMLElement) {
  fireEvent.click(within(dialog).getByRole('button', { name: 'Delete Fantasy' }));
  fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm delete Fantasy' }));
  return within(dialog).findByRole('alert');
}

const actions = [
  ['create', failCreate],
  ['rename', failRename],
  ['delete', failDelete],
] as const;

describe('CategoryManagerDialog failure copy', () => {
  it.each(actions)(
    'Given a %s that throws an Error, Then the fallback copy shows and the internal text never renders',
    async (_name, fail) => {
      const dialog = renderDialog(async () => {
        throw new Error('INTERNAL_SECRET category');
      });
      expect(await fail(dialog)).toHaveTextContent(FALLBACK);
      expect(dialog).not.toHaveTextContent('INTERNAL_SECRET');
    },
  );

  it.each(actions)(
    'Given a %s that throws an AppError, Then its user-facing message shows',
    async (_name, fail) => {
      const dialog = renderDialog(async () => {
        // eslint-disable-next-line @typescript-eslint/only-throw-error -- a serialized AppError crosses the data process as a plain object
        throw userFacing;
      });
      expect(await fail(dialog)).toHaveTextContent(userFacing.message);
    },
  );

  it('Given an empty name, Then the validation copy shows without calling the write', () => {
    const onOrganize = vi.fn<(action: LibraryOrganizationAction) => Promise<void>>(async () => {});
    const dialog = renderDialog(onOrganize);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add' }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Category name cannot be empty.');
    expect(onOrganize).not.toHaveBeenCalled();
  });
});
