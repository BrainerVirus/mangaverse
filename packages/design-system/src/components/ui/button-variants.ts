// The shadcn variant/size maps live outside button.tsx so the component file only
// exports components; the public API is unchanged (both are re-exported from src/index.ts).
//
// Every variant carries the base string, the way shadcn's `cva` puts its base class list
// first. Composing a variant *without* it (which the sidebar nav links used to do) drops
// `inline-flex items-center`, so the icon stacks above the label instead of sitting inline.
const buttonBase =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius-btn)] text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0';

export const buttonVariants = {
  default: `${buttonBase} bg-primary text-primary-foreground hover:bg-primary/90`,
  destructive: `${buttonBase} bg-destructive text-destructive-foreground hover:bg-destructive/90`,
  outline: `${buttonBase} border border-[var(--border)] bg-background hover:bg-accent hover:text-accent-foreground`,
  secondary: `${buttonBase} bg-secondary text-secondary-foreground hover:bg-secondary/80`,
  ghost: `${buttonBase} hover:bg-accent hover:text-accent-foreground`,
  link: `${buttonBase} text-primary underline-offset-4 hover:underline`,
} as const;

export const buttonSizes = {
  default: 'h-10 px-4 py-2',
  sm: 'h-9 rounded-[var(--radius-control)] px-3',
  lg: 'h-11 rounded-[var(--radius-btn)] px-8',
  icon: 'h-10 w-10',
} as const;
