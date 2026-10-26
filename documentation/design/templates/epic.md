# V1 template dashboard epic

Status: planning. The user/team have not approved visual designs or architecture. Work is unestimated and unscheduled. No implementation ticket is ready merely because it appears here.

## Outcome

Render developer-authored, versioned experiment templates in the Tauri application. Cover the intended functionality of legacy modules 1-3 and demonstrate coordinated mass-spec/Ambit operation through the acquisition contract. Provide local persistence, file import/export, typed IPC, reproducible analysis, bounded display updates and recovery.

The first acceptance target is approved mockups. Architecture approval is a separate required gate. Scientific output and actual hardware require their own evidence.

## Tracker handoff

Linear rejected creation of the planning parent with invalid_request because the Brindle workspace has exceeded its free issue limit. No parent or child issues were created or updated. The 19 work items below are a complete local handoff, not tracker records. Their IDs are planning IDs only.

After workspace capacity is available, create the parent in Brindle, create children in dependency order, link this package, set all implementation work to Backlog, and record actual tracker IDs/URLs in plan.json. Do not attach the work to the unrelated Reppen project.

## Work and dependencies

The authoritative work manifest is [plan.json](plan.json). Each item below is one bounded delivery target. Split further if implementation reveals it cannot fit a reviewable change. Tracker IDs appear in the manifest after publication.

| Planning ID | Work item | Prerequisites |
| --- | --- | --- |
| D01 | [Confirm legacy scientific behavior and data mapping](#d01) | None |
| D02 | [Approve Mobbin-grounded V1 dashboard mockups](#d02) | None |
| D03 | [Spike stream, recalculation and acquisition lifecycle contracts](#d03) | None |
| D04 | [Approve architecture, models and IPC contracts](#d04) | D01, D02, D03 |
| C01 | [Define typed domain schemas and generated IPC bindings](#c01) | D04 |
| C02 | [Validate templates and compile dependency plans](#c02) | C01 |
| P01 | [Persist local templates and immutable revisions](#p01) | C02 |
| P02 | [Import and export portable template documents](#p02) | P01 |
| A01 | [Integrate the acquisition port and recorded-data sources](#a01) | C01, D01 |
| A02 | [Coordinate sessions, instrument groups and operation outcomes](#a02) | A01, P01 |
| N01 | [Persist analysis actions, calibration and measurement provenance](#n01) | C02, P01, A01, D01 |
| S01 | [Deliver bounded dashboard snapshots, queries and update channels](#s01) | A02, N01, D03 |
| U01 | [Render approved dashboard components from template definitions](#u01) | C02, S01, D02 |
| U02 | [Build local library, import and revision selection screens](#u02) | P02, U01 |
| F01 | [Deliver the module 1 Rubisco dashboard fixture](#f01) | U01, N01, D01 |
| F02 | [Deliver the module 2 pressure dashboard fixture](#f02) | U01, N01, D01 |
| F03 | [Deliver the module 3 isotope dashboard fixture](#f03) | U01, N01, D01 |
| F04 | [Demonstrate grouped mass-spec and Ambit contracts](#f04) | U01, A02 |
| Q01 | [Verify complete legacy coverage, recovery and portability](#q01) | U02, F01, F02, F03, F04 |

D02 mockups and D04 architecture approval both gate production UI work. D04 gates production contracts, storage and service work. D03 is a bounded evidence spike rather than a production component. D01 scientific sign-off gates the affected fixtures and architecture semantics.

## Acceptance by work item

### D01

Confirm legacy scientific behavior and data mapping.

Design reference: [legacy-workflows.md](legacy-workflows.md).

- Agree channel identities, units, reduction and clocks for legacy fixtures.
- Resolve M1 fitting/intercept and M2 pressure/derivative/calibration-file semantics.
- Resolve M3 fraction/log/rate labels, sample versus time window, finite inputs and range boundaries.
- Record scientist-approved expected values and tolerances; source anomalies remain explicit.

### D02

Approve Mobbin-grounded V1 dashboard mockups.

Design reference: [README.md](README.md).

- Produce library/import/revision views and functional mockups for modules 1, 2 and 3.
- Show data-source status, selection/calibration/results, linked recalculation and grouped instrument controls.
- Show invalid/missing data, unsupported controls, reconnect, interrupted run and revision conflict states.
- User approves visual component inventory and interaction mockups before production UI work.

### D03

Spike stream, recalculation and acquisition lifecycle contracts.

Design reference: [contracts.md](contracts.md).

- Use recorded fixtures and a fake acquisition port, never claim hardware acceptance.
- Exercise bounded delivery, slow consumers, reconnect, recalculation during append and stopping during a delayed start.
- Inspect template snapshot reopening after library/profile removal.
- Document observed limits and recommended message/point budgets on representative lab data; no fabricated rate targets.
- Coalesce adjacent data notifications around an interleaved operation event without false gap detection or skipped state.

### D04

Approve architecture, models and IPC contracts.

Design reference: [architecture.md](architecture.md).

- Review architecture.md and contracts.md with the user and team.
- Resolve scope decisions, raw ownership, revisions, local persistence and file format.
- Record explicit architecture approval and contract/schema versions.
- Keep implementation closed until approval; approved mockups are an independent gate.

### C01

Define typed domain schemas and generated IPC bindings.

Design reference: [contracts.md](contracts.md).

- Represent template documents, component variants, signals, units, clocks, runs and errors with named types.
- Generate TypeScript bindings from the Rust transport schema and check drift.
- Reject unknown document versions and malformed boundary data with field-path diagnostics.
- Contract fixtures cover every component kind and lifecycle state.
- Include XY contract fixtures with paired calibration observations and two measurement rows sharing the same x value.

### C02

Validate templates and compile dependency plans.

Design reference: [architecture.md](architecture.md).

- Validate IDs, references, source capabilities, units, formulas, layout bounds and dependency cycles.
- Compile declarative calculation definitions and approved reductions; execute no imported scripts or SQL.
- Validate grouped roles separately from visual groups.
- All three legacy documents validate without per-module UI branches.

### P01

Persist local templates and immutable revisions.

Design reference: [architecture.md](architecture.md).

- Transactionally publish revisions with expected-head conflict detection and idempotent request IDs.
- Preserve old revisions and support restoring by publishing a new revision.
- Page local template/revision lists and reopen them after application restart.
- Concurrent saves, interrupted saves and database migration failure preserve existing records.

### P02

Import and export portable template documents.

Design reference: [contracts.md](contracts.md).

- Round-trip the versioned .experiment-template.json format through native file selection.
- Preview missing source capabilities and reject unsupported schema versions or executable content.
- Identical imports are idempotent; divergent content with the same identity requires explicit fork or verified lineage.
- Include logical requirements and protocol/calculation/layout definitions; exclude machine paths, secrets, observations and raw data.

### A01

Integrate the acquisition port and recorded-data sources.

Design reference: [contracts.md](contracts.md).

- Describe typed channel schemas, units, clocks, source kinds and runtime capabilities.
- Keep raw writes and actual instrument control under the acquisition owner.
- Adapt legacy frame and EZView inputs with approved mappings and named reductions.
- Recorded and live sources expose the same dataset/query interface without pretending to share synchronized clocks.

### A02

Coordinate sessions, instrument groups and operation outcomes.

Design reference: [contracts.md](contracts.md).

- Pin the complete template snapshot and resolved source schema at session creation.
- Support capability-checked start, stop, manual start, delays and interval adjustment where supported.
- Record requested and effective operation times; accepted does not mean applied.
- Stop cancels pending starts; partial failures and interrupted recovery remain visible without automatic device restart.

### N01

Persist analysis actions, calibration and measurement provenance.

Design reference: [architecture.md](architecture.md).

- Record range readings, manual entries, parameter changes, fits, result rows and retractions with input references.
- Recompute dependent displays under one analysis revision without changing raw records.
- Freeze committed result rows with their calibration/parameter/data context; later edits do not silently rewrite them.
- Restore analysis state and preserve idempotency after restart.
- Append data between preview and measurement commit; the saved result retains the explicit immutable evaluation snapshot.

### S01

Deliver bounded dashboard snapshots, queries and update channels.

Design reference: [contracts.md](contracts.md).

- Implement subscribe-before-snapshot ordering and resume from durable checkpoints.
- Batch notifications through a Tauri Channel with bounded queues and explicit resync on overflow.
- Query exact analysis ranges separately from decimated display series; include clock, units, watermark and analysis revision.
- Discard stale recomputations, unsubscribe on teardown and recover after frontend reload.

### U01

Render approved dashboard components from template definitions.

Design reference: [README.md](README.md).

- Render chart, metric, inputs, readings, results table, controls, captures/status and visual group variants.
- Support approved view tabs, range selection, appearance and rescale interactions without per-module screen implementations.
- Display live, recorded and example provenance consistently; distinguish unavailable from numeric zero.
- Do not implement drag/drop, visual formula authoring or a general component editor.

### U02

Build local library, import and revision selection screens.

Design reference: [README.md](README.md).

- Browse local templates and revisions, inspect changes and preview imports.
- Open a chosen revision and restore an older definition as a new head.
- Reopen a saved session from its snapshot even when the library/profile changes.
- Preserve user-approved local chart preferences without mutating saved definitions.

### F01

Deliver the module 1 Rubisco dashboard fixture.

Design reference: [legacy-workflows.md](legacy-workflows.md).

- Cover raw signals, assay/HCl/O2 calibration, blank/extract, concentration/velocity charts and result rows.
- Assert approved scientific outputs, units, invalid states and exact interval provenance.
- Validate equivalent results across replay batches and full-recording display.
- Demonstrate calibration import/export and table export under the approved compatibility policy.

### F02

Deliver the module 2 pressure dashboard fixture.

Design reference: [legacy-workflows.md](legacy-workflows.md).

- Cover m32/m44 plots, calibration inputs, derived pressures, range readings and result export.
- Use approved channel mapping, pressure equations and derivative definition.
- Keep replay speed and collection interval controls distinct.
- Verify reduced-point versus original-data export labels and retained provenance.

### F03

Deliver the module 3 isotope dashboard fixture.

Design reference: [legacy-workflows.md](legacy-workflows.md).

- Cover raw m45/m47/m49, approved fraction/log/rate series, selected mean, sample label and result table.
- Handle zero/invalid denominators, derivative warm-up and final-sample range boundaries.
- Show batch-independent results and preserve duplicate measurement rows.
- Do not reproduce stale module 3 calibration handlers as a supported feature.

### F04

Demonstrate grouped mass-spec and Ambit contracts.

Design reference: [contracts.md](contracts.md).

- Use labelled replay/simulated fixtures to show shared operation, per-role delays and partial failure.
- Exercise start/stop and supported interval updates, including stopping while waiting.
- Keep host, source and device timestamps distinct; do not claim physical synchronization.
- Real-device validation remains a separate acceptance gate owned with the acquisition service.

### Q01

Verify complete legacy coverage, recovery and portability.

Design reference: [legacy-workflows.md](legacy-workflows.md).

- Run the evidence-linked acceptance matrix against actual packaged application screens.
- Verify raw hashes, analysis provenance, version round trips, reconnect, restart and interrupted operations.
- Collect bounded-memory and responsiveness evidence on agreed representative recordings.
- Record visual and scientific approvals plus unresolved hardware gates; implementation, merge and deployment stay separate.

## Epic completion

The parent stays open until all approved work items have their acceptance evidence. A complete epic requires the source coverage matrix, visual approval, architecture approval, approved scientific expected values, native UI evidence, local round trips, stream/recovery evidence, and explicitly resolved acquisition integration gates.

Draft design, implementation, independent review, merge and deployment are distinct states. This design package is not implementation or release completion.

Network discovery and graphical authoring remain outside V1. A future authoring UI calls the same publication/validation contracts rather than introducing a second template model.
