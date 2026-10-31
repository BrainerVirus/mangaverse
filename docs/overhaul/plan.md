# App overhaul - plan

Status: draft. No wave starts until the owner approves the specs. Each wave starts after the previous
one lands, except where noted.

| Wave | Spec | Work                                                                                                     | Shape                                |
| ---- | ---- | -------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| 1    | 1, 2 | Telemetry log, then feedback layer; layout fixes                                                         | Parallel, one PR per slice           |
| 2    | 3    | Lint baseline and reducer hook, then deslop and consolidation                                            | One owner for consolidation          |
| 3    | 4    | Transport seam and manifest domains; proxy and live check; recipes; extension                            | Stacked, then parallel               |
| 4    | 5    | Query speed; SPA shell and service worker; phone test and ADR; Worker database; OPFS pages and downloads | Stacked                              |
| 5    | 6    | Reader engine, then settings and polish                                                                  | One owner, then parallel             |
| 6    | 7    | Concept screens, `DESIGN.md`, registry, then surfaces                                                    | Blocked on references, then parallel |
| 7    | 4    | Electron helper, then headless helper and pairing                                                        | After the web flow works             |

Effect and state migrations (spec 3) happen inside waves 3-5 as each module is touched.

Live proof for each slice runs against a production build, not only mocks. Implementers, verifiers and
reviewers run on the models in the Workit config, set explicitly at launch.
