# Manual tests

Manual test cases for behavior that the automated tests don't cover.

## Test suites

| Suite | Covers | Applies to |
|---|---|---|
| [Chart styles](legacy/chart-styles/) | Changing and saving chart line colors and widths | Legacy Modules 1 and 2 |

## Release smoke set

Run these on every release candidate. Run a full suite when its feature changes.

- Run the [legacy/chart-styles](legacy/chart-styles/) suite.

## Conventions

- One folder per feature, under a folder for its app. The folder holds a `SETUP.md` and test case files named for what they cover, such as one file per module (`module-1.md`). Split a file once it passes about 20 test cases.
- Test case IDs use the feature's prefix (`TC-STYLE-01`) and are never reused.
- Each feature's `SETUP.md` holds the preconditions its cases share, such as the build, test data and settings reset.
- Leave the Result column blank in this folder. Record each test run, with the build tested and any failures, in a GitHub issue.
