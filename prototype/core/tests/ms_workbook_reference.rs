//! The workbook reader against the researcher's reference file. Expected values come from
//! running the Python engine (openpyxl, cached values) on the same file.

use std::path::{Path, PathBuf};
use std::time::Instant;

use cousinslab::contract::Cell;
use cousinslab::ms_workbook::{RAW_SHEET, read_raw_sheet, read_sample_sheet};

fn workbook() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../reference/instruments/mass-spec/Raw data-mass spec.xlsx")
}

#[test]
fn raw_sheet_holds_26859_half_second_rows() {
    let series = read_raw_sheet(&workbook(), RAW_SHEET).unwrap();
    let t = &series.t_elapsed_s;
    assert_eq!(t.len(), 26859);
    assert_eq!((t[0], t[26858]), (0.272, 13429.272));
    assert!(t.windows(2).all(|w| (w[1] - w[0] - 0.5).abs() < 1e-9));
    assert!(series.m32.iter().all(|&v| v == -404.404));
    assert_eq!(
        (series.m44[0], series.m45[0]),
        (0.85054743045182, 0.00762733482427551)
    );
    assert_eq!(series.m44[6760], 0.838747420707045);
    assert_eq!(
        (series.m44[26858], series.m45[26858]),
        (0.293974706952656, 0.00164190367733067)
    );
    assert_eq!(
        series.rows()[0],
        [
            Cell::Int(0),
            Cell::Float(0.272),
            Cell::Float(-404.404),
            Cell::Float(0.85054743045182),
            Cell::Float(0.00762733482427551)
        ]
    );
}

#[test]
fn researcher_sample_sheets_pair_time_with_ubar_co2() {
    let pl1 = read_sample_sheet(&workbook(), "150-pl1").unwrap();
    assert_eq!(pl1.len(), 1518);
    assert_eq!(
        [pl1[0], pl1[1], pl1[1517]],
        [
            (-320.0, 981.0252143648033),
            (-319.5, 980.9773970353035),
            (438.5, 6.01501374831151)
        ]
    );
    let pl2 = read_sample_sheet(&workbook(), "150-pl2").unwrap();
    assert_eq!(pl2.len(), 1520);
    assert_eq!(
        [pl2[0], pl2[1], pl2[1519]],
        [
            (-320.0, 992.2992823936441),
            (-319.5, 992.334414409522),
            (439.5, 3.827576414652017)
        ]
    );
}

#[test]
fn wrong_sheets_fail_with_the_python_messages() {
    let message = |path: &Path, sheet: &str| read_raw_sheet(path, sheet).unwrap_err().to_string();
    assert_eq!(
        message(&workbook(), "150-pl1"),
        "ValueError: 150-pl1 header is ('T(s)', '150-pl1', 'mzero', 'corrected'), expected ('Time', 'Mass 32', 'Mass 44', 'Mass 45')"
    );
    assert_eq!(
        message(&workbook(), "nope"),
        "KeyError: 'Worksheet nope does not exist.'"
    );
    assert_eq!(
        message(Path::new("/nonexistent/x.xlsx"), RAW_SHEET),
        "FileNotFoundError: [Errno 2] No such file or directory: '/nonexistent/x.xlsx'"
    );
}

/// openpyxl took 2.55 s at best and 4.85 s at the median for this read on the development
/// machine, so the bound is the fastest openpyxl read. Run with
/// `cargo test --release --test ms_workbook_reference -- --ignored --nocapture`.
#[test]
#[ignore = "timing probe; run in release mode"]
fn raw_sheet_reads_faster_than_openpyxl() {
    let mut times = Vec::new();
    for _ in 0..7 {
        let started = Instant::now();
        let series = read_raw_sheet(&workbook(), RAW_SHEET).unwrap();
        assert_eq!(series.m44.len(), 26859);
        times.push(started.elapsed().as_secs_f64());
    }
    times.sort_by(f64::total_cmp);
    println!(
        "raw sheet read, seconds: {times:.3?}, median {:.3}",
        times[3]
    );
    assert!(times[3] < 2.5, "median {:.3} s", times[3]);
}
