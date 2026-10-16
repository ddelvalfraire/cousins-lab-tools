//! UTC timestamps as the Python engine writes them with `datetime.isoformat()`.

use chrono::{DateTime, SubsecRound, Timelike, Utc};

/// The current UTC time at microsecond resolution, the precision Parquet and Python keep.
pub fn utc_now() -> DateTime<Utc> {
    Utc::now().trunc_subsecs(6)
}

/// `2026-10-16T22:09:52.316483+00:00`, or `2026-10-16T22:09:52+00:00` on a whole second.
pub fn iso(t: DateTime<Utc>) -> String {
    let t = t.trunc_subsecs(6);
    if t.nanosecond() == 0 {
        t.format("%Y-%m-%dT%H:%M:%S+00:00").to_string()
    } else {
        t.format("%Y-%m-%dT%H:%M:%S%.6f+00:00").to_string()
    }
}

pub fn parse_iso(text: &str) -> Result<DateTime<Utc>, chrono::ParseError> {
    Ok(DateTime::parse_from_rfc3339(text)?.with_timezone(&Utc))
}

/// `#[serde(with = "iso_time")]` for a `DateTime<Utc>` field.
pub mod iso_time {
    use chrono::{DateTime, Utc};
    use serde::{Deserialize, Deserializer, Serializer, de::Error};

    pub fn serialize<S: Serializer>(t: &DateTime<Utc>, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(&super::iso(*t))
    }

    pub fn deserialize<'de, D: Deserializer<'de>>(d: D) -> Result<DateTime<Utc>, D::Error> {
        super::parse_iso(&String::deserialize(d)?).map_err(D::Error::custom)
    }
}

/// `#[serde(with = "iso_time_opt")]` for an `Option<DateTime<Utc>>` field.
pub mod iso_time_opt {
    use chrono::{DateTime, Utc};
    use serde::{Deserialize, Deserializer, Serializer, de::Error};

    pub fn serialize<S: Serializer>(t: &Option<DateTime<Utc>>, s: S) -> Result<S::Ok, S::Error> {
        match t {
            Some(t) => s.serialize_str(&super::iso(*t)),
            None => s.serialize_none(),
        }
    }

    pub fn deserialize<'de, D: Deserializer<'de>>(d: D) -> Result<Option<DateTime<Utc>>, D::Error> {
        Option::<String>::deserialize(d)?
            .map(|text| super::parse_iso(&text).map_err(D::Error::custom))
            .transpose()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    #[test]
    fn iso_matches_python_isoformat_on_utc_values() {
        let t = Utc.with_ymd_and_hms(2026, 10, 16, 22, 9, 52).unwrap();
        assert_eq!(iso(t), "2026-10-16T22:09:52+00:00");
        let t = t + chrono::Duration::microseconds(316_483);
        assert_eq!(iso(t), "2026-10-16T22:09:52.316483+00:00");
        let t = t + chrono::Duration::nanoseconds(999);
        assert_eq!(iso(t), "2026-10-16T22:09:52.316483+00:00");
        let t =
            Utc.with_ymd_and_hms(2026, 1, 2, 3, 4, 5).unwrap() + chrono::Duration::microseconds(70);
        assert_eq!(iso(t), "2026-01-02T03:04:05.000070+00:00");
    }

    #[test]
    fn iso_text_parses_back_to_the_same_instant() {
        for text in [
            "2026-10-16T22:09:52.316483+00:00",
            "2026-10-16T22:09:52+00:00",
        ] {
            assert_eq!(iso(parse_iso(text).unwrap()), text);
        }
        assert!(parse_iso("2026-10-16 22:09").is_err());
    }

    #[test]
    fn now_keeps_whole_microseconds() {
        assert_eq!(utc_now().nanosecond() % 1000, 0);
    }
}
