// Checks the golden fixture against the field names and types the Swift
// Codable structs declare. Not a compiler, but it catches the failure mode a
// hand-written port actually has: a renamed or missing key.
import { readFileSync } from 'node:fs';

const golden = JSON.parse(readFileSync('ios/Tests/AutomataEngineTests/Fixtures/golden.json', 'utf8'));
const swift = readFileSync('ios/Sources/AutomataEngine/Golden.swift', 'utf8')
  + readFileSync('ios/Sources/AutomataEngine/Types.swift', 'utf8');

// Every `public var name: Type` inside the Codable structs we care about.
const declared = (structName) => {
  const start = swift.indexOf(`struct ${structName}`);
  if (start < 0) throw new Error(`no struct ${structName}`);
  let depth = 0, i = swift.indexOf('{', start), end = i;
  for (; i < swift.length; i++) {
    if (swift[i] === '{') depth++;
    else if (swift[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  const body = swift.slice(start, end);
  return [...body.matchAll(/public var (\w+): ([\w\[\]?<>, .]+)\n/g)]
    .map((m) => ({ name: m[1], type: m[2].trim() }))
    // computed properties have a body, stored ones do not
    .filter((f) => !f.type.includes('{'));
};

const problems = [];
const check = (structName, sample, { optional = [] } = {}) => {
  const fields = declared(structName);
  const keys = new Set(Object.keys(sample));
  for (const f of fields) {
    const isOptional = f.type.endsWith('?') || optional.includes(f.name);
    if (!keys.has(f.name) && !isOptional) {
      problems.push(`${structName}.${f.name} declared in Swift but absent from the fixture`);
    }
  }
  const known = new Set(fields.map((f) => f.name));
  for (const k of keys) {
    if (!known.has(k)) problems.push(`${structName}: fixture has "${k}", Swift does not declare it`);
  }
};

check('GoldenFile', golden);
check('GoldenTotals', golden.totals);
check('GoldenLevel', golden.levels[0], { optional: ['stackAlphabet', 'tapeAlphabet'] });
check('GoldenGrammar', golden.levels[0].grammar);
check('GoldenProduction', golden.levels[0].grammar.productions[0]);
check('Machine', golden.levels[0].solution);
check('AutomatonState', golden.levels[0].solution.states[0]);

// A PDA level exercises pop/push; a TM level exercises write/move.
const pda = golden.levels.find((l) => l.type === 'PDA');
const tm = golden.levels.find((l) => l.type === 'TM');
check('Transition', pda.solution.transitions[0]);
check('Transition', tm.solution.transitions[0]);

// Move must decode as the Swift enum's raw values.
for (const l of golden.levels) {
  for (const t of l.solution.transitions) {
    if (t.move !== undefined && !['L', 'R'].includes(t.move)) {
      problems.push(`Move "${t.move}" is not L or R`);
    }
  }
}
// MachineKind likewise.
for (const l of golden.levels) {
  if (!['DFA', 'NFA', 'PDA', 'TM'].includes(l.type)) problems.push(`kind "${l.type}" unknown`);
}
// start is String? in Swift, so null is fine but a missing key is not.
for (const l of golden.levels) {
  if (!('start' in l.solution)) problems.push(`${l.id}: solution has no start key`);
}

if (problems.length) {
  console.error('shape mismatches:\n' + problems.map((p) => '  ' + p).join('\n'));
  process.exit(1);
}
console.log(`fixture shape matches the Swift Codable declarations`);
console.log(`  levels ${golden.levels.length}  strings ${golden.totals.strings}  tests ${golden.totals.tests}`);
