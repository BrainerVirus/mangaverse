import { z } from 'zod';

export const DEFAULT_RENDERER_PORT = 45123;

const rendererPortSchema = z.coerce.number().int().min(1).max(65535).catch(DEFAULT_RENDERER_PORT);

export function resolveRendererPort(value: string | undefined): number {
  return rendererPortSchema.parse(value);
}
