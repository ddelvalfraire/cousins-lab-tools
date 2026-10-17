//! The Ambit reader against the two sample 150 recordings. Expected values come from running
//! the Python engine on the same files.

use std::fs;
use std::path::PathBuf;

use cousinslab::ambit::{
    AmbitRecording, AmbitSample, detect_events, read_ambit_csv, timing_summary,
};
use cousinslab::protocol::{ProtocolPlan, plan};

fn recording(plant: &str) -> AmbitRecording {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../reference/instruments/ambit")
        .join(format!("Ambit raw data_sample_150_{plant}.csv"));
    read_ambit_csv(&path).unwrap()
}

fn protocol_2() -> ProtocolPlan {
    let path =
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/ambit/protocol_2.json");
    plan(&serde_json::from_str(&fs::read_to_string(path).unwrap()).unwrap()).unwrap()
}

fn device_ms(recording: &AmbitRecording) -> Vec<i64> {
    recording.rows.iter().map(|r| r.t_ms).collect()
}

fn flash_times(recording: &AmbitRecording) -> Vec<f64> {
    detect_events(&recording.rows, 2500)
        .into_iter()
        .filter(|e| e.kind == "sat_flash")
        .map(|e| e.t_native.unwrap())
        .collect()
}

#[test]
fn both_header_variants_read_by_name() {
    let pl1 = recording("pl1");
    assert_eq!(pl1.rows.len(), 7956);
    assert_eq!(pl1.ignored_columns, ["T (s)", "Fluorescence"]);
    assert_eq!(
        (pl1.rows[0], pl1.rows[7955].t_ms),
        (
            AmbitSample {
                t_ms: 9,
                s: 2302,
                r: 341,
                f: 2129,
                b: 1774,
                act: 0,
                blue: 0,
                red: 225
            },
            756118
        )
    );
    let pl2 = recording("pl2");
    assert_eq!(pl2.rows.len(), 7874);
    assert!(pl2.ignored_columns.is_empty());
    assert_eq!(
        (pl2.rows[0], pl2.rows[7873].t_ms),
        (
            AmbitSample {
                t_ms: 11,
                s: 2740,
                r: 348,
                f: 2128,
                b: 1619,
                act: 0,
                blue: 0,
                red: 225
            },
            745865
        )
    );
}

#[test]
fn fourteen_saturation_flashes_per_file_with_the_fourth_on_the_device_clock() {
    let pl1 = flash_times(&recording("pl1"));
    assert_eq!(
        pl1,
        [
            212.164, 245.401, 278.776, 312.231, 335.511, 363.81, 391.812, 420.116, 448.423,
            476.716, 505.029, 548.172, 591.537, 634.9
        ]
    );
    let pl2 = flash_times(&recording("pl2"));
    assert_eq!(pl2.len(), 14);
    assert_eq!(pl2[3], 304.387);
    assert_eq!(pl2[13], 625.289);
}

#[test]
fn light_changes_match_python_counts_and_order() {
    for plant in ["pl1", "pl2"] {
        let events = detect_events(&recording(plant).rows, 2500);
        let count = |kind: &str| events.iter().filter(|e| e.kind == kind).count();
        assert_eq!(events.len(), 126, "{plant}");
        assert_eq!(
            [
                count("red_led"),
                count("ambit_actinic"),
                count("blue_led"),
                count("sat_flash")
            ],
            [42, 70, 0, 14],
            "{plant}"
        );
        let first: Vec<_> = events[..3].iter().map(|e| e.label.as_str()).collect();
        assert_eq!(
            first,
            ["Red 225 to 2500", "ACT 0 to 250", "Saturation flash 1"]
        );
    }
}

#[test]
fn protocol_2_requests_8010_samples_over_755_5_seconds() {
    let plan = protocol_2();
    assert_eq!(
        (plan.samples, plan.nominal_s, plan.flashes),
        (8010, 755.5, 14)
    );
}

#[test]
fn pl1_timing_summary_matches_python() {
    let summary = timing_summary(&device_ms(&recording("pl1")), Some(&protocol_2()));
    assert_eq!(
        serde_json::to_string(&summary).unwrap(),
        r#"{"recorded_samples":7956,"device_span_s":756.109,"first_device_ms":9,"gaps_over_150ms":18,"largest_gap_ms":331,"requested_samples":8010,"requested_s":755.5,"missing_samples":54,"device_span_minus_requested_s":0.609}"#
    );
}

#[test]
fn pl2_timing_summary_matches_python() {
    let pl2 = device_ms(&recording("pl2"));
    assert_eq!(
        serde_json::to_string(&timing_summary(&pl2, Some(&protocol_2()))).unwrap(),
        r#"{"recorded_samples":7874,"device_span_s":745.854,"first_device_ms":11,"gaps_over_150ms":15,"largest_gap_ms":162,"requested_samples":8010,"requested_s":755.5,"missing_samples":136,"device_span_minus_requested_s":-9.646}"#
    );
    assert_eq!(
        serde_json::to_string(&timing_summary(&pl2, None)).unwrap(),
        r#"{"recorded_samples":7874,"device_span_s":745.854,"first_device_ms":11,"gaps_over_150ms":15,"largest_gap_ms":162}"#
    );
}
