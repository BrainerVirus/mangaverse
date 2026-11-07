------------------------------ MODULE Discover ------------------------------
EXTENDS Naturals, TLC
CONSTANT Impl
VARIABLES urlProvider, selected, feed, app, section, shownError, last
vars == <<urlProvider, selected, feed, app, section, shownError, last>>
Providers == {"A", "B"}
Init == /\ urlProvider = "A" /\ selected = "A" /\ feed = "loaded"
        /\ app = "ready" /\ section = "idle" /\ shownError = FALSE /\ last = "start"
\* onSelectProvider updates local state and search together (discover.tsx:217-220).
Select(p) == /\ p /= selected /\ selected' = p /\ urlProvider' = p
             /\ last' = "select" /\ UNCHANGED <<feed,app,section,shownError>>
\* Browser Back/forward updates search but not useState's initializer (:178-180).
History(p) == /\ p /= urlProvider /\ urlProvider' = p
              /\ selected' = IF Impl = "fixed" THEN p ELSE selected
              /\ last' = "history" /\ UNCHANGED <<feed,app,section,shownError>>
\* appSettingsQuery failure disables feed query (:182-195); isError omits it (:215).
AppFailure == /\ app = "ready" /\ app' = "error" /\ feed' = "idle"
              /\ shownError' = (Impl = "fixed") /\ last' = "app failure"
              /\ UNCHANGED <<urlProvider,selected,section>>
Retry == /\ app = "error" /\ shownError /\ app' = "ready" /\ feed' = "loading"
         /\ shownError' = FALSE /\ last' = "retry" /\ UNCHANGED <<urlProvider,selected,section>>
Resolve == /\ feed = "loading" /\ feed' \in {"loaded", "empty", "partial", "error"}
           /\ shownError' = (feed' = "error") /\ last' = "resolve"
           /\ UNCHANGED <<urlProvider,selected,app,section>>
Refresh == /\ app = "ready" /\ feed \in {"loaded", "empty", "partial", "error"}
           /\ feed' = "loading" /\ shownError' = FALSE /\ last' = "refresh"
           /\ UNCHANGED <<urlProvider,selected,app,section>>
Page == /\ feed \in {"loaded", "partial"} /\ section \in {"idle", "partial"}
        /\ section' = IF section = "idle" THEN "partial" ELSE "loaded"
        /\ last' = "page" /\ UNCHANGED <<urlProvider,selected,feed,app,shownError>>
Next == (\E p \in Providers : Select(p) \/ History(p)) \/ AppFailure \/ Retry \/ Resolve \/ Refresh \/ Page
Spec == Init /\ [][Next]_vars
SelectionMatchesUrl == selected = urlProvider
FailureHasRecovery == app = "error" => shownError
Alias == [action |-> last, urlProvider |-> urlProvider, selected |-> selected,
          feed |-> feed, appSettings |-> app, errorVisible |-> shownError, section |-> section]
=============================================================================
