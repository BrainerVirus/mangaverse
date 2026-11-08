--------------------------- MODULE ReaderSettings ---------------------------
(***************************************************************************)
(* The in-reader quick panel, its save path, and what the reader shows.   *)
(*                                                                         *)
(* Three layers of the same settings:                                     *)
(*   db*     SQLite: the global row and this title's overrides             *)
(*   cache*  the reader query's data (readerQueryKeys.chapter), which the  *)
(*           panel and the engine both render                             *)
(*   shown   what the reader actually lays out (resolveReaderPresentation  *)
(*           + the session's first-decode strip decision)                  *)
(*                                                                         *)
(* Impl = "current" is main 0c96b79e; "fixed" is the corrected action set. *)
(* Fields are cut to three, with values chosen to hit every resolution     *)
(* rule: mode {auto,rtl,ltr,vertical}, layout {auto,double}, fit           *)
(* {auto,height}. "gap" (strip gap) and "offset" (spread offset) are       *)
(* controls whose values never matter here, only whether they apply.       *)
(***************************************************************************)
EXTENDS Integers, Sequences, TLC

CONSTANTS
  Impl,           \* "current" | "fixed"
  Chapters,       \* chapter ids of one title, e.g. {1, 2}
  Shapes,         \* page shapes the title may have: subset of {"strip", "paged"}
  GlobalModes,    \* starting global reading modes, e.g. {"auto", "rtl"}
  MaxEdits,       \* panel edits + resets per behaviour
  AllowFailures,  \* a write may fail
  AllowRefetch    \* a refetch may start outside the save path (reconnect, Retry, hydration)

ASSUME Impl \in {"current", "fixed"}

Fields   == {"mode", "layout", "fit"}
Values   == [mode |-> {"auto", "rtl", "ltr", "vertical"},
             layout |-> {"auto", "double"},
             fit |-> {"auto", "height"}]
Unset    == "unset"
NoDir    == "none"
NoFetch  == [none |-> TRUE]
Default  == [mode |-> "auto", layout |-> "auto", fit |-> "auto"]
NoTitle  == [f \in Fields |-> Unset]

Concrete(m) == m \notin {Unset, "auto"}
Paged(m)    == m \in {"rtl", "ltr"}

\* A patch is a function over some fields. Apply / drop keys.
ApplyP(row, p) == [f \in Fields |-> IF f \in DOMAIN p THEN p[f] ELSE row[f]]
MergePatch(a, b) == [f \in (DOMAIN a \cup DOMAIN b) |-> IF f \in DOMAIN b THEN b[f] ELSE a[f]]
DropP(row, ks) == [f \in Fields |-> IF f \in ks THEN Unset ELSE row[f]]
Merged(g, t)   == [f \in Fields |-> IF t[f] = Unset THEN g[f] ELSE t[f]]

(***************************************************************************)
(* Resolution (resolve-reader-settings.ts:78-96, 124-133;                  *)
(* measured-page-shape.ts:92-117; use-reader-session.ts:43-62).            *)
(* Portrait viewport: Auto layout is single.                               *)
(***************************************************************************)
ModeOf(g, t, dec, storedStrip) ==
  IF Concrete(t.mode) THEN t.mode
  ELSE IF dec = "strip" \/ storedStrip THEN "vertical"
  ELSE IF g.mode /= "auto" THEN g.mode
  ELSE "ltr"
LayoutOf(g, t, mode) ==
  IF mode = "vertical" THEN "strip"
  ELSE IF Merged(g, t).layout = "auto" THEN "single" ELSE Merged(g, t).layout
\* The strip ignores the fit mode (ReaderScrollLayer.tsx has no fit input).
FitOf(g, t, mode) ==
  IF mode = "vertical" THEN "strip"
  ELSE IF Merged(g, t).fit = "auto" THEN "contain" ELSE Merged(g, t).fit

VARIABLES
  dbG, dbT, dbStored, dbDir,     \* SQLite; dbDir is the fixed model's stored paged direction
  shape,                         \* the title's page shape (fixed per behaviour)
  ch,                            \* open chapter, 0 = reader closed
  cacheG, cacheT, cacheV,        \* query data; cacheV tags the object (0 = fetched)
  cacheStored,                   \* the loaded pages carry stored dimensions
  decision,                      \* first-decode Auto-strip decision: none | strip | paged
  ref,                           \* lastPagedDirectionRef (ReaderScreen.tsx:438)
  panel, scope,                  \* quick panel open, and its "Applies to"
  fetch,                         \* an in-flight refetch of the open chapter: what it read
  pending,                       \* the coalescer's queued write (use-coalesced-settings-write.ts)
  queue, started,                \* mutations in scope reader-settings:<manga>, head running
  ver,                           \* edits so far; also the snapshot tag
  intG, intT,                    \* ghost: what the user's edits mean for the DB
  failed,                        \* ghost: a write failed and the banner said so
  seenDir,                       \* ghost: last paged direction shown for this title
  last, choice                   \* ghost: last action, last panel choice

vars == <<dbG, dbT, dbStored, dbDir, shape, ch, cacheG, cacheT, cacheV, cacheStored,
          decision, ref, panel, scope, fetch, pending, queue, started, ver,
          intG, intT, failed, seenDir, last, choice>>

ShownMode   == IF ch = 0 THEN "closed" ELSE ModeOf(cacheG, cacheT, decision, cacheStored /\ shape = "strip")
ShownLayout == LayoutOf(cacheG, cacheT, ShownMode)
ShownFit    == FitOf(cacheG, cacheT, ShownMode)

\* What the panel highlights (reader-settings-sheet.tsx:260-277: the merged
\* saved value). Fixed: the shown value, or Auto with its reason.
PanelMerged == Merged(cacheG, cacheT)
PressedMode ==
  IF Impl = "current" \/ PanelMerged.mode = ShownMode THEN PanelMerged.mode ELSE "auto"
PressedLayout ==
  IF Impl = "fixed" /\ ShownMode = "vertical" THEN "auto" ELSE PanelMerged.layout
PressedFit ==
  IF Impl = "fixed" /\ ShownMode = "vertical" THEN "auto" ELSE PanelMerged.fit

\* Whether a panel control can be used. Today every control is always live.
Enabled(f, v) ==
  Impl = "current" \/
  CASE f = "fit" /\ v /= "auto" -> ShownMode /= "vertical"
    [] f = "gap"                -> ShownMode = "vertical"
    [] f = "offset"             -> ShownLayout = "double"
    [] OTHER                    -> TRUE

NoOp == [kind |-> "none"]

Init ==
  /\ shape \in Shapes
  /\ dbG \in {[Default EXCEPT !.mode = m] : m \in GlobalModes}
  /\ dbT = NoTitle
  /\ dbStored = FALSE
  /\ dbDir = NoDir
  /\ ch = 0
  /\ cacheG = dbG /\ cacheT = dbT /\ cacheV = 0 /\ cacheStored = FALSE
  /\ decision = "none" /\ ref = NoDir
  /\ panel = FALSE /\ scope = "title"
  /\ fetch = NoFetch
  /\ pending = NoOp
  /\ queue = <<>> /\ started = FALSE
  /\ ver = 0
  /\ intG = dbG /\ intT = dbT
  /\ failed = FALSE
  /\ seenDir = NoDir
  /\ last = "start" /\ choice = [f |-> "none"]

-----------------------------------------------------------------------------
(* Opening, closing and switching chapters *)

\* Apply the ops not yet written over a read (fixed: an optimistic layer).
RECURSIVE Rebase(_, _, _)
Rebase(g, t, ops) ==
  IF ops = <<>> THEN <<g, t>>
  ELSE LET op == Head(ops)
       IN Rebase(ApplyP(g, op.pg), ApplyP(DropP(t, op.dropT), op.pt), Tail(ops))

Unwritten == IF pending = NoOp THEN queue ELSE Append(queue, pending)

\* Opening a chapter, Next/Previous chapter, or reopening after Close
\* (reader.$chapterId.tsx:49-52 remounts per chapter; :115-127 reads SQLite).
\* The old session's coalesced write keeps running (the timer outlives
\* unmount) and its onSettled only targets the old chapter's key.
OpenChapter(c) ==
  /\ c /= ch
  /\ ch' = c
  /\ IF Impl = "current"
       THEN cacheG' = dbG /\ cacheT' = dbT
       ELSE LET r == Rebase(dbG, dbT, Unwritten) IN cacheG' = r[1] /\ cacheT' = r[2]
  /\ cacheV' = 0
  /\ cacheStored' = dbStored
  /\ decision' = "none"
  /\ ref' = IF Impl = "current" THEN NoDir ELSE dbDir
  /\ panel' = FALSE /\ scope' = "title"
  /\ fetch' = NoFetch
  /\ last' = "OpenChapter"
  /\ UNCHANGED <<dbG, dbT, dbStored, shape, pending, queue, started, ver,
                 intG, intT, failed, choice>>

CloseReader ==
  /\ ch /= 0
  /\ ch' = 0 /\ panel' = FALSE /\ fetch' = NoFetch /\ decision' = "none"
  /\ last' = "CloseReader"
  /\ UNCHANGED <<dbG, dbT, dbStored, shape, cacheG, cacheT, cacheV, cacheStored,
                 ref, scope, pending, queue, started, ver, intG, intT, failed, choice>>

\* The first decoded page (use-reader-page-shape.ts:51-99,
\* measured-page-shape.ts:53-83): a clearly tall page switches Auto to the
\* strip for this open, and its size is written for the next open.
FirstDecode ==
  /\ ch /= 0 /\ decision = "none"
  /\ decision' = IF shape = "strip" /\ ~Concrete(cacheT.mode) /\ ShownMode /= "vertical"
                   THEN "strip" ELSE "paged"
  /\ dbStored' = TRUE
  /\ last' = "FirstDecode"
  /\ UNCHANGED <<dbG, dbT, shape, ch, cacheG, cacheT, cacheV, cacheStored, ref,
                 panel, scope, fetch, pending, queue, started, ver, intG, intT, failed, choice>>

-----------------------------------------------------------------------------
(* The quick panel *)

OpenPanel ==
  /\ ch /= 0 /\ ~panel
  /\ panel' = TRUE /\ scope' = "title"   \* QuickSettings remounts: scope starts at This title
  /\ last' = "OpenPanel"
  /\ UNCHANGED <<dbG, dbT, dbStored, shape, ch, cacheG, cacheT, cacheV, cacheStored,
                 decision, ref, fetch, pending, queue, started, ver, intG, intT, failed, choice>>

ClosePanel ==
  /\ panel
  /\ panel' = FALSE
  /\ last' = "ClosePanel"
  /\ UNCHANGED <<dbG, dbT, dbStored, shape, ch, cacheG, cacheT, cacheV, cacheStored,
                 decision, ref, scope, fetch, pending, queue, started, ver, intG, intT, failed, choice>>

SetScope(s) ==
  /\ panel /\ scope /= s
  /\ scope' = s
  /\ last' = "SetScope"
  /\ UNCHANGED <<dbG, dbT, dbStored, shape, ch, cacheG, cacheT, cacheV, cacheStored,
                 decision, ref, panel, fetch, pending, queue, started, ver, intG, intT, failed, choice>>

\* An op: global patch, title keys dropped, title patch.
OpOf(pg, dropT, pt, v, c, g, t) ==
  [kind |-> "save", pg |-> pg, dropT |-> dropT, pt |-> pt, v |-> v, ch |-> c, g |-> g, t |-> t]

\* A panel choice (reader-settings-sheet.tsx:256-309 -> ReaderScreen.tsx:440-454
\* -> withPagedDirectionOnLeavingStrip, reader-settings-change.ts:20-34
\* -> applyReaderSettingsChange, :49-76 -> reader.$chapterId.tsx:189-203).
Choose(f, v) ==
  /\ panel /\ ver < MaxEdits /\ Len(queue) < MaxEdits
  /\ Enabled(f, v)
  /\ LET sm      == ShownMode
         \* Fixed reads the title's stored paged direction, not a session ref.
         ref1    == IF sm /= "vertical" THEN sm ELSE IF Impl = "fixed" THEN dbDir ELSE ref
         leaving == sm = "vertical" /\ f = "layout"
         dir     == IF ref1 /= NoDir THEN ref1
                    ELSE IF Paged(cacheG.mode) THEN cacheG.mode ELSE "ltr"
         patch   == IF leaving THEN [x \in {f, "mode"} |-> IF x = f THEN v ELSE dir]
                    ELSE [x \in {f} |-> v]
         \* R7: This title adds to the title's choices; All titles changes the
         \* global row and drops the same keys from the title's choices.
         titleOp  == [pg |-> [x \in {} |-> Unset], dropT |-> {}, pt |-> patch]
         globalOp == [pg |-> patch, dropT |-> DOMAIN patch, pt |-> [x \in {} |-> Unset]]
         gG == ApplyP(cacheG, patch)
         gT == DropP(cacheT, DOMAIN patch)
         \* Fixed: All titles still takes effect on the open title when page
         \* shape or the strip decision would outrank the new global value.
         gMode == ModeOf(gG, gT, decision, cacheStored /\ shape = "strip")
         globalIneffective ==
           \/ (f = "mode" /\ Concrete(v) /\ gMode /= v)
           \/ (f = "layout" /\ leaving /\ gMode = "vertical")
         op0 == IF scope = "title" THEN titleOp
                ELSE IF Impl = "fixed" /\ globalIneffective
                       THEN [globalOp EXCEPT !.pt = patch]
                       ELSE globalOp
         op1 == IF Impl = "fixed" /\ pending /= NoOp
                  THEN [pg |-> MergePatch(pending.pg, op0.pg),
                        dropT |-> pending.dropT \cup op0.dropT,
                        pt |-> MergePatch([x \in (DOMAIN pending.pt \ op0.dropT) |-> pending.pt[x]], op0.pt)]
                  ELSE op0
         nG == ApplyP(cacheG, op0.pg)
         nT == ApplyP(DropP(cacheT, op0.dropT), op0.pt)
     IN /\ f \in Fields
        /\ ref' = ref1
        /\ cacheG' = nG /\ cacheT' = nT /\ cacheV' = ver + 1
        /\ pending' = OpOf(op1.pg, op1.dropT, op1.pt, ver + 1, ch, nG, nT)
        /\ intG' = ApplyP(intG, op0.pg)
        /\ intT' = ApplyP(DropP(intT, op0.dropT), op0.pt)
        /\ choice' = [f |-> f, v |-> v, fromStrip |-> sm = "vertical", seen |-> seenDir]
  /\ ver' = ver + 1
  /\ last' = "Choose"
  /\ UNCHANGED <<dbG, dbT, dbStored, shape, ch, cacheStored, decision, panel, scope,
                 fetch, queue, started, failed>>

\* Strip gap / spread offset: no state that matters here, only applicability.
Touch(f) ==
  /\ panel /\ Enabled(f, "any")
  /\ choice' = [f |-> f, v |-> "any", fromStrip |-> ShownMode = "vertical", seen |-> seenDir]
  /\ last' = "Choose"
  /\ UNCHANGED <<dbG, dbT, dbStored, shape, ch, cacheG, cacheT, cacheV, cacheStored,
                 decision, ref, panel, scope, fetch, pending, queue, started, ver, intG, intT, failed>>

\* "Reset title settings" (reader.$chapterId.tsx:277-281): cancels the
\* coalescer, queues saveSettings(null); no optimistic paint.
ResetTitle ==
  /\ panel /\ ver < MaxEdits /\ Len(queue) < MaxEdits
  /\ pending' = NoOp
  /\ queue' = Append(IF Impl = "fixed" /\ pending /= NoOp THEN Append(queue, pending) ELSE queue,
                     [kind |-> "reset", pg |-> [x \in {} |-> Unset], dropT |-> Fields,
                      pt |-> [x \in {} |-> Unset], v |-> ver + 1, ch |-> ch, g |-> cacheG, t |-> NoTitle])
  \* Current cancels the pending edit outright, so an All titles edit made in the
  \* last 300 ms never reaches the global row; fixed writes it before the reset.
  /\ intT' = NoTitle
  /\ intG' = intG
  /\ ver' = ver + 1
  /\ last' = "ResetTitle"
  /\ UNCHANGED <<dbG, dbT, dbStored, shape, ch, cacheG, cacheT, cacheV, cacheStored,
                 decision, ref, panel, scope, fetch, started, failed, choice>>

-----------------------------------------------------------------------------
(* The save path *)

\* The 300 ms quiet window ends (or pointer-up): mutate(pending).
Flush ==
  /\ pending /= NoOp /\ Len(queue) < MaxEdits
  /\ queue' = Append(queue, pending)
  /\ pending' = NoOp
  /\ last' = "Flush"
  /\ UNCHANGED <<dbG, dbT, dbStored, shape, ch, cacheG, cacheT, cacheV, cacheStored,
                 decision, ref, panel, scope, fetch, started, ver, intG, intT, failed, choice>>

\* The scope's head mutation starts: onMutate (reader.$chapterId.tsx:149-169)
\* cancels the open chapter's refetch and repaints the snapshot, but only
\* into its own chapter's key.
StartWrite ==
  /\ queue /= <<>> /\ ~started
  /\ LET op == Head(queue) IN
     /\ started' = TRUE
     /\ IF op.ch = ch /\ ch /= 0
          THEN /\ fetch' = NoFetch
               /\ IF Impl = "current" /\ op.kind = "save"
                    THEN cacheG' = op.g /\ cacheT' = op.t /\ cacheV' = op.v
                    ELSE UNCHANGED <<cacheG, cacheT, cacheV>>
          ELSE IF Impl = "fixed" /\ ch /= 0
                 THEN fetch' = NoFetch /\ UNCHANGED <<cacheG, cacheT, cacheV>>
                 ELSE UNCHANGED <<fetch, cacheG, cacheT, cacheV>>
  /\ last' = "StartWrite"
  /\ UNCHANGED <<dbG, dbT, dbStored, shape, ch, cacheStored, decision, ref, panel, scope,
                 pending, queue, ver, intG, intT, failed, choice>>

\* Re-read after a write: current onSettled (reader.$chapterId.tsx:177-185)
\* invalidates only its own chapter key, and only when the cache still holds
\* this snapshot object. Fixed: re-read the open chapter once nothing is
\* left to write, whichever chapter wrote.
Reread(op, g, t, isLast) ==
  IF Impl = "current"
    THEN IF op.ch = ch /\ ch /= 0 /\ (op.kind = "reset" \/ cacheV = op.v)
           THEN fetch' = [g |-> g, t |-> t, stored |-> dbStored]
           ELSE UNCHANGED fetch
    ELSE IF ch /= 0 /\ (isLast \/ fetch /= NoFetch)
           THEN fetch' = [g |-> g, t |-> t, stored |-> dbStored]
           ELSE UNCHANGED fetch

\* Current writes the snapshot it was given (saveReaderSettingsLayers,
\* save-title-reader-settings.ts:27-44: the whole global row and the whole
\* title row); fixed applies the op to the stored rows.
WriteOk ==
  /\ started
  /\ LET op == Head(queue)
         g  == IF Impl = "current"
                 THEN (IF op.kind = "reset" THEN dbG ELSE op.g)
                 ELSE ApplyP(dbG, op.pg)
         t  == IF Impl = "current"
                 THEN (IF op.kind = "reset" THEN NoTitle ELSE op.t)
                 ELSE ApplyP(DropP(dbT, op.dropT), op.pt)
     IN /\ dbG' = g /\ dbT' = t
        /\ Reread(op, g, t, Len(queue) = 1 /\ pending = NoOp)
  /\ queue' = Tail(queue) /\ started' = FALSE
  /\ last' = "WriteOk"
  /\ UNCHANGED <<dbStored, shape, ch, cacheG, cacheT, cacheV, cacheStored, decision, ref,
                 panel, scope, pending, ver, intG, intT, failed, choice>>

\* onError (reader.$chapterId.tsx:170-176): re-read the durable value and
\* report through the persistence banner.
WriteFail ==
  /\ AllowFailures /\ started
  /\ LET op == Head(queue) IN
     fetch' = IF (op.ch = ch \/ Impl = "fixed") /\ ch /= 0
                THEN [g |-> dbG, t |-> dbT, stored |-> dbStored] ELSE fetch
  /\ failed' = TRUE
  /\ queue' = Tail(queue) /\ started' = FALSE
  /\ last' = "WriteFail"
  /\ UNCHANGED <<dbG, dbT, dbStored, shape, ch, cacheG, cacheT, cacheV, cacheStored,
                 decision, ref, panel, scope, pending, ver, intG, intT, choice>>

\* A refetch from outside the save path: refetchOnReconnect (the chapter
\* query leaves it on, reader.$chapterId.tsx:115-127), the reader's Retry
\* (:234-248), a hydration finishing (:79-82).
ExternalRefetch ==
  /\ AllowRefetch /\ ch /= 0 /\ fetch = NoFetch
  /\ fetch' = [g |-> dbG, t |-> dbT, stored |-> dbStored]
  /\ last' = "ExternalRefetch"
  /\ UNCHANGED <<dbG, dbT, dbStored, shape, ch, cacheG, cacheT, cacheV, cacheStored,
                 decision, ref, panel, scope, pending, queue, started, ver, intG, intT, failed, choice>>

\* The refetch lands. Current replaces the data; fixed rebases the
\* unwritten ops on top of it.
FetchLand ==
  /\ ch /= 0 /\ fetch /= NoFetch
  /\ IF Impl = "current"
       THEN cacheG' = fetch.g /\ cacheT' = fetch.t
       ELSE LET r == Rebase(fetch.g, fetch.t, Unwritten)
            IN cacheG' = r[1] /\ cacheT' = r[2]
  /\ cacheV' = 0
  /\ cacheStored' = fetch.stored
  /\ fetch' = NoFetch
  /\ last' = "FetchLand"
  /\ UNCHANGED <<dbG, dbT, dbStored, shape, ch, decision, ref, panel, scope,
                 pending, queue, started, ver, intG, intT, failed, choice>>

Act ==
  \/ \E c \in Chapters : OpenChapter(c)
  \/ CloseReader
  \/ FirstDecode
  \/ OpenPanel \/ ClosePanel
  \/ \E s \in {"title", "global"} : SetScope(s)
  \/ \E f \in Fields : \E v \in Values[f] : Choose(f, v)
  \/ \E f \in {"gap", "offset"} : Touch(f)
  \/ ResetTitle
  \/ Flush \/ StartWrite \/ WriteOk \/ WriteFail
  \/ ExternalRefetch \/ FetchLand

\* The paged direction the user last saw for this title. Fixed stores it
\* with the title (dbDir) and seeds the session's ref from it.
Next ==
  /\ Act
  /\ seenDir' = IF Paged(ShownMode') THEN ShownMode' ELSE seenDir
  /\ dbDir'   = IF Impl = "fixed" /\ Paged(ShownMode') THEN ShownMode' ELSE dbDir

Spec == Init /\ [][Next]_vars

-----------------------------------------------------------------------------
(* Properties *)

Idle == pending = NoOp /\ queue = <<>> /\ fetch = NoFetch

\* Saved reflects UI: once nothing is left to write or read, the reader
\* shows what SQLite holds.
SavedReflectsUI ==
  (ch /= 0 /\ Idle) => (cacheG = dbG /\ cacheT = dbT)

\* No lost update: once nothing is left to write, SQLite holds every edit the
\* user made, unless a failure was reported.
NoLostUpdate ==
  (pending = NoOp /\ queue = <<>> /\ ~failed) => (dbG = intG /\ dbT = intT)

\* No ignored option: right after a panel choice, the reader shows it.
NoIgnoredOption ==
  last = "Choose" =>
    CASE choice.f = "mode" /\ Concrete(choice.v)    -> ShownMode = choice.v
      [] choice.f = "layout" /\ choice.v = "double" -> ShownLayout = "double"
      [] choice.f = "fit" /\ choice.v = "height"    -> ShownFit = "height"
      [] choice.f = "gap"                           -> ShownMode = "vertical"
      [] choice.f = "offset"                        -> ShownLayout = "double"
      [] OTHER                                      -> TRUE

\* Invalid combinations are never shown as applied: a highlighted panel
\* value is what the reader shows (or Auto).
PanelHonest ==
  ch /= 0 =>
    /\ Concrete(PressedMode) => PressedMode = ShownMode
    /\ PressedLayout = "double" => ShownLayout = "double"
    /\ PressedFit = "height" => ShownFit = "height"

\* Leaving the strip through a layout choice returns to the paged direction
\* the user last read this title in (07-reader.md, Bugs to fix #3).
KeepsPagedDirection ==
  (last = "Choose" /\ choice.f = "layout" /\ choice.fromStrip /\ Paged(choice.seen))
    => ShownMode = choice.seen

Alias ==
  [action |-> last, chapter |-> ch, shown |-> <<ShownMode, ShownLayout, ShownFit>>,
   panel |-> IF panel THEN <<scope, PressedMode, PressedLayout, PressedFit>> ELSE "closed",
   cache |-> <<cacheG, cacheT, cacheV>>, db |-> <<dbG, dbT>>, intended |-> <<intG, intT>>,
   pending |-> IF pending = NoOp THEN "none" ELSE <<pending.v, pending.ch>>,
   queue |-> [i \in 1..Len(queue) |-> <<queue[i].kind, queue[i].v, queue[i].ch>>],
   fetch |-> IF fetch = NoFetch THEN "none" ELSE <<fetch.g, fetch.t>>,
   decision |-> decision, seenDir |-> seenDir, choice |-> choice]

=============================================================================
