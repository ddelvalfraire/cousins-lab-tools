# Template dashboards V1 design brief

Status: proposed for user and team review. This package contains source findings and design recommendations. It does not record visual, scientific, or architecture approval and does not authorize production implementation.

## Purpose

Researchers need reusable experiment dashboards that support the legacy module workflows. Developers first author these dashboards through supported Tauri IPC. Researchers use the dashboards with recorded or incoming data. Later work adds visual authoring.

This is an end-to-end capability. Template validation, local persistence, acquisition contracts, calculations, streaming, and rendering must agree.

## Confirmed scope

The following requirements come from the user in the current design conversation.

- V1 renders developer-authored templates. Supported IPC creates and revises the definitions.
- Drag/drop, visual component construction, and researcher-facing template authoring are later work.
- Templates are local to an installation. Scientists can share them by importing a file.
- Template history preserves earlier versions and lets a scientist choose an older one.
- Components include charts, values, parameter inputs, calibration and measurement actions, result tables, and controls.
- Display components consume the same data model for live and recorded input.
- Changing analysis parameters can update dependent displays without modifying collected data.
- Visual groups organize components. Operational groups coordinate instruments with optional delays.
- Instrument start, stop, and supported timing adjustments belong behind the acquisition/controller contract.
- The user approves visual components and architecture before production implementation.
- Team-reviewable mockups are the first acceptance target. The architecture and epic must describe models, persistence, workflows, contracts, and service responsibilities.

## Proposed V1 boundary

Render three legacy-equivalent dashboards plus a combined mass-spec/Ambit demonstration. Preserve intended workflows rather than cloning pixel arrangements or reproducing source defects.

Use eight rendering variants initially: chart, metric, inputs, readings, table, controls, captures/status, and visual group. View tabs, range selection, event markers, series appearance, and source-state indicators are shared interactions. Calibration charts are XY charts. Calibration and measurement panels compose readings, inputs, charts, and result tables.

Provide library, file import/export, revision selection, and revision comparison views. Provide IPC authoring and validation without adding a graphical template editor.

Real acquisition adapters remain owned by the acquisition workstream. This epic specifies and integrates the port. Simulated or replay demonstrations do not establish hardware acceptance. EZView spool input already has a hardware-labelled passive file path in the prototype; direct Ambit serial control is not demonstrated there. [PADAPTER](https://github.com/ddelvalfraire/cousins-lab-tools/blob/722daeeb5fc32f664d86fd2fbf94833a5421e29b/prototype/core/src/run/adapter.rs#L40-L126)

Exclude network discovery, cloud accounts, remote sharing, arbitrary scripts/plugins, and a visual node-graph editor from V1. Existing experiment parameter controls remain part of dashboard operation.

## Read the package

| Document | Review question |
| --- | --- |
| [Legacy workflows](legacy-workflows.md) | Which tasks and scientific ambiguities must replacement dashboards cover? |
| [Architecture](architecture.md) | Who owns each model, computation, operation, and persisted value? |
| [Contracts](contracts.md) | What crosses IPC and the acquisition boundary, and what happens on failure? |
| [Epic](epic.md) | Which bounded work items deliver this capability, in what dependency order? |
| [Independent review and dispositions](review.md) | Which contract gaps were found, and how were they corrected? |
| [Evidence and work manifest](plan.json) | Which source revisions and planning IDs does this package use? |

Repository documents are authoritative for the design. Tracker issues contain work acceptance and links, not copies of the architecture. Linear rejected parent creation because the workspace issue limit is reached. No issues were created. See the [tracker handoff](epic.md#tracker-handoff).

## Recommendations awaiting approval

| Decision | Recommendation | Reason |
| --- | --- | --- |
| Portable format | One UTF-8 JSON file named *.experiment-template.json | The same typed document can cross IPC and files. No archive unpacking or machine-specific paths are needed. |
| Local persistence | SQLite for template revisions, session metadata, operations, and analysis records | Revision publication and expected-head checks need transactions. Acquisition owns raw storage separately. |
| Revision identity | Immutable content with local template ID, revision ID, parent, and content hash | Import identity, conflicts, restoration, and session pinning become explicit. |
| Session rendering | Render from the session's complete pinned definition and source-schema snapshot | Library or profile changes must not break an old session screen. |
| Recalculation | Recompute displayed history under a new analysis context; freeze committed measurement rows | Researchers can inspect changed calibration while retaining the provenance of already recorded results. |
| Live delivery | Typed commands for requests, bounded Tauri Channels for update notifications, bounded queries for charts/history | Presentation delivery must not become raw-data storage. |
| Group controls | Capability-checked operations with explicit requested and effective times | A replay speed change, ingestion pause, and physical instrument interval are different operations. |
| Failure recovery | Reopen recorded data and mark unfinished acquisition interrupted | An application restart must not silently restart physical instruments. |

These are proposals, not historical decisions or implemented capabilities.

## Approval sequence

1. Confirm the source coverage and resolve the scientific questions in D01.
2. Approve the component inventory and Mobbin visual direction.
3. Review clickable mockups for all three legacy workflows and the combined-instrument scenario.
4. Complete the bounded streaming/lifecycle spike and resolve its contract limits.
5. Approve the architecture, persistence model, IPC, and stream contracts.
6. Release the dependency-ready implementation work from the planning epic.

Visual and architecture approval are independent. A good architecture does not approve a component design. Mockups use example data and do not count as integration or hardware verification.

## Mockup brief

Every mockup must map to a workflow in [legacy coverage](legacy-workflows.md). The review set contains:

- Library, template detail, import preview, revision history, and changed-value comparison.
- Module 1 raw signals, calibration curves/inputs, blank/extract, concentration-versus-velocity chart, and results.
- Module 2 raw signals, calibration, pressures, selected-range readings, and results.
- Module 3 raw signals, approved isotope/log/rate views, interval selection, sample label, and results.
- A linked calibration parameter changing a chart over existing data, with recalculation and invalid-input states.
- A coordinated mass-spec/Ambit run, per-instrument delays/status, a failed participant, and stop during a pending start.
- Missing source, unsupported operation, resync, interrupted session, failed save, and revision conflict states.

Mobbin references inspected in this conversation:

- [Plane dashboard configuration](https://mobbin.com/screens/6a6856b8-4e81-4553-9ce1-c353b33fce55) shows a visible dashboard beside a configuration inspector.
- [Klaviyo chart creation](https://mobbin.com/screens/86e80999-c10e-43f4-8434-44b6ef5f0ca5) separates metric selection from visualization choice. This is later-authoring reference, not a requirement to build its dialog in V1.
- [Plane version history](https://mobbin.com/screens/afc55a5a-4236-4f12-859d-9d38a55bd06d) combines revision selection, highlighted differences, comparison, and restoration.

Use these as interaction references. A specific palette, chart library, or component library has not been approved.

## Decisions needed from the user and scientific owner

| ID | Decision | Proposed default | What it blocks |
| --- | --- | --- | --- |
| O1 | Who approves the scientific formulas and channel mapping? | Name a lab scientist and use agreed recorded fixtures with expected outputs. | D01 and scientific acceptance of F01-F03. |
| O2 | Does a changed calibration update displayed history, future measurements, or both? | Recalculate history for display; preserve committed result rows; explicit new analysis revision for changed results. | Final analysis semantics and calibration mockups. |
| O3 | What must a changed instrument interval mean? | The source advertises supported operations and reports when a request actually takes effect. Unsupported device changes are unavailable. | Acquisition integration and operation mockups. |
| O4 | Must legacy calibration CSVs and table consumers remain compatible? | Versioned new exports plus tested legacy adapters where active lab consumers require them. | Export fixtures, migration scope, and D01. |
| O5 | What happens to result tables and calibrations when starting another run? | New run state is separate; previous records remain accessible; copy calibrations explicitly with provenance. | Reset/start workflows and session navigation mockups. |
| O6 | Which recordings and machine represent acceptance? | Lab supplies representative maximum-duration data and target operating system/hardware. No throughput target is claimed from current source. | Stream budgets, memory/responsiveness criteria, and hardware gate. |

The team-review format can begin with clickable mockups, this repository package, and the linked epic. A particular design-tool file format is not assumed.

## Verification status

Source paths were traced at pinned revisions. No legacy application, prototype runtime, or hardware was exercised for this design package. Scientific correctness is unresolved where listed in D01. Technical transport choices use primary documentation cited in [contracts](contracts.md).

If this checkout lacks the pinned branch objects, fetch the reference branches without switching the working tree:

    git fetch --no-tags origin main feat/acquisition-ui-prototype feat/tauri-react-scaffold

Run the package checker from the repository root:

    python3 documentation/design/templates/check_design.py --self-test

The checker validates pinned source paths/ranges, required documents, ticket references, coverage IDs, and dependency cycles. It does not validate scientific results, approve architecture, or test runtime behavior.
