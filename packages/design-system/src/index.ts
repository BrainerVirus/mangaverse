// @app/design-system
export const PACKAGE_NAME = '@app/design-system' as const;

export { cn } from './lib/cn.js';
export { useStateReducer } from './hooks/use-state-reducer.js';

export { Button } from './components/ui/button.js';
export { buttonVariants, buttonSizes } from './components/ui/button-variants.js';
export {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from './components/ui/card.js';
export {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from './components/ui/dialog.js';
export {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from './components/ui/sheet.js';
export {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from './components/ui/command.js';
export { Badge } from './components/ui/badge.js';
export { Skeleton } from './components/ui/skeleton.js';
export { Input } from './components/ui/input.js';
export { Label } from './components/ui/label.js';
export { Switch } from './components/ui/switch.js';
export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectItem,
} from './components/ui/select.js';
export { Slider } from './components/ui/slider.js';
export { Tabs, TabsList, TabsTrigger, TabsContent } from './components/ui/tabs.js';
export { Alert, AlertTitle, AlertDescription } from './components/ui/alert.js';
export { Separator } from './components/ui/separator.js';
export { Tooltip } from './components/ui/tooltip.js';

export { GlassSurface, useGlassLevel } from './components/glass-surface.js';
export type { GlassSurfaceProps } from './components/glass-surface.js';
export {
  glassLevels,
  glassElevations,
  GLASS_IMAGERY_TIERS,
  GLASS_BLUR_BUDGET,
  glassPanelPadding,
} from './components/glass-variants.js';
export type {
  GlassLevel,
  GlassTone,
  GlassElevation,
  GlassPanelPadding,
} from './components/glass-variants.js';
export { RefractionLayer } from './components/refraction-layer.js';
export type { RefractionLayerProps } from './components/refraction-layer.js';
export { GlassPanel } from './components/glass-panel.js';
export type { GlassPanelProps } from './components/glass-panel.js';
export { AmbientBackdrop } from './components/ambient-backdrop.js';
export { resolveGlassProfile } from './lib/glass-profile.js';
export type { GlassProfileInput } from './lib/glass-profile.js';

export { PageHeader } from './components/page-header.js';

export { MangaCard } from './components/manga-card.js';
export { EmptyState } from './components/empty-state.js';
export { LoadingState } from './components/loading-state.js';
export { ErrorState } from './components/error-state.js';
export { Toaster, notify } from './components/toast.js';
export { SettingsSection } from './components/settings-section.js';
export { ReaderChrome } from './components/reader-chrome.js';
export { ThemePreview } from './components/theme-preview.js';

export type { PageHeaderProps } from './components/page-header.js';
export type { MangaCardProps } from './components/manga-card.js';
export type { EmptyStateProps } from './components/empty-state.js';
export type { LoadingStateProps } from './components/loading-state.js';
export type { ErrorStateProps } from './components/error-state.js';
export type { NotifyFailureInput } from './components/toast.js';
export type { SettingsSectionProps } from './components/settings-section.js';
export type { ReaderChromeProps, ReaderMode } from './components/reader-chrome.js';
export type { ThemePreviewProps, ThemeDefinition } from './components/theme-preview.js';
