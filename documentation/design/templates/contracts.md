# Template, IPC and streaming contract proposal

Status: design reference for D04 review. Names and shapes below are proposed interfaces, not implemented commands. Rust wire models are authoritative; TypeScript bindings are generated after approval.

## Version and boundary rules

Track three independent versions: portable TemplateDocument.schema_version, IPC protocol_version, and local database migration version. A template's content revision is not a schema version.

Import and IPC parse into typed domain objects. Requests reject unsupported versions, non-finite values, missing references, incompatible units, excessive document/dependency size, and unsupported capabilities. Errors identify a field path and stable code. Internal services operate on validated types.

IDs are opaque typed strings. Sequences and row positions cross JavaScript boundaries as decimal strings, so they do not lose 64-bit precision. Absolute time is RFC3339 with an explicit offset when known. A source-local clock without a known offset remains source-local.

## Wire model inventory

| Model | Proposed fields and variants |
| --- | --- |
| TemplateDocument | schema_version, name, summary, source_requirements, parameters, calculations, calibrations, measurements, protocols, operation_groups, charts, layout |
| SignalRef | role_id plus source signal_id, or calculation_id. Variants are explicit. |
| ParameterSpec | numeric default/entry or computed expression, unit, label, validation bounds and allowed runtime override |
| CalculationSpec | row_expression, trailing_window, or interval_statistic; explicit input references, unit, invalid-value policy and operation version |
| ValueRef | Scoped signal/calculation, parameter, calibration output, or measurement-draft result reference; validation distinguishes sample series from scalar values |
| ChartDataRef | sample_series(time/value refs), calibration_points(calibration_id, paired x/y fields), calibration_fit(calibration_id), or measurement_points(measurement_id, paired x/y fields) |
| ChartSpec | chart_id; time_series or xy variant; typed ChartDataRefs, units and labels; marker and range-selection bindings |
| LayoutView | view_id, name, component list |
| LayoutComponent | common component_id and approved grid geometry; one of chart(chart_id), metric(value_ref), inputs(parameter_ids), readings(step_ids), table(measurement_id), controls(target), captures(role_ids), group(children) |
| OperationGroup | group_id, role_ids, default start schedule, failure policy |
| SourceDescriptor | source_id, input_kind, signals(name/type/unit/nullability), clocks(kind/scale/offset knowledge), operation capabilities and bounds |
| SessionView | session_id, complete snapshot, state, capture summaries, active analysis context/latest evaluation and capability-derived controls |
| AnalysisContext | Immutable analysis_id/revision, analysis-record checkpoint, parameters with provenance, calibration references and alignment policy |
| EvaluationSnapshot | Immutable evaluation_id, analysis_id and exact per-dataset durable watermarks |
| NumericValue | available(value, unit, analysis_id, evaluation_id), or unavailable(reason, dependency references). Never NaN/Infinity in JSON. |
| FieldDiagnostic | path, code, message, optional related IDs |
| OperationReceipt | operation_id, status and request payload hash |
| DomainError | code, message, field diagnostics, retry classification, request/operation ID and expected/current revision where relevant |

No arbitrary UI action names invoke arbitrary functions. A controls component names an allowed target and operation enum. No template can supply HTML, JavaScript, shell commands, SQL, native code, paths or network addresses to execute.

XY bindings pair x and y within one stable observation_id or measurement_id/row_id. They do not zip independently queried arrays or key records by x. Two committed rows with the same concentration produce two points. Active views exclude retracted/superseded records explicitly; historical evaluation fixes the active row set at the AnalysisContext analysis-record checkpoint and preserves its provenance. Calibration-fit bindings use the approved fit and its input observations under the selected evaluation.

## Portable file

Recommend one UTF-8 *.experiment-template.json file. It transports a definition, not a session or database.

Envelope fields:

    format: "cousins-lab-experiment-template"
    format_version: 1
    origin: {template_id, revision_id, parent_revision_id, content_hash}
    document: TemplateDocument

Hash canonical document bytes under a specified canonicalization algorithm. The hash excludes the transport envelope and local revision ordinal. Identical documents have the same content identity. Define canonical number encoding and expression version in C01/P02; changing canonicalization requires a format migration.

Include logical signal/capability requirements, calculation definitions, calibration standards, protocol steps, chart/layout definitions and safe experiment defaults. Do not include observed calibration values, measurements, machine source bindings, absolute paths, credentials or raw samples. Saved calibration observations use a separate versioned calibration export because they belong to an experiment context.

Export one selected revision. Include a parent identity as provenance, not an implicit export of every ancestor. Complete library/session backup is separate work.

Import behavior:

1. Native file selection yields a scoped file handle. Read and validate the document before any catalog write.
2. Preview identity, component/view summary, schema compatibility and missing local capabilities.
3. An identical known origin/hash returns the existing local revision.
4. A new origin creates a local template. Missing sources make it unavailable for a live run while the definition remains inspectable/renderable with recorded/example bindings.
5. Conflicting identity/content returns import_conflict. User can fork under a new local identity. Import as a descendant requires a verified known parent and expected head.
6. Commit the import atomically. A malformed or unsupported file leaves the library unchanged.
7. Never start a run, open a sender's local path, or operate an instrument as an import side effect.

## IPC command catalog

Use typed Tauri commands with structured arguments and Result responses. Tauri commands provide request/response IPC. [Official Tauri command documentation](https://v2.tauri.app/develop/calling-rust/)

All mutations take request_id. Revision-sensitive mutations take an expected revision. Retrying the same request and same canonical payload returns the same result; a different payload with the same key returns idempotency_conflict. Idempotency belongs to the backend and survives restart.

| Command | Request | Result and ownership |
| --- | --- | --- |
| engine_capabilities | supported_protocol_versions | Selected protocol, renderer schema versions, component kinds and enforced limits |
| list_templates | page_size, after | Template summaries and next cursor |
| list_template_revisions | template_id, page_size, before_ordinal | Immutable revision summaries and next cursor |
| get_template_revision | revision_id | Complete immutable document, validation summary and origin |
| validate_template | document | Field diagnostics and required capabilities; no publication or device actions |
| publish_template | request_id, template_id or create intent, expected_head, document, summary | New revision; template service transaction |
| compare_template_revisions | left_revision_id, right_revision_id | Typed field/component differences |
| restore_template_revision | request_id, template_id, source_revision_id, expected_head | New head whose content restores the selected revision |
| preview_template_import | scoped_file_handle | Validated candidate and conflicts/capabilities; no mutation |
| import_template | request_id, preview_token, conflict_action, expected_head if relevant | Existing or new local revision; revalidates token/content before commit |
| export_template | revision_id, scoped_output_handle | Written document identity and hash |
| list_sources | role_requirements | Compatible SourceDescriptors, unavailable reasons and capability limits |
| create_session | request_id, revision_id, role_bindings, source_mode, run_overrides | Session with a complete snapshot; creation alone does not start hardware |
| list_sessions | page_size, after | Session summaries, states and next cursor |
| open_session | session_id | SessionView and source-schema snapshot; does not query today's library |
| request_operation | request_id, session_id, target, operation, expected_control_revision | OperationReceipt, not an assertion of physical success |
| get_operation | operation_id | Accepted/scheduled/applied/refused/failed/cancelled/outcome_unknown state |
| record_analysis_action | request_id, session_id, expected_analysis_revision, action | Saved action and new AnalysisContext |
| preview_analysis_change | session_id, base_analysis_id, proposed_change, explicit input snapshot choice | PreviewEvaluationToken, display preview and diagnostics; no saved action or device change |
| create_evaluation_snapshot | session_id, analysis_id, latest_committed or exact_watermarks | Immutable evaluation_id and resolved input watermarks |
| query_series | session_id, evaluation_id, chart/data references, clock/range, max_points, after | Bounded sample or paired-row display points, next cursor, context/watermarks and quality |
| read_interval | session_id, evaluation_id, capture_id, source_clock, range, step_id | Exact statistics/provenance over approved original/reduction data, never chart-decimated points |
| preview_calibration_import | session_id, scoped_file_handle, format | Validated observations, compatibility diagnostics and preview token; no state change |
| export_calibration | session_id, analysis_id, format, scoped_output_handle | Versioned observations, parameters, units and provenance |
| export_dataset | dataset_id, watermark, original_or_reduction, format, scoped_output_handle | Acquisition-owned export with content kind, clocks, units and source hashes |
| query_results | session_id, measurement_id, page_size, after | Frozen measurement rows and next cursor |
| export_results | session_id, evaluation_id for calculated output or explicit frozen result selection, format, scoped_output_handle | Export manifest, selected context and output identity |
| subscribe_dashboard | session_id, optional resume checkpoint, Channel<DashboardMessage> | Subscription receipt; initial/resume state and updates arrive on this channel |
| unsubscribe_dashboard | subscription_id | Idempotent teardown |
| get_dashboard_snapshot | session_id | Consistent screen, context, control revision, change checkpoint and durable dataset watermarks |

File handles are native-scoped capabilities. The webview does not receive unrestricted filesystem access. Dataset export belongs to acquisition. Calibration files belong to analysis. Source configuration belongs to acquisition and is supplied through its typed configuration. P02 covers template files only.

Analysis action variants are capture_reading, enter_observation, set_parameter, commit_measurement, retract_record, and import_calibration. The import_calibration action consumes a validated preview token. Reading and measurement-commit actions require a durable evaluation_id. Each saved analysis action advances the analysis-record checkpoint, including insertion/retraction of result rows. Every action records the applicable source range, clock, watermarks and effective parameter/calibration context. An append after preview does not change a commit's selected inputs. A concurrent parameter/calibration change requires an explicit new evaluation or returns revision_conflict. Clear/reset does not delete original records. Presentation-only zoom/visibility does not create analysis actions.

## Acquisition port

The port is independent of Tauri and contains no UI objects.

| Method | Required contract |
| --- | --- |
| describe_source(source_id) | Typed signals/clocks/source kind, operation variants, supported runtime setting bounds and unavailable reasons |
| check_ready(source_id, configuration) | Readiness or explicit refusal; no implied device start |
| start_capture(operation_id, configuration, sink) | Capture identity and lifecycle events; source owner writes originals and acknowledges effective start |
| request_control(operation_id, capture_id, operation) | Explicit accepted and eventual effective/refused/failed outcome |
| stop_capture(operation_id, capture_id) | Idempotent stop request, completion outcome and final durable watermark |
| open_dataset(dataset_id) | Immutable schema/clock description and committed data access |
| read_committed_range(dataset_id, clock, range, watermark, limits) | Exact bounded batches plus continuation; no chart decimation |
| observe_dataset(dataset_id, checkpoint, sink) | Durable watermark and lifecycle notifications with resume/resync semantics |

Operation variants include start, stop, manual_start, set_start_delay for a still-pending capture, and set_measurement_interval only when the source reports support. Playback pause/speed are separate variants available to replay sources. Hardware protocol mutation is not inferred from playback support.

Interval settings carry units, min/max constraints, effective-scope semantics and an actual effective timestamp. Unsupported changes return unsupported_operation and leave collection unchanged. O3 must establish whether a device can apply an interval immediately, at a step boundary, or only on its next run.

The source owner serializes commands for each physical source. Reject conflicting ownership. Group timing coordinates requests; it does not prove simultaneous physical sampling. Collection configuration and observations remain separate.

## Operation lifecycle and crash semantics

A request is validated before acceptance. The coordinator persists intent and returns an operation ID. Later status distinguishes scheduled from applied. An applied response records an actual effective time reported by the owner, not the time the UI sent the request.

A valid state path is accepted -> scheduled -> applied. Refused, failed, cancelled, and outcome_unknown are explicit terminal outcomes. Start and stop may use accepted -> applied directly.

Stop cancels pending timers and advances the control generation. Delayed callbacks check that generation before issuing start. Late status cannot resurrect a stopped capture.

Persisted intent does not guarantee exactly-once physical effects. If the application crashes after a device command but before its acknowledgement is durable, record outcome_unknown/interrupted and reconcile with the acquisition service. Never replay an uncertain start automatically.

An idempotency key deduplicates the app request. It does not prove that a physical device supports idempotency.

## Streaming and recorded-data delivery

Use Tauri Channels for ordered per-subscription messages. Channels are designed for streaming, but they are not durable history, reconnect storage, or a lossless sample archive. [Official Tauri channel documentation](https://v2.tauri.app/develop/calling-frontend/#channels)

A DashboardMessage includes protocol_version, subscription_id, session_id, a covered checkpoint interval {from_exclusive, through_inclusive}, and one typed payload:

- snapshot contains SessionView, active analysis/evaluation context, control revision, durable dataset watermarks and checkpoint. Snapshot establishes its own checkpoint base.
- data_available identifies captures and new durable watermarks.
- analysis_changed identifies the new context and invalidated series.
- operation_changed contains the operation state and effective/refused details.
- session_changed contains capture/session lifecycle state.
- resync_required identifies a gap, expired checkpoint, overflow or unsupported context.
- subscription_closed identifies a deliberate termination or error.

The change log persists metadata notifications and raw-watermark references, not copies of raw batches. Acquisition publishes its committed watermark before the coordinator records data_available. If notification recording is interrupted, startup/reconnect reconciles from the acquisition owner.

Subscription establishment is serialized with snapshot/checkpoint capture. Register the subscriber first under the coordinator, capture consistent snapshot S, emit snapshot as the first channel frame, then deliver changes after S. A resume checkpoint replays available metadata changes before following new ones. If history was compacted, send resync_required and a new snapshot.

The renderer queries bounded series windows from the watermarks in the snapshot/notification. It can use the same query for recorded input. Query results contain analysis_id, evaluation_id, analysis-record checkpoint, clock, range, per-dataset watermark, units, availability/quality, point budget and continuation. Continuation tokens bind the exact evaluation, query and bounds; a token cannot be reused after a context change.

Choose queue, message-byte, event-retention and chart-point budgets through D03 on representative data. engine_capabilities publishes the enforced values. Requests exceeding them fail with limit_exceeded. Queue overflow closes or resyncs the display subscription; it must not block acquisition or silently discard source records.

Coalesce only consecutive data_available records into one message covering their complete checkpoint interval and latest committed watermarks per capture. Flush that message before an intervening analysis/control/lifecycle record. For example, changes 41 and 42 may become coverage (40,42], followed by operation 43 as (42,43]. The client advances to through_inclusive after applying the message. A message whose endpoint is already applied is a duplicate; a mismatched from_exclusive requires resync. Coalescing must not conceal an intervening event. Keep the control UI usable during recomputation. Bound backend and frontend buffers. Unsubscribe cancels pending queries/listeners and releases their resources.

Uncovered checkpoint gaps cause resync; explicitly covered coalesced intervals do not. Exact scientific extraction reads source data through read_interval, never pixels or decimated chart samples. Display decimation is labelled and does not alter the dataset.

## Recalculation consistency

A parameter/control action creates an immutable AnalysisContext containing configuration, not a moving data cutoff. An immutable EvaluationSnapshot pairs that analysis_id with exact committed input watermarks. Series queries, interval reads, reading actions, measurement commits and calculated exports all name evaluation_id. Results from older analysis/evaluation identities cannot replace a newer chosen view.

Proposal pending O2: recompute the displayed history under the new context while retaining every original sample. Frozen result rows retain their committed values, context and provenance. A UI preview returns a distinct ephemeral PreviewEvaluationToken, which cannot commit measurements or scientific exports. Applying it validates the expected base and input watermarks, then creates a durable analysis/evaluation context. An invalidated base returns revision_conflict; the preview is never silently applied to different inputs.

A control bound to a calculation parameter is distinct from a physical instrument control. Both may use the same numeric input appearance, but they have different contracts and feedback.

A raw append during recomputation advances acquisition watermarks without changing an existing evaluation. Following new data creates a new evaluation_id under the same analysis_id. Evaluation-tagged results replace a view atomically. A preview at watermark 100 and commit after append 120 still commits evaluation 100; using 120 requires explicit reevaluation. Exports name an evaluation or frozen row selection so inputs remain reproducible.

## Errors and compatibility

Stable error codes include invalid_document, unsupported_schema, invalid_binding, dependency_cycle, incompatible_unit, source_unavailable, unsupported_operation, revision_conflict, idempotency_conflict, import_conflict, invalid_analysis_context, limit_exceeded, checkpoint_expired, storage_failure and outcome_unknown.

Every error identifies whether retrying the same request is safe. A timeout after mutation is an unknown outcome, not a reason to create a fresh request ID. Re-read by request/operation ID.

A future document version remains inert and unchanged. Schema migrations preserve original imported content and produce a new local revision only after validation. A session that requires an unsupported renderer schema opens with an explicit compatibility error instead of silently changing meaning.

## Contract acceptance

D03/C01/P01/P02/A01/A02/N01/S01 must collectively demonstrate:

- File and IPC round trips preserve identity, references, units and schema semantics.
- Concurrent stale saves fail rather than overwrite; request retries publish once.
- A saved session opens without today's library/profile files.
- Slow consumers, frontend reload, gaps and process restart do not lose original samples or present an old context as current.
- Stop wins over a pending delayed start and unsupported interval changes leave acquisition unchanged.
- Chart recalculation does not change raw hashes, prior measurement rows or scientific export contexts.
- Coalesced data messages preserve checkpoint coverage around interleaved operation events.
- Append-between-preview-and-commit preserves the selected evaluation inputs, and duplicate-x result rows remain distinct chart points.
- Each source keeps its own timestamps; any alignment is explicit and reproducible.
- No performance or hardware support is accepted solely from a mockup or generic port implementation.
