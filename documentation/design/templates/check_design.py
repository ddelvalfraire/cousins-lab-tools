#!/usr/bin/env python3
import argparse
import json
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parent
REPO = Path(subprocess.check_output(
    ["git", "-C", str(ROOT), "rev-parse", "--show-toplevel"], text=True
).strip())
DOCUMENTS = ("README.md", "legacy-workflows.md", "architecture.md", "contracts.md", "epic.md")


def validate_plan(plan):
    problems = []
    items = plan["work_items"]
    ids = [item["id"] for item in items]
    if len(ids) != len(set(ids)):
        problems.append("duplicate work item ID")
    by_id = {item["id"]: item for item in items}
    for item in items:
        if not item["acceptance"]:
            problems.append(f'{item["id"]} has no acceptance criteria')
        if item["document"] not in DOCUMENTS:
            problems.append(f'{item["id"]} references an unknown design document')
        for dependency in item["depends_on"]:
            if dependency not in by_id:
                problems.append(f'{item["id"]} has missing dependency {dependency}')
    visiting, visited = set(), set()

    def visit(item_id):
        if item_id in visiting:
            problems.append(f"dependency cycle at {item_id}")
            return
        if item_id in visited or item_id not in by_id:
            return
        visiting.add(item_id)
        for dependency in by_id[item_id]["depends_on"]:
            visit(dependency)
        visiting.remove(item_id)
        visited.add(item_id)

    for item_id in by_id:
        visit(item_id)
    for item in items:
        if item["kind"] not in {"design", "implementation"}:
            problems.append(f'{item["id"]} has an unknown work kind')
        if item["kind"] == "implementation":
            ancestors, pending = set(), list(item["depends_on"])
            while pending:
                dependency = pending.pop()
                if dependency not in ancestors and dependency in by_id:
                    ancestors.add(dependency)
                    pending.extend(by_id[dependency]["depends_on"])
            if not {"D02", "D04"} <= ancestors:
                problems.append(f'{item["id"]} bypasses an approval gate')
    if plan["approvals"]["visual"] != "required":
        problems.append("visual approval gate must remain required")
    if plan["approvals"]["architecture"] != "required":
        problems.append("architecture approval gate must remain required")
    return problems


def read_source(commit, path):
    return subprocess.check_output(
        ["git", "-C", str(REPO), "show", f"{commit}:{path}"],
        text=True, stderr=subprocess.PIPE
    )


def check_sources(plan):
    problems = []
    for source in plan["sources"]:
        try:
            lines = read_source(source["commit"], source["path"]).splitlines()
        except subprocess.CalledProcessError:
            problems.append(f'{source["id"]}: missing pinned source')
            continue
        if not 1 <= source["start"] <= source["end"] <= len(lines):
            problems.append(f'{source["id"]}: invalid line range, source has {len(lines)} lines')
    return problems


def check_documents(plan):
    problems = []
    for name in DOCUMENTS:
        if not (ROOT / name).is_file():
            problems.append(f"missing document {name}")
    if problems:
        return problems
    ids = {item["id"] for item in plan["work_items"]}
    coverage = (ROOT / "legacy-workflows.md").read_text()
    rows = re.findall(r"^\| (W\d+) \|", coverage, flags=re.MULTILINE)
    if len(rows) != len(set(rows)) or not rows:
        problems.append("coverage IDs must be present and unique")
    for match in re.finditer(r"\b(?:D|C|P|A|N|S|U|F|Q)\d{2}\b", coverage):
        if match.group() not in ids:
            problems.append(f"coverage references unknown work item {match.group()}")
    epic = (ROOT / "epic.md").read_text()
    for item in plan["work_items"]:
        for criterion in item["acceptance"]:
            if "- " + criterion not in epic:
                problems.append(f'{item["id"]} acceptance is missing from epic')
    for item_id in ids:
        if f"### {item_id}\n" not in epic:
            problems.append(f"epic has no acceptance section for {item_id}")
    pattern = re.compile(
        r"https://github.com/ddelvalfraire/cousins-lab-tools/blob/"
        r"([0-9a-f]{40})/([^\s)#]+)#L(\d+)-L(\d+)"
    )
    declared = {
        (s["commit"], s["path"], s["start"], s["end"]) for s in plan["sources"]
    }
    for name in DOCUMENTS:
        for commit, path, start, end in pattern.findall((ROOT / name).read_text()):
            if (commit, path, int(start), int(end)) not in declared:
                problems.append(f"{name}: undeclared pinned source {path}:{start}")
    return problems


def self_test(plan):
    import copy
    bad = copy.deepcopy(plan)
    bad["work_items"].append(copy.deepcopy(bad["work_items"][0]))
    assert "duplicate work item ID" in validate_plan(bad)
    bad = copy.deepcopy(plan)
    first, second = bad["work_items"][:2]
    first["depends_on"] = [second["id"]]
    second["depends_on"] = [first["id"]]
    assert any("dependency cycle" in p for p in validate_plan(bad))
    bad = copy.deepcopy(plan)
    bad["work_items"][0]["depends_on"] = ["MISSING"]
    assert any("missing dependency" in p for p in validate_plan(bad))
    bad = copy.deepcopy(plan)
    next(item for item in bad["work_items"] if item["id"] == "D04")["depends_on"] = ["D01", "D03"]
    assert any("bypasses an approval gate" in p for p in validate_plan(bad))
    bad = copy.deepcopy(plan)
    bad["sources"] = [dict(plan["sources"][0], path="__missing_design_source__")]
    assert any("missing pinned source" in p for p in check_sources(bad))
    bad["sources"] = [dict(plan["sources"][0], end=10**9)]
    assert any("invalid line range" in p for p in check_sources(bad))
    print("Negative controls passed: duplicate, cycle, missing dependency/source, invalid range, approval bypass.")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    plan = json.loads((ROOT / "plan.json").read_text())
    problems = validate_plan(plan) + check_sources(plan) + check_documents(plan)
    if problems:
        for problem in problems:
            print(problem, file=sys.stderr)
        return 1
    if args.self_test:
        self_test(plan)
    print(f'Checked {len(plan["sources"])} pinned sources and {len(plan["work_items"])} work items.')
    print("Source/design consistency only. Runtime, scientific output and approvals are not verified.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
