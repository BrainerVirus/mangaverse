import { asc, eq } from 'drizzle-orm';
import type { AppResult, ThemeDefinition } from '@app/shared';
import { err, ok, parseThemeDefinitionShape } from '@app/shared';

import type { AppDrizzleDb } from '../adapter.js';
import { themes } from '../schema.js';

function toDefinition(row: typeof themes.$inferSelect): ThemeDefinition | undefined {
  const parsed = parseThemeDefinitionShape({
    ...(row.definitionJson as ThemeDefinition),
    id: row.id,
    name: row.name,
  });
  return parsed.ok ? parsed.value : undefined;
}

export async function listThemeDefinitions(db: AppDrizzleDb): Promise<readonly ThemeDefinition[]> {
  const rows = db.select().from(themes).orderBy(asc(themes.createdAt)).all();
  return rows.flatMap((row) => {
    const definition = toDefinition(row);
    return definition === undefined ? [] : [definition];
  });
}

export async function getThemeDefinition(
  db: AppDrizzleDb,
  themeId: string,
): Promise<ThemeDefinition | undefined> {
  const row = db.select().from(themes).where(eq(themes.id, themeId)).get();
  return row === undefined ? undefined : toDefinition(row);
}

export async function upsertThemeDefinition(
  db: AppDrizzleDb,
  definition: ThemeDefinition,
): Promise<AppResult<ThemeDefinition>> {
  const parsed = parseThemeDefinitionShape(definition);
  if (!parsed.ok) {
    return err(parsed.error);
  }

  const now = new Date().toISOString();
  await db
    .insert(themes)
    .values({
      id: parsed.value.id,
      name: parsed.value.name,
      definitionJson: parsed.value,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: themes.id,
      set: {
        name: parsed.value.name,
        definitionJson: parsed.value,
        updatedAt: now,
      },
    });
  return ok(parsed.value);
}

export async function deleteThemeDefinition(db: AppDrizzleDb, themeId: string): Promise<void> {
  await db.delete(themes).where(eq(themes.id, themeId));
}
