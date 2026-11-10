# Sprint 2 Report (October 13, 2026 to November 8, 2026)

## YouTube link of Sprint 2 Video
[Sprint 2 demo video](https://youtu.be/rTf1WFNp9EE)

## What's New (User Facing)
- Modules 1 and 2 show the selected acquisition folder path in the application title.
- Chart lines can be customized by color and width, and those preferences persist between runs.
- The team presented a prototype for a redesigned, extensible application. The client approved the design direction.


## Work Summary (Developer Facing)
Sprint 2 focused on evaluating a new Rust and Tauri technology stack, building learning demos, and developing a proof of concept for the redesigned application. The client approved the design direction, and development of the new software began.

The team also demonstrated improvements to the existing Modules 1 and 2, including acquisition paths in the window title and persistent chart appearance settings. Repository groundwork included a root `.gitignore` update and CircleCI path-filtering workflow. The sprint video and meeting minutes were published.

## Unfinished Work
- The redesigned application is still an early desktop starter; the legacy instrument workflows have not yet been migrated.
- Legacy application consolidation, documentation/data migration, additional CI checks, and release automation are carryover work. Some legacy UI changes are present in the code, but their issues remain open pending completion/verification.

## Completed Issues/User Stories
Here are links to the issues that we completed in this sprint:

 [Issue 28](https://github.com/ddelvalfraire/cousins-lab-tools/issues/28)
 [Issue 29](https://github.com/ddelvalfraire/cousins-lab-tools/issues/29)
 [Issue 39](https://github.com/ddelvalfraire/cousins-lab-tools/issues/39)
 [Issue 45](https://github.com/ddelvalfraire/cousins-lab-tools/issues/45)
 [Issue 83](https://github.com/ddelvalfraire/cousins-lab-tools/issues/83)
 [Issue 84](https://github.com/ddelvalfraire/cousins-lab-tools/issues/84)
 [Issue 85](https://github.com/ddelvalfraire/cousins-lab-tools/issues/85)
 [Issue 86](https://github.com/ddelvalfraire/cousins-lab-tools/issues/86)
 [Issue 87](https://github.com/ddelvalfraire/cousins-lab-tools/issues/87)
 [Issue 88](https://github.com/ddelvalfraire/cousins-lab-tools/issues/88)
 [Issue 89](https://github.com/ddelvalfraire/cousins-lab-tools/issues/89)
 [Issue 90](https://github.com/ddelvalfraire/cousins-lab-tools/issues/90)
 [Issue 91](https://github.com/ddelvalfraire/cousins-lab-tools/issues/91)
 [Issue 92](https://github.com/ddelvalfraire/cousins-lab-tools/issues/92)
 [Issue 93](https://github.com/ddelvalfraire/cousins-lab-tools/issues/93)
 [Issue 119](https://github.com/ddelvalfraire/cousins-lab-tools/issues/119)


 
 ## Incomplete Issues/User Stories
- [Issue 27 — Create a Rust + Tauri learning demo (Ethan)](https://github.com/ddelvalfraire/cousins-lab-tools/issues/27)
- [Issue 40 — Import the spring 2026 lab application](https://github.com/ddelvalfraire/cousins-lab-tools/issues/40)
- [Issue 41 — Bring over useful data and documentation](https://github.com/ddelvalfraire/cousins-lab-tools/issues/41)
- [Issue 42 — Restore chart color and width settings](https://github.com/ddelvalfraire/cousins-lab-tools/issues/42)
- [Issue 43 — Show full capture folder paths in window titles](https://github.com/ddelvalfraire/cousins-lab-tools/issues/43)
- [Issue 44 — Check whether Modules 1 and 2 still crash on close](https://github.com/ddelvalfraire/cousins-lab-tools/issues/44)
- Issues [46](https://github.com/ddelvalfraire/cousins-lab-tools/issues/46), [47](https://github.com/ddelvalfraire/cousins-lab-tools/issues/47), [48](https://github.com/ddelvalfraire/cousins-lab-tools/issues/48), and [49](https://github.com/ddelvalfraire/cousins-lab-tools/issues/49) — Add project checks and user manual publishing to CI.
- Issues [50](https://github.com/ddelvalfraire/cousins-lab-tools/issues/50), [51](https://github.com/ddelvalfraire/cousins-lab-tools/issues/51), [52](https://github.com/ddelvalfraire/cousins-lab-tools/issues/52), [53](https://github.com/ddelvalfraire/cousins-lab-tools/issues/53), and [54](https://github.com/ddelvalfraire/cousins-lab-tools/issues/54) — Complete executable/desktop releases, task templates, consolidation, and CI/CD setup.
- [Issue 77 — Fix misspelled Module 1 and 2 launcher filenames](https://github.com/ddelvalfraire/cousins-lab-tools/issues/77)
- [Issue 79 — Refresh the README and complete the DVDash brand assets](https://github.com/ddelvalfraire/cousins-lab-tools/issues/79)
- [Issue 120 — Upload the Sprint 2 slideshow](https://github.com/ddelvalfraire/cousins-lab-tools/issues/120)

## Code Files for Review
- `apps/desktop/src/App.tsx` and `apps/desktop/src-tauri/src/lib.rs` — React/Tauri desktop starter and native command.
- `crates/test-crate/src/lib.rs` — Rust demo command implementation.
- `apps/legacy/module1/application/mainUI/main.py` and `apps/legacy/module2/application/mainUI/main.py` — acquisition path window titles and chart setup.
- `apps/legacy/module1/application/uiElements/appearance.py` and `apps/legacy/module2/application/uiElements/appearance.py` — persistent chart appearance settings.
- `.circleci/config.yml` and `.gitignore` — CI path filtering and repository build-output ignores.
 
## Retrospective Summary
Here's what went well:
  * Team communication
  * Client communication
  * Project understanding
 
Here's what we'd like to improve:
   * Client meeting frequency
   * Work allocation
   * GitHub feature use
  
Here are changes we plan to implement in the next sprint:
   * Make sure to actively check GitHub issues
   * Make sure to schedule meetings with client whenever needed
   * Make sure everyone has adequate work allocated to them
