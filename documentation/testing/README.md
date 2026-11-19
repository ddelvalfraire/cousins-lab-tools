# Manual tests

Manual test cases for behavior that the automated tests don't cover, such as
dialogs, charts, and settings that survive a restart.

## Test suites

| Suite | Covers | Applies to |
|---|---|---|
| [Chart styles](legacy/chart-styles/TEST_CASES.md) | Changing and saving chart line colors and widths | Legacy Modules 1 and 2 |

## Release smoke set

Run these on every release candidate. Run a full suite when its feature changes.

- Chart styles: TC-STYLE-01, TC-STYLE-03, TC-STYLE-09, TC-STYLE-14, TC-STYLE-21, TC-STYLE-22

## Conventions

- One folder per feature, under a folder for its app, holding `TEST_CASES.md` and `SETUP.md`. Split a feature's cases into more files once they pass about 20.
- Test case IDs use the feature's prefix (`TC-STYLE-01`) and are never reused.
- Each feature's `SETUP.md` holds the preconditions its cases share, such as the build, test data and settings reset.
- Leave the Result column blank in this folder. Record each test run, with the build tested and any failures, in a GitHub issue.
