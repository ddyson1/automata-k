#!/usr/bin/env python3
"""
The checks a compiler would do, minus the compiler.

There is no Swift toolchain on the machine this was written on, so the first
real build will be on a Mac. These are the failures that would otherwise be
found there one at a time: a symbol that does not exist, a file that is not in
the target, a project that references a path that is not on disk.

Run: python3 ios/check-app.py
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent
APP = ROOT / "App" / "AutomataK"
ENGINE = ROOT / "Sources" / "AutomataEngine"
PBXPROJ = ROOT / "App" / "AutomataK.xcodeproj" / "project.pbxproj"

problems: list[str] = []
notes: list[str] = []


def swift_files(base: pathlib.Path) -> list[pathlib.Path]:
    return sorted(p for p in base.rglob("*.swift"))


def strip_comments(text: str) -> str:
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.S)
    return re.sub(r"//[^\n]*", "", text)


# 1. Every engine type the app names must actually be declared.
declared: set[str] = set()
for path in swift_files(ENGINE):
    body = strip_comments(path.read_text())
    for m in re.finditer(r"\b(?:public\s+)?(?:struct|enum|class|protocol|typealias)\s+(\w+)", body):
        declared.add(m.group(1))

def block_after(body: str, start: int) -> str:
    """The braced body that opens at or after `start`, matched by depth."""
    open_at = body.find("{", start)
    if open_at == -1:
        return ""
    depth = 0
    for i in range(open_at, len(body)):
        if body[i] == "{":
            depth += 1
        elif body[i] == "}":
            depth -= 1
            if depth == 0:
                return body[open_at:i + 1]
    return body[open_at:]


# The members the app reaches for, per engine type it uses. Declarations and
# extensions both count: runSuite lives in `extension Simulator`, and a checker
# that missed that would report a symbol that is really there.
members: dict[str, set[str]] = {}
for path in swift_files(ENGINE):
    body = strip_comments(path.read_text())
    for m in re.finditer(r"\b(?:struct|enum|class|protocol|extension)\s+(\w+)", body):
        block = block_after(body, m.end())
        if not block:
            continue
        found = set(re.findall(r"\b(?:static\s+)?(?:func|var|let|case)\s+(\w+)", block))
        members.setdefault(m.group(1), set()).update(found)

app_text = "\n".join(strip_comments(p.read_text()) for p in swift_files(APP))

ENGINE_TYPES = {
    "Machine", "AutomatonState", "Transition", "Frame", "RunResult", "RunOutcome",
    "MachineKind", "Move", "Symbols", "Limits", "Canvas", "Simulator", "Validator",
    "ValidationReport", "TestRow", "SuiteResult", "Grammar", "Layout", "Point",
    "GoldenLevel", "GoldenFile", "GoldenGrammar", "GoldenProduction", "GoldenTotals",
    "LevelShape", "MissingPair", "ValidationIssue",
}
for name in sorted(ENGINE_TYPES):
    if re.search(rf"\b{name}\b", app_text) and name not in declared:
        problems.append(f"app names `{name}`, which no engine file declares")

# 2. Every `Type.member` the app writes against an engine type must exist.
for m in re.finditer(r"\b([A-Z]\w+)\.(\w+)", app_text):
    type_name, member = m.group(1), m.group(2)
    if type_name not in ENGINE_TYPES or type_name not in members:
        continue
    if member not in members[type_name] and member not in {"self", "init", "Type"}:
        problems.append(f"`{type_name}.{member}` is used by the app but not declared on {type_name}")

# 3. The engine compiles into the app target, so importing it would fail.
if re.search(r"^\s*import\s+AutomataEngine", app_text, flags=re.M):
    problems.append("the app imports AutomataEngine, but the engine compiles into the same target")

# 4. Braces and parentheses balance in every Swift file.
for path in swift_files(APP) + swift_files(ENGINE):
    body = re.sub(r'"(?:[^"\\]|\\.)*"', '""', strip_comments(path.read_text()))
    for open_ch, close_ch in (("{", "}"), ("(", ")"), ("[", "]")):
        if body.count(open_ch) != body.count(close_ch):
            problems.append(
                f"{path.relative_to(ROOT)}: {body.count(open_ch)} `{open_ch}` against "
                f"{body.count(close_ch)} `{close_ch}`"
            )

# 5. Every app and engine source is in the target, and every path it names exists.
if not PBXPROJ.exists():
    problems.append("no project.pbxproj — run python3 ios/make-xcodeproj.py")
else:
    project = PBXPROJ.read_text()
    for path in swift_files(APP) + swift_files(ENGINE):
        if path.name not in project:
            problems.append(f"{path.relative_to(ROOT)} is not in the Xcode target, so it will not compile")
    for m in re.finditer(r'path = "([^"]+)"', project):
        rel = m.group(1)
        if rel.endswith(".app"):
            continue
        if not (APP / rel).exists() and not (ROOT / "App" / rel).exists():
            problems.append(f"the project references `{rel}`, which is not on disk")
    # Every object id the project mentions must be defined once.
    defined = set(re.findall(r"^\t\t([0-9A-F]{24}) ", project, flags=re.M))
    used = set(re.findall(r"\b([0-9A-F]{24})\b", project))
    for oid in sorted(used - defined):
        problems.append(f"the project references object {oid}, which it never defines")
    notes.append(f"project: {len(defined)} objects, {len(swift_files(APP))} app + {len(swift_files(ENGINE))} engine sources")

# 6. The fixture the app bundles must carry the fields the views read.
fixture = ROOT / "Tests" / "AutomataEngineTests" / "Fixtures" / "golden.json"
if not fixture.exists():
    problems.append("golden.json is missing; the app bundles it as its level data")
else:
    import json
    data = json.loads(fixture.read_text())
    level = data["levels"][0]
    for field in ("goal", "setBuilder", "hint", "theory", "chomsky", "tests", "testVerdicts", "solution"):
        if field not in level:
            problems.append(f"golden.json levels are missing `{field}`, which the app reads")
    notes.append(f"fixture: {len(data['levels'])} levels, {data['totals']['strings']} strings")

for note in notes:
    print(f"  {note}")

if problems:
    print(f"\n{len(problems)} problem(s):", file=sys.stderr)
    for p in problems:
        print(f"  - {p}", file=sys.stderr)
    sys.exit(1)

print("ok: the app's symbols, target membership and fixture all line up")
