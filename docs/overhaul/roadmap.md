# App overhaul - roadmap

Electron ships first. Each milestone starts after the previous one lands, except where noted. Issues are
tracked on [GitHub](https://github.com/BrainerVirus/mangaverse/milestones) under the matching milestone.

| #   | Milestone             | Spec    | Outcome                                                      | Blocked on                    |
| --- | --------------------- | ------- | ------------------------------------------------------------ | ----------------------------- |
| 1   | Foundation            | 1, 2, 3 | Clean base, honest errors, working layouts                   | -                             |
| 2   | Electron runtime      | 4       | Packaged app: native storage, main-process network, no Nitro | ADR 0001                      |
| 3   | Providers             | 5       | One transport, and real recipes installable on Electron      | Milestone 2                   |
| 4   | Local data, downloads | 6       | Fast library and dependable offline reading                  | Milestone 2                   |
| 5   | Reader                | 7       | Page turns under 50ms and three-level settings               | Milestones 2 and 4            |
| 6   | Sync                  | 8       | Library and settings across devices                          | Milestone 2; Supabase project |
| 7   | Design                | 9       | Playful liquid glass across the app                          | Owner's references            |
| 8   | Web                   | 10      | Invite-only website with gateway and offline PWA             | Gateway test; legal advice    |

Milestones 3 and 4 can run in parallel, and concept screens for milestone 7 can start at any time.

## Rules for every milestone

- Milestones 1-6 make functional UI repairs with existing tokens: status pages, toasts, layouts and reader
  controls. They need no concept approval. Milestone 7 restyles them, and concept approval gates only that.
- Milestone 2 replaces the forked Nitro server in Electron (X11). Dropping SSR on web happens in milestone 8.
- Live proof runs against the real app, not only mocks.
- Implementers, verifiers and reviewers use the models in the Workit config, set explicitly at launch.
- Authors never verify their own work.
- Consolidation in milestone 1 runs alone, because it touches every import.
- Effect and state migrations happen as each module is touched (spec 1).

## Issues

| Milestone               | Issues    | Order                                                                |
| ----------------------- | --------- | -------------------------------------------------------------------- |
| 1 Foundation            | #204-#208 | #204, #205, #207 in parallel; #206 after #205; #208 last and alone   |
| 2 Electron runtime      | #209-#215 | ADR #209 first; #214 after #208; #213 after #210 and #212; #215 last |
| 3 Providers             | #216-#219 | #216, then #217 and #219; #218 last                                  |
| 4 Local data, downloads | #220-#222 | #220 and #221 in parallel; #222 after #212 and #216                  |
| 5 Reader                | #223-#224 | #223, then #224                                                      |
| 6 Sync                  | #225-#227 | In order                                                             |
| 7 Design                | #228-#230 | In order; #230 after #224                                            |
| 8 Web                   | #231-#233 | #231 first as the gate                                               |
