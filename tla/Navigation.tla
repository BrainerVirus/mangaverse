----------------------------- MODULE Navigation -----------------------------
(***************************************************************************)
(* App navigation over a browser-style history stack (TanStack Router on   *)
(* createBrowserHistory, the default in apps/web/app/router.tsx:26; the    *)
(* Electron renderer uses the same router, apps/desktop/src/renderer/src/  *)
(* App.tsx:5).                                                             *)
(*                                                                         *)
(* Impl = "current" models main 0c96b79e; Impl = "fixed" models the        *)
(* corrected actions the counterexamples call for. Each action names the   *)
(* code it abstracts.                                                      *)
(*                                                                         *)
(* A history entry is a record. k/m/c/s are what the URL shows:            *)
(*   k  page kind: library, discover, search, manga, reader                *)
(*   m  manga id (0 when none), c chapter (0 when none)                    *)
(*   s  Discover section flag: 1 = ?provider&section (one section open)    *)
(* o is ghost data, not in the URL: the list the user started from, so an  *)
(* invariant can say where Back must land. "manga" means opened as a       *)
(* related title from another detail page, "none" a deep link.             *)
(***************************************************************************)
EXTENDS Integers, Sequences, TLC

CONSTANTS Impl, DeepLinks, Manga, MaxChapter, MaxHist

ASSUME Impl \in {"current", "fixed"} /\ DeepLinks \in BOOLEAN

Lists   == {"library", "discover", "search"}
Origins == Lists \cup {"manga", "none"}
Chapters == 1..MaxChapter

Page(k, m, c, s, o) == [k |-> k, m |-> m, c |-> c, s |-> s, o |-> o]
ListPage(l)         == Page(l, 0, 0, 0, "none")
SectionPage         == Page("discover", 0, 0, 1, "none")
MangaPage(m, o)     == Page("manga", m, 0, 0, o)
ReaderPage(m, c, o) == Page("reader", m, c, 0, o)

\* Cold start or deep link: the page is the only history entry.
EntryPages ==
  {ListPage(l) : l \in Lists} \cup {SectionPage}
    \cup {MangaPage(m, "none") : m \in Manga}
    \cup {ReaderPage(m, c, "none") : m \in Manga, c \in Chapters}

VARIABLES
  hist,   \* the history stack (window.history entries)
  idx,    \* the current entry (TanStack's __TSR_index + 1)
  last,   \* the last user action, for the step invariants
  prev    \* the entry shown before the last action

vars == <<hist, idx, last, prev>>

cur == hist[idx]
View(p) == [k |-> p.k, m |-> p.m, c |-> p.c, s |-> p.s]

\* history.push truncates the forward entries.
Push(p)    == /\ hist' = Append(SubSeq(hist, 1, idx), p)
              /\ idx' = idx + 1
Replace(p) == /\ hist' = [hist EXCEPT ![idx] = p]
              /\ UNCHANGED idx
GoTo(j)    == /\ hist' = hist
              /\ idx' = j
Did(name)  == /\ last' = name
              /\ prev' = cur

\* DeepLinks = FALSE starts at the cold-start page only: "/" redirects to
\* /discover (routes/index.tsx:6-8). TRUE also starts on any deep link.
Init ==
  /\ \E p \in (IF DeepLinks THEN EntryPages ELSE {ListPage("discover")}) : hist = <<p>>
  /\ idx = 1
  /\ last = "start"
  /\ prev = hist[1]

-----------------------------------------------------------------------------
(* User actions *)

\* Sidebar / bottom nav / command palette Link (DesktopSidebar.tsx:23,
\* CommandPalette.tsx:48-62). The reader is full screen: no sidebar there.
\* A Link to the URL already shown does not add an entry.
Sidebar(l) ==
  /\ cur.k /= "reader"
  /\ View(cur) /= View(ListPage(l))
  /\ Push(ListPage(l))
  /\ Did("Sidebar")

\* Library card (library.tsx:81), Discover card (discover.tsx:221),
\* Search result (search.tsx:242), related title (manga.$id.tsx:391).
OpenManga(m) ==
  \/ /\ cur.k \in Lists
     /\ Push(MangaPage(m, cur.k))
     /\ Did("OpenManga")
  \/ /\ cur.k = "manga"
     /\ cur.m /= m
     /\ Push(MangaPage(m, "manga"))
     /\ Did("OpenRelated")

\* Chapter row on the detail page (manga.$id.tsx:335-336).
OpenChapter(c) ==
  /\ cur.k = "manga"
  /\ Push(ReaderPage(cur.m, c, cur.o))
  /\ Did("OpenChapter")

\* Continue reading from a library card (library.tsx:85-87).
ContinueReading(m) ==
  /\ cur = ListPage("library")
  /\ Push(ReaderPage(m, 1, "library"))
  /\ Did("ContinueReading")

\* Next / previous chapter (reader.$chapterId.tsx:295-300): a push today.
\* Fixed: replace, so a reading session is one history entry.
ChapterStep(d) ==
  /\ cur.k = "reader"
  /\ cur.c + d \in Chapters
  /\ LET p == ReaderPage(cur.m, cur.c + d, cur.o)
     IN IF Impl = "current" THEN Push(p) ELSE Replace(p)
  /\ Did(IF d = 1 THEN "NextChapter" ELSE "PreviousChapter")

\* Close button or Escape (reader.$chapterId.tsx:301-307,
\* use-reader-listeners.ts:50-52): pushes /manga/$id today.
\* Fixed: return to the detail entry the reader was opened from (the
\* reader carries a `from: manga` marker in location state), else replace
\* the reader with the detail page.
ReaderClose ==
  /\ cur.k = "reader"
  /\ IF Impl = "current"
       THEN Push(MangaPage(cur.m, cur.o))
       ELSE IF idx > 1 /\ hist[idx - 1].k = "manga" /\ hist[idx - 1].m = cur.m
              THEN GoTo(idx - 1)
              ELSE Replace(MangaPage(cur.m, cur.o))
  /\ Did("ReaderClose")

\* The detail page's Back (manga.$id.tsx:327-333 -> goBackOrLibrary,
\* manga-detail-route-helpers.ts:285-295): history.back() when
\* canGoBack (__TSR_index /= 0), else push /library.
\* Fixed: the fallback replaces instead of pushing.
MangaBack ==
  /\ cur.k = "manga"
  /\ IF idx > 1
       THEN GoTo(idx - 1)
       ELSE IF Impl = "current" THEN Push(ListPage("library"))
                                ELSE Replace(ListPage("library"))
  /\ Did("MangaBack")

\* Discover "See all" (discover.tsx:222-224).
SeeAll ==
  /\ cur = ListPage("discover")
  /\ Push(SectionPage)
  /\ Did("SeeAll")

\* Discover section Back (discover.tsx:225-231): pushes ?provider today.
\* Fixed: history.back() when the entry below is the feed, else replace.
BackFromSection ==
  /\ cur = SectionPage
  /\ IF Impl = "current"
       THEN Push(ListPage("discover"))
       ELSE IF idx > 1 /\ hist[idx - 1] = ListPage("discover")
              THEN GoTo(idx - 1)
              ELSE Replace(ListPage("discover"))
  /\ Did("BackFromSection")

\* Browser / OS back and forward: Alt+Left, a mouse back button, a swipe.
SystemBack    == /\ idx > 1
                 /\ GoTo(idx - 1)
                 /\ Did("SystemBack")
SystemForward == /\ idx < Len(hist)
                 /\ GoTo(idx + 1)
                 /\ Did("SystemForward")

\* A reload keeps the stack in both Electron and the browser, so it is a
\* stutter here; a reload that loses the stack is a new Init (deep link).

Next ==
  \/ \E l \in Lists : Sidebar(l)
  \/ \E m \in Manga : OpenManga(m) \/ ContinueReading(m)
  \/ \E c \in Chapters : OpenChapter(c)
  \/ ChapterStep(1) \/ ChapterStep(-1)
  \/ ReaderClose
  \/ MangaBack
  \/ SeeAll
  \/ BackFromSection
  \/ SystemBack
  \/ SystemForward

Spec == Init /\ [][Next]_vars

HistoryBound == Len(hist) <= MaxHist

-----------------------------------------------------------------------------
(* Properties *)

TypeOK ==
  /\ hist \in Seq([k : Lists \cup {"manga", "reader"}, m : Manga \cup {0},
                   c : Chapters \cup {0}, s : {0, 1}, o : Origins])
  /\ idx \in 1..Len(hist)

\* The detail page's Back never reopens a reader (the user's loop).
NoBackIntoReader ==
  last = "MangaBack" => cur.k /= "reader"

\* The detail page's Back returns to the list the user started from, even
\* after reading. (A related title's parent detail entry can be replaced by
\* the deep-link fallback, so "manga" origins are not checked.)
OriginBack ==
  (last = "MangaBack" /\ prev.o \in Lists) => cur.k = prev.o

\* Close always shows the closed chapter's detail page.
CloseShowsManga ==
  last = "ReaderClose" => (cur.k = "manga" /\ cur.m = prev.m)

\* OS back from a reader leaves the reader (Mihon / Paperback behaviour):
\* chapters are not separate stops in the back stack.
ReaderBackExitsReader ==
  (last = "SystemBack" /\ prev.k = "reader") => ~(cur.k = "reader" /\ cur.m = prev.m)

ReturnActions == {"ReaderClose", "MangaBack", "BackFromSection"}

\* Action property: a return action (Close, Back, section Back) never leaves
\* the page it closes directly below the page it shows, where OS Back (or
\* the next in-app Back) reopens it. Stated over this one step, not over
\* views, so an older visit of the same URL deeper in the stack is allowed.
ClosedPageNotLeftBelow ==
  [][last' \in ReturnActions => ~(idx' = idx + 1 /\ hist'[idx] = cur)]_vars

\* Readable trace: URLs as paths, the current one marked with "*".
Url(p) ==
  CASE p.k = "manga"  -> "/manga/" \o ToString(p.m)
    [] p.k = "reader" -> "/reader/" \o ToString(p.m) \o "-" \o ToString(p.c)
    [] p.s = 1        -> "/discover?section"
    [] OTHER          -> "/" \o p.k

Alias ==
  [action |-> last,
   url    |-> Url(cur),
   stack  |-> [i \in 1..Len(hist) |-> IF i = idx THEN "*" \o Url(hist[i]) ELSE Url(hist[i])]]

=============================================================================
