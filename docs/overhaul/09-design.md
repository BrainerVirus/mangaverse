# 9. Design - spec

Status: blocked on visual references from the owner.

## Problem

The app is mostly matte white with black buttons and 7-14px corners. On the phone routes measured, only
the bottom nav used blur. `DESIGN.md` is 1,094 lines mixing values and roadmap, and its "calm, deep"
direction conflicts with the playful, welcoming look the owner wants.

## Decisions

| #   | Decision                                                                                                    | Why                                                          |
| --- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| V1  | Direction: Apple liquid glass adapted to be playful and welcoming.                                          | Owner's goal.                                                |
| V2  | Larger radii, one vivid accent, springy motion.                                                             | These carry most of the playful feel.                        |
| V3  | Glass only on floating controls and over real content. Content surfaces stay solid.                         | Glass needs something behind it, and blur costs performance. |
| V4  | Reader stays calm: an undistracted stage, with glass only on its controls.                                  | Reading comes first.                                         |
| V5  | Three concept screens approved before the redesign: Library, Manga detail, Reader.                          | Agrees the look before any code.                             |
| V6  | Rewrite `DESIGN.md` as a short source of truth, merging `docs/Design.md` into it.                           | One authority that people and agents will actually read.     |
| V7  | One in-repo shadcn registry: vendored, license-checked, restyled to tokens.                                 | Mixed sources otherwise look inconsistent.                   |
| V8  | CSS and `tailwind-animations` for micro-animation; GSAP through `@app/motion` for choreography.             | `@midudev/tailwind-animations` is deprecated in its favor.   |
| V9  | Platform touches: touch-first on phones, hover and keyboard on desktop, native window controls in Electron. | Same design, adapted to each platform.                       |
| V10 | Devices that cannot afford blur fall back to solid surfaces.                                                | Keeps it smooth on low-end phones.                           |

Functional repairs in earlier milestones use existing tokens and need no concept approval; they are restyled here.

## Behavior

- Given a concept screen, When it is not approved, Then no redesign work starts for it. Functional repairs are unaffected.
- Given any surface, When it is built, Then it uses tokens and no raw colors.
- Given a registry component, When it is added, Then its license and source are recorded.
- Given reduced motion, When any animation would run, Then its end state shows at once.
- Given the existing reduced glass profile or reduced transparency, When a surface renders, Then it is solid and text stays readable.
- Given light and dark themes, When text sits on any surface, Then it meets WCAG AA contrast.
- Given reading is active, When nothing is being interacted with, Then nothing moves on screen.

## Needed from the owner

Two or three visual references, showing what to borrow from each.

## Out of scope

New themes beyond light and dark during this work, and displacement-filter refraction.
