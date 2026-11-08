------------------------------ MODULE Settings ------------------------------
EXTENDS Naturals, Sequences, TLC
CONSTANT Impl
VARIABLES global, title, pending, queue, last
vars == <<global, title, pending, queue, last>>
Init == /\ global = 0 /\ title = 0 /\ pending = "none" /\ queue = <<>> /\ last = "start"
\* Global quick-panel edit, optimistically painted and delayed 300ms
\* (reader.$chapterId.tsx:189-203; use-coalesced-settings-write.ts:36-43).
EditGlobal == /\ global = 0 /\ pending = "none" /\ queue = <<>>
              /\ pending' = "global1" /\ last' = "edit global"
              /\ UNCHANGED <<global,title,queue>>
\* Reset cancels the timer before queuing a title reset (reader route:277-280).
Reset == /\ pending = "global1" /\ queue = <<>>
         /\ pending' = "none"
         /\ queue' = IF Impl = "current" THEN <<"reset">> ELSE <<"global1", "reset">>
         /\ last' = "reset title" /\ UNCHANGED <<global,title>>
Write == /\ queue /= <<>> /\ global' = IF Head(queue) = "global1" THEN 1 ELSE global
         /\ title' = IF Head(queue) = "reset" THEN 0 ELSE title
         /\ queue' = Tail(queue) /\ last' = "write" /\ UNCHANGED pending
Next == EditGlobal \/ Reset \/ Write
Spec == Init /\ [][Next]_vars
GlobalEditSurvivesTitleReset == (pending = "none" /\ queue = <<>> /\ last = "write") => global = 1
Alias == [action |-> last, savedGlobal |-> global, savedTitle |-> title, pending |-> pending, queue |-> queue]
=============================================================================
