// The shadcn variant/size maps live outside button.tsx so the component file only
// exports components; the public API is unchanged (both are re-exported from src/index.ts).
export const buttonVariants = {
  default: 'bg-primary text-primary-foreground hover:bg-primary/90',
  destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
  outline:
    'border border-[var(--border)] bg-background hover:bg-accent hover:text-accent-foreground',
  secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
  ghost: 'hover:bg-accent hover:text-accent-foreground',
  link: 'text-primary underline-offset-4 hover:underline',
} as const;

export const buttonSizes = {
  default: 'h-10 px-4 py-2',
  sm: 'h-9 rounded-[var(--radius-control)] px-3',
  lg: 'h-11 rounded-[var(--radius-btn)] px-8',
  icon: 'h-10 w-10',
} as const;
