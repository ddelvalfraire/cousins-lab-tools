//! Python's float and string formatting, for the files and messages the Python engine wrote.
//!
//! Legacy frame CSVs hold `repr(round(x, 3))`, readiness lines use `{speed:g}`, and error
//! messages quote values with `repr`. These reproduce those outputs exactly.

/// `round(x, digits)`: rounds the exact binary value to the nearest decimal, ties to even.
pub fn round(x: f64, digits: usize) -> f64 {
    if !x.is_finite() {
        return x;
    }
    format!("{x:.digits$}").parse().unwrap_or(x)
}

/// `repr(x)`: the shortest digits that round-trip, in scientific notation outside 1e-4..1e16.
pub fn float_repr(x: f64) -> String {
    if let Some(text) = non_finite(x) {
        return text.into();
    }
    let (sign, digits, exp) = shortest_digits(x);
    if (-4..16).contains(&exp) {
        let point = exp + 1;
        let fixed = if point <= 0 {
            format!("0.{}{digits}", "0".repeat(point.unsigned_abs() as usize))
        } else {
            let point = point as usize;
            if digits.len() > point {
                format!("{}.{}", &digits[..point], &digits[point..])
            } else {
                format!("{digits}{}.0", "0".repeat(point - digits.len()))
            }
        };
        format!("{sign}{fixed}")
    } else {
        let mantissa = match digits.len() {
            1 => digits,
            _ => format!("{}.{}", &digits[..1], &digits[1..]),
        };
        format!("{sign}{mantissa}{}", exponent(exp))
    }
}

/// `format(x, "g")`: six significant digits with trailing zeros removed.
pub fn format_g(x: f64) -> String {
    if let Some(text) = non_finite(x) {
        return text.into();
    }
    let scientific = format!("{x:.5e}");
    let (mantissa, exp) = scientific
        .split_once('e')
        .expect("LowerExp writes an exponent");
    let exp: i32 = exp.parse().expect("LowerExp writes an integer exponent");
    if (-4..6).contains(&exp) {
        let decimals = (5 - exp) as usize;
        trim_fraction(&format!("{x:.decimals$}")).to_string()
    } else {
        format!("{}{}", trim_fraction(mantissa), exponent(exp))
    }
}

/// `repr(s)` for a str: single quotes unless only double quotes avoid escaping.
pub fn str_repr(s: &str) -> String {
    let quote = if s.contains('\'') && !s.contains('"') {
        '"'
    } else {
        '\''
    };
    let mut out = String::with_capacity(s.len() + 2);
    out.push(quote);
    for c in s.chars() {
        match c {
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if c == quote => {
                out.push('\\');
                out.push(c);
            }
            c if (c as u32) < 0x20 || c as u32 == 0x7f => {
                out.push_str(&format!("\\x{:02x}", c as u32));
            }
            c => out.push(c),
        }
    }
    out.push(quote);
    out
}

/// `str.strip()` for ASCII text. Python also strips the four separator controls `\x1c..\x1f`.
pub fn strip(s: &str) -> &str {
    s.trim_matches(is_space)
}

/// `str.isspace()` for one ASCII character.
pub fn is_space(c: char) -> bool {
    matches!(
        c,
        ' ' | '\t' | '\n' | '\r' | '\x0b' | '\x0c' | '\x1c'..='\x1f'
    )
}

fn non_finite(x: f64) -> Option<&'static str> {
    if x.is_nan() {
        Some("nan")
    } else if x.is_infinite() {
        Some(if x > 0.0 { "inf" } else { "-inf" })
    } else {
        None
    }
}

/// Sign, significant digits without a point, and the decimal exponent of the first digit.
fn shortest_digits(x: f64) -> (&'static str, String, i32) {
    let scientific = format!("{:e}", x.abs());
    let (mantissa, exp) = scientific
        .split_once('e')
        .expect("LowerExp writes an exponent");
    let sign = if x.is_sign_negative() { "-" } else { "" };
    let exp = exp.parse().expect("LowerExp writes an integer exponent");
    (sign, mantissa.replace('.', ""), exp)
}

fn exponent(exp: i32) -> String {
    let sign = if exp < 0 { '-' } else { '+' };
    format!("e{sign}{:02}", exp.unsigned_abs())
}

fn trim_fraction(s: &str) -> &str {
    if s.contains('.') {
        s.trim_end_matches('0').trim_end_matches('.')
    } else {
        s
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn float_repr_matches_python() {
        let cases = [
            (0.0, "0.0"),
            (-0.0, "-0.0"),
            (1250.0, "1250.0"),
            (-1250.0, "-1250.0"),
            (0.001, "0.001"),
            (1e-05, "1e-05"),
            (0.0001, "0.0001"),
            (1.5e-07, "1.5e-07"),
            (1e16, "1e+16"),
            (1e15, "1000000000000000.0"),
            (123456789012345680.0, "1.2345678901234568e+17"),
            (0.1 + 0.2, "0.30000000000000004"),
            (2.5, "2.5"),
            (1.0 / 3.0, "0.3333333333333333"),
            (22.87, "22.87"),
            (f64::INFINITY, "inf"),
            (f64::NEG_INFINITY, "-inf"),
            (f64::NAN, "nan"),
        ];
        for (x, expected) in cases {
            assert_eq!(float_repr(x), expected, "{x:?}");
        }
    }

    #[test]
    fn round_to_three_places_matches_python() {
        let cases = [
            (0.0625, "0.062"),
            (0.1875, "0.188"),
            (2.0005, "2.001"),
            (0.8387536992994, "0.839"),
            (0.000999, "0.001"),
            (12.3456, "12.346"),
            (-0.0004, "-0.0"),
            (1.0005, "1.0"),
            (0.0015, "0.002"),
            (0.0025, "0.003"),
            (9.9995, "9.999"),
            (756.109 - 755.5, "0.609"),
            (745.854 - 755.5, "-9.646"),
        ];
        for (x, expected) in cases {
            assert_eq!(float_repr(round(x, 3)), expected, "{x:?}");
        }
    }

    #[test]
    fn format_g_matches_python() {
        let cases = [
            (20.0, "20"),
            (0.5, "0.5"),
            (1.0, "1"),
            (100.0, "100"),
            (0.1, "0.1"),
            (1e-05, "1e-05"),
            (1234567.0, "1.23457e+06"),
            (123456.0, "123456"),
            (0.0001, "0.0001"),
            (2.5, "2.5"),
            (1.0 / 3.0, "0.333333"),
            (-0.0, "-0"),
            (1e16, "1e+16"),
            (999999.5, "1e+06"),
            (0.00012345678, "0.000123457"),
        ];
        for (x, expected) in cases {
            assert_eq!(format_g(x), expected, "{x:?}");
        }
    }

    #[test]
    fn str_repr_matches_python() {
        assert_eq!(str_repr("a'b"), r#""a'b""#);
        assert_eq!(str_repr("x\"y"), r#"'x"y'"#);
        assert_eq!(str_repr("t\tq\\"), r"'t\tq\\'");
        assert_eq!(str_repr("both'\""), r#"'both\'"'"#);
        assert_eq!(str_repr("\x01é"), r"'\x01é'");
    }

    #[test]
    fn strip_removes_python_whitespace_only() {
        assert_eq!(strip("\x1c\x0b a\tb \r\n"), "a\tb");
        assert_eq!(strip("\x00a"), "\x00a");
    }
}
