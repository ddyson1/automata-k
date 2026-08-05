import Foundation

/// Well-formedness checks per machine class, mirroring src/engine/validate.ts.
///
/// Anything that makes the machine not a machine of its class is an error and
/// is reported instead of simulated. Anything legal but probably unintended is
/// a warning and simulation proceeds.

public struct ValidationIssue: Sendable, Hashable {
    public var message: String
    public var transitionIDs: [String]
    public var stateIDs: [String]

    public init(message: String, transitionIDs: [String] = [], stateIDs: [String] = []) {
        self.message = message
        self.transitionIDs = transitionIDs
        self.stateIDs = stateIDs
    }
}

public struct MissingPair: Sendable, Hashable {
    public var state: String
    public var symbol: String

    public init(state: String, symbol: String) {
        self.state = state
        self.symbol = symbol
    }
}

public struct ValidationReport: Sendable {
    public var ok: Bool
    public var errors: [ValidationIssue]
    public var warnings: [ValidationIssue]
    /// Empty for NFA and PDA, where a partial delta is not a gap.
    public var missingPairs: [MissingPair]
    /// True when delta is defined on every pair of a deterministic class.
    public var total: Bool
}

/// The shape of a level the validator needs. The app supplies this from the
/// bundled fixture; the tests supply it from the same file.
public protocol LevelShape {
    var kind: MachineKind { get }
    var alphabet: [String] { get }
    var stackAlphabet: [String]? { get }
    var tapeAlphabet: [String]? { get }
}

public enum Validator {

    /// Pairs of (state, symbol) with no outgoing arrow, for deterministic classes.
    public static func missingPairs(
        _ machine: Machine,
        kind: MachineKind,
        alphabet: [String]
    ) -> [MissingPair] {
        guard kind == .DFA else { return [] }
        var out: [MissingPair] = []
        for state in machine.states {
            for symbol in alphabet {
                let wired = machine.transitions.contains {
                    $0.from == state.id && $0.read == symbol
                }
                if !wired { out.append(MissingPair(state: state.id, symbol: symbol)) }
            }
        }
        return out
    }

    public static func validate(_ machine: Machine, level: LevelShape) -> ValidationReport {
        var errors: [ValidationIssue] = []
        var warnings: [ValidationIssue] = []

        let ids = Set(machine.states.map(\.id))

        if machine.states.isEmpty {
            return ValidationReport(
                ok: false,
                errors: [ValidationIssue(message: "The machine has no states.")],
                warnings: [],
                missingPairs: [],
                total: false
            )
        }

        if let start = machine.start {
            if !ids.contains(start) {
                errors.append(
                    ValidationIssue(
                        message: "The start marker points at a state that no longer exists."))
            }
        } else {
            errors.append(ValidationIssue(message: "No start state is marked."))
        }

        for t in machine.transitions where !ids.contains(t.from) || !ids.contains(t.to) {
            errors.append(
                ValidationIssue(
                    message: "An arrow points at a state that no longer exists.",
                    transitionIDs: [t.id]))
        }
        for a in machine.accepting where !ids.contains(a) {
            errors.append(
                ValidationIssue(
                    message: "An accepting marker points at a state that no longer exists."))
        }

        if !errors.isEmpty {
            return ValidationReport(
                ok: false, errors: errors, warnings: warnings, missingPairs: [], total: false)
        }

        errors.append(contentsOf: symbolIssues(machine, level: level))

        switch level.kind {
        case .DFA:
            let eps = machine.transitions.filter { $0.read == Symbols.epsilon }
            if !eps.isEmpty {
                errors.append(
                    ValidationIssue(
                        message:
                            "A deterministic finite automaton has no empty moves. Remove the ε arrows.",
                        transitionIDs: eps.map(\.id)))
            }
            errors.append(
                contentsOf: duplicateReads(machine) { "on \($0.read)" })
        case .NFA, .PDA:
            // Nondeterminism and empty moves are the point.
            break
        case .TM:
            errors.append(
                contentsOf: duplicateReads(machine) { "reading \($0.read)" })
        }

        if machine.accepting.isEmpty {
            warnings.append(
                ValidationIssue(
                    message: "No state is accepting, so this machine rejects every string."))
        }
        warnings.append(contentsOf: unreachable(machine))

        let gaps = missingPairs(machine, kind: level.kind, alphabet: level.alphabet)
        let total = level.kind == .DFA ? gaps.isEmpty : true
        if level.kind == .DFA && !gaps.isEmpty {
            let noun = gaps.count == 1 ? "pair is" : "pairs are"
            warnings.append(
                ValidationIssue(
                    message:
                        "δ is partial: \(gaps.count) \(noun) unwired and behave as an implicit dead state.",
                    stateIDs: Array(Set(gaps.map(\.state)))))
        }

        return ValidationReport(
            ok: errors.isEmpty,
            errors: errors,
            warnings: warnings,
            missingPairs: gaps,
            total: total
        )
    }

    // MARK: - pieces

    private static func duplicateReads(
        _ machine: Machine,
        describe: (Transition) -> String
    ) -> [ValidationIssue] {
        var groups: [String: [Transition]] = [:]
        var order: [String] = []
        for t in machine.transitions {
            let key = "\(t.from) \(t.read)"
            if groups[key] == nil {
                groups[key] = []
                order.append(key)
            }
            groups[key]?.append(t)
        }
        var issues: [ValidationIssue] = []
        for key in order {
            guard let list = groups[key], list.count > 1, let first = list.first else { continue }
            issues.append(
                ValidationIssue(
                    message:
                        "Two arrows leave \(machine.label(of: first.from)) \(describe(first)). A deterministic machine allows only one.",
                    transitionIDs: list.map(\.id),
                    stateIDs: [first.from]))
        }
        return issues
    }

    private static func symbolIssues(_ machine: Machine, level: LevelShape) -> [ValidationIssue] {
        var issues: [ValidationIssue] = []
        let alphabet = Set(level.alphabet)
        let stack = Set(level.stackAlphabet ?? [])
        let tape = Set(level.tapeAlphabet ?? [])

        for t in machine.transitions {
            if level.kind == .TM {
                if !tape.contains(t.read) {
                    issues.append(
                        ValidationIssue(
                            message: "\(t.read) is not in the tape alphabet.",
                            transitionIDs: [t.id]))
                }
                if t.write == nil || !tape.contains(t.write ?? "") {
                    issues.append(
                        ValidationIssue(
                            message: "\(t.write ?? "The written symbol") is not in the tape alphabet.",
                            transitionIDs: [t.id]))
                }
                if t.move == nil {
                    issues.append(
                        ValidationIssue(
                            message: "Every arrow must move the head L or R.",
                            transitionIDs: [t.id]))
                }
                continue
            }

            if t.read != Symbols.epsilon && !alphabet.contains(t.read) {
                issues.append(
                    ValidationIssue(
                        message: "\(t.read) is not in the input alphabet.",
                        transitionIDs: [t.id]))
            }
            if level.kind == .PDA {
                let pop = t.pop ?? Symbols.epsilon
                let push = t.push ?? Symbols.epsilon
                if pop != Symbols.epsilon && !stack.contains(pop) {
                    issues.append(
                        ValidationIssue(
                            message: "\(pop) is not in the stack alphabet.",
                            transitionIDs: [t.id]))
                }
                if push != Symbols.epsilon && !stack.contains(push) {
                    issues.append(
                        ValidationIssue(
                            message: "\(push) is not in the stack alphabet.",
                            transitionIDs: [t.id]))
                }
            }
        }
        return issues
    }

    private static func unreachable(_ machine: Machine) -> [ValidationIssue] {
        guard let start = machine.start else { return [] }
        var seen: Set<String> = [start]
        var queue: [String] = [start]
        var head = 0
        while head < queue.count {
            let q = queue[head]
            head += 1
            for t in machine.transitions where t.from == q && !seen.contains(t.to) {
                seen.insert(t.to)
                queue.append(t.to)
            }
        }
        let orphans = machine.states.filter { !seen.contains($0.id) }
        guard !orphans.isEmpty else { return [] }
        let message =
            orphans.count == 1
            ? "\(orphans[0].label) cannot be reached from the start state."
            : "\(orphans.count) states cannot be reached from the start state."
        return [ValidationIssue(message: message, stateIDs: orphans.map(\.id))]
    }
}
