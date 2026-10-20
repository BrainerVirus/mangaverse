import { useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  cn,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  GlassSurface,
  Input,
  Label,
  PageHeader,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@app/design-system';

type GlassLevel = 'thin' | 'regular' | 'thick' | 'stage';
type ThemeName = 'light' | 'dark';
type GlassProfile = 'full' | 'reduced';

const glassTiers: { level: GlassLevel; blur: string; saturation: string }[] = [
  { level: 'thin', blur: '12px', saturation: '140%' },
  { level: 'regular', blur: '20px', saturation: '160%' },
  { level: 'thick', blur: '32px', saturation: '180%' },
  { level: 'stage', blur: '24px', saturation: '120%' },
];

const typeRoles = [
  {
    utility: 'type-display-xl',
    label: 'Display XL',
    sample: 'Stories in motion',
    spec: '34–48px · 600',
  },
  {
    utility: 'type-display-lg',
    label: 'Display LG',
    sample: 'A room for reading',
    spec: '28–36px · 600',
  },
  {
    utility: 'type-title',
    label: 'Title',
    sample: 'The quiet between chapters',
    spec: '24px · 600',
  },
  { utility: 'type-heading', label: 'Heading', sample: 'Recently added', spec: '18px · 600' },
  {
    utility: 'type-body',
    label: 'Body',
    sample: 'Your next chapter is ready when you are.',
    spec: '14px · 400',
  },
  {
    utility: 'type-body-lg',
    label: 'Body LG',
    sample: 'Pick up where the story left off.',
    spec: '16px · 400',
  },
  { utility: 'type-label', label: 'Label', sample: 'Continue reading', spec: '14px · 500' },
  { utility: 'type-meta', label: 'Meta', sample: 'Updated 12 minutes ago', spec: '12px · 400' },
  { utility: 'type-micro', label: 'Micro', sample: 'NEW CHAPTER', spec: '11px · 500' },
  { utility: 'type-code', label: 'Code', sample: 'chapter_014/page_032', spec: '13px · mono' },
] as const;

function Section({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section
      data-testid={`section-${id}`}
      aria-labelledby={`${id}-heading`}
      className="flex flex-col gap-5"
    >
      <div className="flex flex-col gap-1.5">
        <h2
          id={`${id}-heading`}
          // oxlint-disable-next-line shadcn/no-unknown-classes -- app lint misses @utility classes.
          className="type-heading"
        >
          {title}
        </h2>
        <p
          // oxlint-disable-next-line shadcn/no-unknown-classes -- app lint misses @utility classes.
          className="type-body text-muted-foreground"
        >
          {description}
        </p>
      </div>
      {children}
    </section>
  );
}

function GlassTierSample({
  level,
  theme,
  profile,
}: {
  level: GlassLevel;
  theme: ThemeName;
  profile: GlassProfile;
}) {
  const tier = glassTiers.find((entry) => entry.level === level)!;
  const sampleId = `glass-${profile}-tier-${level}-${theme}`;

  return (
    <div
      // oxlint-disable-next-line shadcn/no-unknown-classes -- app lint misses @utility classes.
      className={cn('flex flex-col gap-2 rounded-glass p-3', theme)}
      data-glass={profile === 'reduced' ? 'cheap' : undefined}
    >
      <div
        // oxlint-disable-next-line shadcn/no-unknown-classes -- app lint misses @utility classes.
        className="relative isolate overflow-hidden rounded-glass border border-border bg-background"
      >
        <div aria-hidden="true" className="absolute inset-0 grid grid-cols-4">
          <span className="bg-background" />
          <span className="bg-foreground" />
          <span className="bg-accent" />
          <span className="bg-secondary" />
        </div>
        <div className={cn(level === 'stage' && 'dark')}>
          <GlassSurface
            aria-hidden="true"
            level={level}
            data-testid={sampleId}
            className="min-h-24"
          />
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <span
          // oxlint-disable-next-line shadcn/no-unknown-classes -- app lint misses @utility classes.
          className="type-label text-foreground"
        >
          {level} glass
        </span>
        <span
          // oxlint-disable-next-line shadcn/no-unknown-classes -- app lint misses @utility classes.
          className="type-meta text-muted-foreground"
        >
          Configured {tier.blur} blur · {tier.saturation} saturation
        </span>
      </div>
    </div>
  );
}

function GlassScrimSample({ theme, profile }: { theme: ThemeName; profile: GlassProfile }) {
  return (
    <div
      // oxlint-disable-next-line shadcn/no-unknown-classes -- app lint misses @utility classes.
      className={cn('rounded-glass border border-border bg-accent p-3', theme)}
      data-glass={profile === 'reduced' ? 'cheap' : undefined}
    >
      <div
        data-testid={`glass-scrim-${profile}-${theme}`}
        // oxlint-disable-next-line shadcn/no-unknown-classes -- app lint misses @utility classes.
        className="glass-scrim rounded-glass p-4"
      >
        <p
          // oxlint-disable-next-line shadcn/no-unknown-classes -- app lint misses @utility classes.
          className={cn('type-label', theme === 'light' ? 'text-background' : 'text-foreground')}
        >
          Modal scrim · 55% fill · {profile === 'full' ? '8px blur' : 'blur removed'}
        </p>
      </div>
    </div>
  );
}

function GlassThemeSamples({ theme, profile }: { theme: ThemeName; profile: GlassProfile }) {
  return (
    <div className={cn('flex flex-col gap-3 rounded-box border border-border bg-card p-4', theme)}>
      <h3
        // oxlint-disable-next-line shadcn/no-unknown-classes -- app lint misses @utility classes.
        className="type-label text-foreground"
      >
        {theme === 'light' ? 'Light' : 'Dark'} ·{' '}
        {profile === 'full' ? 'full transparency' : 'reduced profile'}
      </h3>
      <div className="grid gap-3 sm:grid-cols-2">
        {glassTiers.map(({ level }) => (
          <GlassTierSample key={level} level={level} theme={theme} profile={profile} />
        ))}
        <GlassScrimSample theme={theme} profile={profile} />
      </div>
    </div>
  );
}

function GlassSection() {
  return (
    <Section
      id="glass"
      title="Glass materials"
      description="Four fixed tiers and the shared modal scrim. Semantic canvas and ink backdrops make both contrast profiles inspectable; thin glass stays text-free."
    >
      <div className="flex flex-col gap-6">
        {(['full', 'reduced'] as const).map((profile) => (
          <div key={profile} className="grid gap-4 xl:grid-cols-2">
            {(['light', 'dark'] as const).map((theme) => (
              <GlassThemeSamples key={`${profile}-${theme}`} theme={theme} profile={profile} />
            ))}
          </div>
        ))}
        <Alert data-testid="glass-fallback-note" role="note">
          <AlertTitle>Reduced transparency is a resolution, not a page control</AlertTitle>
          <AlertDescription>
            The reduced-profile samples use the same opaque fallback as{' '}
            <code>data-glass="cheap"</code>,<code> data-transparency="solid"</code>, unsupported
            blur, and
            <code> prefers-reduced-transparency</code>. The glass edge and elevation remain; the
            blur is removed.
          </AlertDescription>
        </Alert>
      </div>
    </Section>
  );
}

function TypographySection() {
  return (
    <Section
      id="type"
      title="Type roles"
      description="The ten type-* utilities, shown at their intended scale and weight."
    >
      <div className="grid gap-3 md:grid-cols-2">
        {typeRoles.map(({ utility, label, sample, spec }) => (
          <Card key={utility} className="h-full">
            <CardHeader className="gap-1 p-4">
              <CardTitle size="heading" className="flex items-center justify-between">
                <span>{label}</span>
                <code
                  // oxlint-disable-next-line shadcn/no-unknown-classes -- app lint misses @utility classes.
                  className="type-code text-muted-foreground"
                >
                  {utility}
                </code>
              </CardTitle>
              <CardDescription>{spec}</CardDescription>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <p data-testid={utility} className={utility}>
                {sample}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </Section>
  );
}

function ComponentSection() {
  const [activeTab, setActiveTab] = useState<'reading' | 'details'>('reading');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const dialogTrigger = useRef<HTMLButtonElement>(null);
  const closeDialog = () => {
    setDialogOpen(false);
    dialogTrigger.current?.focus();
  };

  return (
    <Section
      id="components"
      title="Component states"
      description="Real design-system primitives with local-only demo state; these controls do not change app settings or reader behavior."
    >
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader className="p-4 pb-3">
            <CardTitle size="heading">Buttons</CardTitle>
            <CardDescription>Shipped variants plus a glass composition.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-3 px-4 pb-4">
            <Button data-testid="button-default">Default</Button>
            <Button variant="outline" data-testid="button-outline">
              Outline
            </Button>
            <Button variant="ghost" data-testid="button-ghost">
              Ghost
            </Button>
            <Button variant="destructive" data-testid="button-destructive">
              Destructive
            </Button>
            <Button variant="secondary" data-testid="button-secondary">
              Secondary
            </Button>
            <Button variant="link" data-testid="button-link">
              Link
            </Button>
            <GlassSurface level="thin" data-testid="button-glass" className="w-fit">
              <Button variant="ghost" data-testid="button-glass-trigger">
                Glass composition
              </Button>
            </GlassSurface>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-4 pb-3">
            <CardTitle size="heading">Input and select</CardTitle>
            <CardDescription>Field labels stay attached to their controls.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 px-4 pb-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="design-system-query">Search titles</Label>
              <Input
                id="design-system-query"
                data-testid="input"
                defaultValue="The Moonlit Archive"
                placeholder="Search your library"
              />
              <Input
                aria-label="Disabled input sample"
                data-testid="input-disabled"
                disabled
                placeholder="Disabled"
              />
            </div>
            <div className="flex flex-col gap-2" data-testid="select">
              <Label htmlFor="design-system-tier">Glass tier</Label>
              <Select defaultValue="regular">
                <SelectTrigger id="design-system-tier" data-testid="select-trigger">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {glassTiers.map(({ level }) => (
                      <SelectItem key={level} value={level} data-testid={`select-option-${level}`}>
                        {level}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-4 pb-3">
            <CardTitle size="heading">Tabs</CardTitle>
            <CardDescription>Choose a tab to preview its selected state.</CardDescription>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="flex flex-col gap-3">
              <Tabs data-testid="tabs" className="flex flex-col items-start">
                <TabsList role="tablist" aria-label="Sample content">
                  {(['reading', 'details'] as const).map((tab) => (
                    <TabsTrigger
                      key={tab}
                      type="button"
                      id={`tab-${tab}`}
                      role="tab"
                      aria-selected={activeTab === tab}
                      data-state={activeTab === tab ? 'active' : 'inactive'}
                      data-testid={`tabs-trigger-${tab}`}
                      onClick={() => setActiveTab(tab)}
                    >
                      {tab === 'reading' ? 'Reading' : 'Details'}
                    </TabsTrigger>
                  ))}
                </TabsList>
                <TabsContent
                  role="tabpanel"
                  id="sample-tab-panel"
                  aria-labelledby={`tab-${activeTab}`}
                  data-testid="tabs-panel"
                >
                  {activeTab === 'reading'
                    ? 'Chapter 14 is ready to continue.'
                    : '12 chapters · Updated today'}
                </TabsContent>
              </Tabs>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-4 pb-3">
            <CardTitle size="heading">Badges and alerts</CardTitle>
            <CardDescription>Status uses labels as well as color.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 px-4 pb-4">
            <div data-testid="badge" className="flex flex-wrap gap-2">
              <Badge data-testid="badge-default">Library</Badge>
              <Badge variant="secondary" data-testid="badge-secondary">
                Updated
              </Badge>
              <Badge variant="outline" data-testid="badge-outline">
                12 chapters
              </Badge>
              <Badge variant="destructive" data-testid="badge-destructive">
                Content warning
              </Badge>
            </div>
            <Alert data-testid="alert">
              <AlertTitle>Progress saved</AlertTitle>
              <AlertDescription>Your place in the chapter is up to date.</AlertDescription>
            </Alert>
            <Alert variant="destructive" role="alert" data-testid="alert-destructive">
              <AlertTitle>Provider unavailable</AlertTitle>
              <AlertDescription>Try again when the source is reachable.</AlertDescription>
            </Alert>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-4 pb-3">
            <CardTitle size="heading">Dialog and sheet</CardTitle>
            <CardDescription>Open each real overlay primitive.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3 px-4 pb-4">
            <Button
              ref={dialogTrigger}
              data-testid="dialog-trigger"
              onClick={() => setDialogOpen(true)}
            >
              Open dialog
            </Button>
            {dialogOpen ? (
              <Dialog
                // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- public primitive renders a div.
                role="dialog"
                aria-modal="true"
                aria-labelledby="sample-dialog-title"
                aria-describedby="sample-dialog-description"
                data-testid="dialog-panel"
                onClick={(event) => {
                  if (event.target === event.currentTarget) closeDialog();
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    event.stopPropagation();
                    closeDialog();
                  }
                }}
              >
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle id="sample-dialog-title">A focused decision</DialogTitle>
                    <DialogDescription id="sample-dialog-description">
                      This dialog uses the shipped thick-glass panel and modal scrim.
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter className="mt-6">
                    <Button variant="outline" autoFocus onClick={closeDialog}>
                      Close dialog
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            ) : null}

            <Sheet open={sheetOpen} onOpenChange={(open) => setSheetOpen(open)}>
              <Button data-testid="sheet-trigger" onClick={() => setSheetOpen(true)}>
                Open sheet
              </Button>
              <SheetContent
                side="right"
                data-testid="sheet-panel"
                aria-describedby="sample-sheet-description"
              >
                <SheetHeader>
                  <SheetTitle>Quick settings</SheetTitle>
                  <SheetDescription id="sample-sheet-description">
                    A contextual side panel built from the shared glass surface.
                  </SheetDescription>
                </SheetHeader>
                <Separator />
                <p
                  // oxlint-disable-next-line shadcn/no-unknown-classes -- app lint misses @utility classes.
                  className="type-body text-foreground"
                >
                  Appearance · Full transparency
                </p>
              </SheetContent>
            </Sheet>
          </CardContent>
        </Card>
      </div>
    </Section>
  );
}

export function DesignSystemPage() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        title="Design system"
        description="A living reference for MangaVerse glass, type, and component states."
        actions={
          <Badge variant="secondary" data-testid="page-header-badge">
            Verification surface
          </Badge>
        }
      />
      <GlassSection />
      <Separator />
      <TypographySection />
      <Separator />
      <ComponentSection />
    </div>
  );
}
