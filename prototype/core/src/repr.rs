//! Values rendered the way the Python engine's messages show them, so error text stays identical.

use serde_json::Value;

/// Python's `repr()` of the value as `json.loads` would have produced it.
pub fn repr(value: &Value) -> String {
    match value {
        Value::Null => "None".into(),
        Value::Bool(true) => "True".into(),
        Value::Bool(false) => "False".into(),
        Value::Number(n) => match n.as_f64() {
            Some(f) if !(n.is_i64() || n.is_u64()) => float_repr(f),
            _ => n.to_string(),
        },
        Value::String(s) => str_repr(s),
        Value::Array(items) => format!("[{}]", join(items.iter().map(repr))),
        Value::Object(map) => format!(
            "{{{}}}",
            join(
                map.iter()
                    .map(|(k, v)| format!("{}: {}", str_repr(k), repr(v)))
            )
        ),
    }
}

/// Python's `str()`: text as is, everything else as `repr()`.
pub fn display(value: &Value) -> String {
    match value {
        Value::String(s) => s.clone(),
        other => repr(other),
    }
}

/// Python's `repr()` of a list of strings, as `sorted(names)` prints in messages.
pub fn list_repr<'a>(names: impl IntoIterator<Item = &'a str>) -> String {
    format!("[{}]", join(names.into_iter().map(str_repr)))
}

pub fn str_repr(text: &str) -> String {
    let quote = if text.contains('\'') && !text.contains('"') {
        '"'
    } else {
        '\''
    };
    let mut out = String::from(quote);
    for c in text.chars() {
        match c {
            '\\' => out.push_str("\\\\"),
            '\t' => out.push_str("\\t"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            c if c == quote => {
                out.push('\\');
                out.push(c);
            }
            c if printable(c) => out.push(c),
            c if (c as u32) < 0x100 => out.push_str(&format!("\\x{:02x}", c as u32)),
            c if (c as u32) < 0x10000 => out.push_str(&format!("\\u{:04x}", c as u32)),
            c => out.push_str(&format!("\\U{:08x}", c as u32)),
        }
    }
    out.push(quote);
    out
}

/// Python's `repr(float)`: shortest round-trip digits, exponent form outside [1e-4, 1e16).
pub fn float_repr(f: f64) -> String {
    if f.is_nan() {
        return "nan".into();
    }
    let debug = format!("{f:?}");
    match debug.split_once('e') {
        Some((mantissa, exponent)) => {
            let (sign, digits) = match exponent.strip_prefix('-') {
                Some(digits) => ('-', digits),
                None => ('+', exponent),
            };
            format!("{mantissa}e{sign}{digits:0>2}")
        }
        None => debug,
    }
}

// Python's str.isprintable() on the characters a template can plausibly hold; Rust has no
// table for the full Unicode categories it checks.
fn printable(c: char) -> bool {
    c == ' '
        || !(c.is_control()
            || c.is_whitespace()
            || matches!(c, '\u{ad}' | '\u{200b}'..='\u{200f}' | '\u{2060}'..='\u{2064}' | '\u{feff}'))
}

fn join(items: impl Iterator<Item = String>) -> String {
    items.collect::<Vec<_>>().join(", ")
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn floats_print_as_python_repr() {
        let cases = [
            (1e16, "1e+16"),
            (1e15, "1000000000000000.0"),
            (1e-5, "1e-05"),
            (1e-4, "0.0001"),
            (1.5e-7, "1.5e-07"),
            (30.0, "30.0"),
            (0.303, "0.303"),
            (1831.1123481696839, "1831.1123481696839"),
            (-0.0, "-0.0"),
            (1e300, "1e+300"),
            (123456789012345680.0, "1.2345678901234568e+17"),
            (2.5e-320, "2.5e-320"),
            (f64::INFINITY, "inf"),
            (f64::NAN, "nan"),
            (-1e22, "-1e+22"),
        ];
        for (value, python) in cases {
            assert_eq!(float_repr(value), python);
        }
    }

    #[test]
    fn strings_pick_quotes_and_escape_as_python_repr() {
        assert_eq!(str_repr("it's"), "\"it's\"");
        assert_eq!(str_repr("a\"b"), "'a\"b'");
        assert_eq!(str_repr("both'\""), "'both\\'\"'");
        assert_eq!(
            str_repr("tab\tnl\n\x01\x7f\u{e9}\u{200b}\\"),
            "'tab\\tnl\\n\\x01\\x7f\u{e9}\\u200b\\\\'"
        );
    }

    #[test]
    fn containers_print_as_python_repr() {
        let value = json!(["a", null, true, 1, 2.0, {"k": "v"}]);
        assert_eq!(repr(&value), "['a', None, True, 1, 2.0, {'k': 'v'}]");
        assert_eq!(display(&json!("light")), "light");
        assert_eq!(list_repr(["gain", "x"]), "['gain', 'x']");
    }
}
