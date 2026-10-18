use std::collections::BTreeMap;

use cousinslab::templates::{Paths, StoreError, TemplateStore};
use serde_json::{Value, json};
use tempfile::TempDir;

const TEMPLATE: &str = "jii-leaf-co2-fluorescence";

fn store() -> (TemplateStore, TempDir) {
    let data = tempfile::tempdir().unwrap();
    (TemplateStore::new(Paths::default(), data.path()), data)
}

fn latest(store: &TemplateStore) -> Value {
    store.get(TEMPLATE, None).unwrap().data().clone()
}

fn rejection(result: Result<impl std::fmt::Debug, StoreError>) -> String {
    match result.unwrap_err() {
        StoreError::Invalid(e) => e.0,
        other => panic!("expected a validation error, got {other:?}"),
    }
}

#[test]
fn template_edit_becomes_a_new_revision_and_the_old_one_is_unchanged() {
    let (store, data_dir) = store();
    let mut data = latest(&store);
    data["roles"]["light"]["start_delay_s"] = json!(120);
    let saved = store.save_revision(TEMPLATE, data).unwrap();
    assert_eq!(saved.revision(), 2);
    assert_eq!(store.revisions(TEMPLATE).unwrap(), [1, 2]);
    let r1 = store.get(TEMPLATE, Some(1)).unwrap();
    assert_eq!(r1.data()["roles"]["light"]["start_delay_s"], 30);
    assert_eq!(store.get(TEMPLATE, None).unwrap().data(), saved.data());
    let file = data_dir
        .path()
        .join("templates")
        .join(TEMPLATE)
        .join("rev-2.yaml");
    let written = std::fs::read_to_string(&file).unwrap();
    assert!(
        written.contains("µbar"),
        "text is stored as UTF-8, not escaped"
    );

    let mut data = latest(&store);
    data["name"] = json!("Third");
    assert_eq!(store.save_revision(TEMPLATE, data).unwrap().revision(), 3);
    assert_eq!(std::fs::read_to_string(&file).unwrap(), written);
    let leftovers: Vec<_> = std::fs::read_dir(file.parent().unwrap())
        .unwrap()
        .map(|e| e.unwrap().file_name().into_string().unwrap())
        .collect();
    assert_eq!(leftovers.len(), 2, "{leftovers:?}");
}

#[test]
fn invalid_template_edit_is_rejected_with_the_reason() {
    let (store, _data_dir) = store();
    let mut data = latest(&store);
    data["derived"]["ubar_co2"]["expr"] = json!("(m44 - not_a_parameter) * ubar_per_mv");
    let message = rejection(store.save_revision(TEMPLATE, data));
    assert!(message.contains("not_a_parameter"), "{message}");
    assert_eq!(
        store.revisions(TEMPLATE).unwrap(),
        [1],
        "nothing is written"
    );
}

#[test]
fn template_view_carries_the_layout_and_what_an_excluded_role_hides() {
    let (store, _data_dir) = store();
    let template = store.get(TEMPLATE, None).unwrap();
    let layout = template.layout();
    let acquisition: BTreeMap<&str, &Value> = layout["views"][0]["components"]
        .as_array()
        .unwrap()
        .iter()
        .map(|c| (c["id"].as_str().unwrap(), c))
        .collect();
    assert_eq!(
        (
            &acquisition["co2-chart"]["x"],
            &acquisition["fluorescence-chart"]["x"]
        ),
        (&json!(0), &json!(4)),
        "charts side by side"
    );
    assert_eq!(acquisition["co2-now"]["value"], "ubar_co2");
    assert_eq!(acquisition["fluorescence-now"]["value"], "fluorescence");
    let lowest = acquisition
        .values()
        .filter(|c| c["id"] != "captures")
        .map(|c| c["y"].as_i64().unwrap() + c["h"].as_i64().unwrap())
        .max();
    assert_eq!(acquisition["captures"]["y"].as_i64(), lowest);
    assert!(template.hidden_components().is_empty());

    let mut data = template.data().clone();
    data["roles"]["light"]["enabled"] = json!(false);
    let r2 = store.save_revision(TEMPLATE, data).unwrap();
    let hidden = serde_json::to_value(r2.hidden_components()).unwrap();
    assert_eq!(
        hidden,
        json!({"fluorescence-chart": "Every role in chart fluorescence is excluded",
               "fluorescence-now": "Role light is excluded"})
    );
    assert_eq!(
        r2.layout(),
        layout,
        "hiding is resolved per revision; the stored layout is untouched"
    );
}

#[test]
fn layout_edit_becomes_a_new_revision_and_the_old_layout_is_unchanged() {
    let (store, _data_dir) = store();
    let mut data = latest(&store);
    let views = data["layout"]["views"].as_array_mut().unwrap();
    views.reverse();
    views[1]["components"][0]["x"] = json!(4);
    views[1]["components"][1]["x"] = json!(0);
    let r2 = store.save_revision(TEMPLATE, data).unwrap().layout();
    let ids = |layout: &Value| -> Vec<String> {
        layout["views"]
            .as_array()
            .unwrap()
            .iter()
            .map(|v| v["id"].as_str().unwrap().to_string())
            .collect()
    };
    assert_eq!(ids(&r2), ["signals", "acquisition"]);
    assert_eq!(
        [
            &r2["views"][1]["components"][0]["x"],
            &r2["views"][1]["components"][1]["x"]
        ],
        [&json!(4), &json!(0)]
    );
    let r1 = store.get(TEMPLATE, Some(1)).unwrap().layout();
    assert_eq!(ids(&r1), ["acquisition", "signals"]);
    assert_eq!(r1["views"][0]["components"][0]["x"], 0);
}

#[test]
fn overlapping_layout_edit_is_rejected_with_the_reason() {
    let (store, _data_dir) = store();
    let mut data = latest(&store);
    data["layout"]["views"][0]["components"][1]["x"] = json!(2);
    let message = rejection(store.save_revision(TEMPLATE, data));
    assert!(
        message.contains("'co2-chart' and 'fluorescence-chart' overlap"),
        "{message}"
    );
}

#[test]
fn a_revision_cannot_move_the_template_to_another_id() {
    let (store, _data_dir) = store();
    let mut data = latest(&store);
    data["id"] = json!("other-template");
    let error = store.save_revision(TEMPLATE, data).unwrap_err();
    assert!(matches!(error, StoreError::IdChanged));
    assert_eq!(
        error.to_string(),
        "The template id cannot change in a revision. Copy it under a new id instead."
    );
}

#[test]
fn yaml_text_is_saved_and_text_that_is_not_a_template_is_a_validation_error() {
    let (store, _data_dir) = store();
    let mut data = latest(&store);
    data["roles"]["ms"]["start_delay_s"] = json!(5);
    let text = serde_norway::to_string(&data).unwrap();
    let saved = store.save_yaml(TEMPLATE, &text).unwrap();
    assert_eq!(saved.data()["roles"]["ms"]["start_delay_s"], 5);

    assert!(!rejection(store.save_yaml(TEMPLATE, "id: [unclosed")).is_empty());
    assert_eq!(
        rejection(store.save_yaml(TEMPLATE, "- just\n- a list\n")),
        "A template must be a mapping"
    );
    assert_eq!(store.revisions(TEMPLATE).unwrap(), [1, 2]);
}

#[test]
fn unknown_templates_and_revisions_are_not_found() {
    let (store, _data_dir) = store();
    let missing = store.get("no-such-template", None).unwrap_err();
    assert_eq!(missing.to_string(), "No template no-such-template");
    assert!(matches!(
        store.get(TEMPLATE, Some(9)),
        Err(StoreError::NotFound(_))
    ));
    assert!(store.revisions("no-such-template").unwrap().is_empty());
}

#[test]
fn listing_gives_the_latest_revision_of_each_template() {
    let (store, _data_dir) = store();
    let mut data = latest(&store);
    data["name"] = json!("Renamed");
    store.save_revision(TEMPLATE, data).unwrap();
    let listed: Vec<(String, i64)> = store
        .list()
        .unwrap()
        .iter()
        .map(|t| (t.id().to_string(), t.revision()))
        .collect();
    assert_eq!(
        listed,
        [
            (TEMPLATE.to_string(), 2),
            ("legacy-module2-co2-o2".to_string(), 1)
        ]
    );
}

#[test]
fn concurrent_edits_each_become_their_own_revision() {
    let (store, data_dir) = store();
    let base = latest(&store);
    let start = std::sync::Barrier::new(8);
    let mut revisions: Vec<i64> = std::thread::scope(|scope| {
        let saves: Vec<_> = (0..8)
            .map(|n| {
                let (store, base, start) = (&store, &base, &start);
                scope.spawn(move || {
                    let mut data = base.clone();
                    data["name"] = json!(format!("Edit {n}"));
                    start.wait();
                    store.save_revision(TEMPLATE, data).unwrap().revision()
                })
            })
            .collect();
        saves.into_iter().map(|s| s.join().unwrap()).collect()
    });
    revisions.sort();
    assert_eq!(revisions, (2..=9).collect::<Vec<_>>());
    let names: std::collections::BTreeSet<String> = (2..=9)
        .map(|r| {
            store.get(TEMPLATE, Some(r)).unwrap().data()["name"]
                .as_str()
                .unwrap()
                .into()
        })
        .collect();
    assert_eq!(names.len(), 8, "every edit is stored once");
    let folder = data_dir.path().join("templates").join(TEMPLATE);
    assert_eq!(
        std::fs::read_dir(folder).unwrap().count(),
        8,
        "no partial files are left"
    );
}
