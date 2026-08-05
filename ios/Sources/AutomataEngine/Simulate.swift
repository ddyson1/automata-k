import Foundation

/// The simulators, mirroring src/engine/simulate.ts.
///
/// Every simulator returns a RunResult. Frames drive the step-through player
/// and are capped at Limits.frames, but simulation always continues to the real
/// limit so the verdict is honest.

private final class FrameLog {
    private(set) var frames: [Frame] = []
    private var dropped = 0

    func push(_ frame: @autoclosure () -> Frame) {
        if frames.count < Limits.frames {
            frames.append(frame())
        } else {
            dropped += 1
        }
    }

    var truncated: Bool { dropped > 0 }
}

public enum Simulator {

    // MARK: - DFA

    /// A missing (state, symbol) pair is allowed and behaves as an implicit
    /// dead state; the count is surfaced as a note rather than an error.
    /// Duplicate reads and empty moves are errors and are reported, not run.
    public static func simulateDFA(_ m: Machine, level: LevelShape, input: String) -> RunResult {
        let report = Validator.validate(m, level: level)
        guard report.ok else {
            return RunResult(
                accepted: false, frames: [],
                error: report.errors.first?.message ?? "This machine is not a DFA.",
                outcome: .error)
        }

        let partialNote: String? =
            report.total
            ? nil
            : "δ is partial: \(report.missingPairs.count) unwired "
                + (report.missingPairs.count == 1 ? "pair." : "pairs.")

        let log = FrameLog()
        var current = m.start ?? ""
        log.push(Frame(active: [current], pos: 0))

        let chars = Array(input)
        for i in 0..<chars.count {
            let symbol = String(chars[i])
            guard let next = m.transitions.first(where: { $0.from == current && $0.read == symbol })
            else {
                log.push(Frame(active: [], pos: i + 1, note: "no arrow from here on \(symbol)"))
                return RunResult(
                    accepted: false, frames: log.frames,
                    note: [("Dead: no arrow on \(symbol)."), partialNote]
                        .compactMap { $0 }.joined(separator: " "),
                    outcome: .reject)
            }
            current = next.to
            log.push(Frame(active: [current], pos: i + 1))
        }

        let accepted = m.accepting.contains(current)
        return RunResult(
            accepted: accepted, frames: log.frames, note: partialNote,
            outcome: accepted ? .accept : .reject)
    }

    // MARK: - NFA

    /// Epsilon closure of a state set.
    public static func epsilonClosure(_ m: Machine, _ states: some Sequence<String>) -> Set<String> {
        var closure = Set(states)
        var stack = Array(closure)
        while let q = stack.popLast() {
            for t in m.transitions
            where t.from == q && t.read == Symbols.epsilon && !closure.contains(t.to) {
                closure.insert(t.to)
                stack.append(t.to)
            }
        }
        return closure
    }

    public static func simulateNFA(_ m: Machine, level: LevelShape, input: String) -> RunResult {
        let report = Validator.validate(m, level: level)
        guard report.ok else {
            return RunResult(
                accepted: false, frames: [],
                error: report.errors.first?.message ?? "This machine is not an NFA.",
                outcome: .error)
        }

        let log = FrameLog()
        var active = epsilonClosure(m, [m.start ?? ""])
        log.push(Frame(active: active.sorted(), pos: 0))

        let chars = Array(input)
        for i in 0..<chars.count {
            let symbol = String(chars[i])
            var moved: Set<String> = []
            for q in active {
                for t in m.transitions where t.from == q && t.read == symbol {
                    moved.insert(t.to)
                }
            }
            active = epsilonClosure(m, moved)
            log.push(Frame(active: active.sorted(), pos: i + 1))
            if active.isEmpty {
                return RunResult(
                    accepted: false, frames: log.frames,
                    note: "Every branch died after reading \(symbol).",
                    outcome: .reject)
            }
        }

        let accepted = active.contains { m.accepting.contains($0) }
        return RunResult(
            accepted: accepted, frames: log.frames, outcome: accepted ? .accept : .reject)
    }

    // MARK: - PDA

    private struct PDAConfig {
        var state: String
        var stack: [String]
        var pos: Int

        var key: String { "\(state)|\(stack.joined(separator: ","))|\(pos)" }
    }

    /// Stack starts as ["$"]. A transition reads a symbol or epsilon, pops one
    /// symbol or epsilon, and pushes one symbol or epsilon, the pushed symbol
    /// landing on top. Acceptance is by final state with the input consumed.
    /// Breadth-first over (state, stack, position) with a visited set and a
    /// parent map for the trace.
    public static func simulatePDA(_ m: Machine, level: LevelShape, input: String) -> RunResult {
        let report = Validator.validate(m, level: level)
        guard report.ok else {
            return RunResult(
                accepted: false, frames: [],
                error: report.errors.first?.message ?? "This machine is not a PDA.",
                outcome: .error)
        }

        let chars = Array(input)
        let stackCap = Limits.pdaStackHeight(chars.count)
        let start = PDAConfig(state: m.start ?? "", stack: [Symbols.stackBottom], pos: 0)

        var configs: [String: PDAConfig] = [:]
        var parent: [String: String] = [:]
        var queue: [String] = []

        let startKey = start.key
        configs[startKey] = start
        queue.append(startKey)

        // Outgoing transitions by source state, so the inner loop is a lookup.
        var outgoing: [String: [Transition]] = [:]
        for t in m.transitions { outgoing[t.from, default: []].append(t) }

        var head = 0
        var dequeued = 0
        var cappedConfigs = false
        var cappedStack = false
        var best = startKey
        var bestPos = 0
        var acceptKey: String? = nil

        while head < queue.count {
            if dequeued >= Limits.pdaConfigs {
                cappedConfigs = true
                break
            }
            let key = queue[head]
            head += 1
            dequeued += 1
            guard let cfg = configs[key] else { continue }

            if cfg.pos > bestPos {
                bestPos = cfg.pos
                best = key
            }

            if cfg.pos == chars.count && m.accepting.contains(cfg.state) {
                acceptKey = key
                break
            }

            for t in outgoing[cfg.state] ?? [] {
                var pos = cfg.pos
                if t.read != Symbols.epsilon {
                    if cfg.pos >= chars.count || String(chars[cfg.pos]) != t.read { continue }
                    pos = cfg.pos + 1
                }
                var stack = cfg.stack
                let pop = t.pop ?? Symbols.epsilon
                if pop != Symbols.epsilon {
                    if stack.last != pop { continue }
                    stack.removeLast()
                }
                let push = t.push ?? Symbols.epsilon
                if push != Symbols.epsilon { stack.append(push) }

                if stack.count > stackCap {
                    cappedStack = true
                    continue
                }

                let next = PDAConfig(state: t.to, stack: stack, pos: pos)
                let nextKey = next.key
                if configs[nextKey] != nil { continue }
                configs[nextKey] = next
                parent[nextKey] = key
                queue.append(nextKey)
            }
        }

        var path: [PDAConfig] = []
        var cursor: String? = acceptKey ?? best
        while let c = cursor {
            if let cfg = configs[c] { path.insert(cfg, at: 0) }
            cursor = parent[c]
        }

        let log = FrameLog()
        for c in path {
            log.push(Frame(active: [c.state], pos: c.pos, stack: c.stack))
        }

        if acceptKey != nil {
            return RunResult(accepted: true, frames: log.frames, outcome: .accept)
        }

        if cappedConfigs {
            return RunResult(
                accepted: false, frames: log.frames,
                note:
                    "Gave up after \(Limits.pdaConfigs) configurations. The search did not finish, so this is not a rejection.",
                outcome: .nonhalting)
        }

        return RunResult(
            accepted: false, frames: log.frames,
            note: cappedStack ? "Some branches passed the stack height cap of \(stackCap)." : nil,
            outcome: .reject)
    }

    // MARK: - TM

    /// Single tape, infinite both ways, blank filled. Delta is partial: no
    /// applicable transition halts and rejects. Accepts the moment it enters an
    /// accepting state. Hitting the step limit is a non-halting run, distinct
    /// from a rejection.
    public static func simulateTM(_ m: Machine, level: LevelShape, input: String) -> RunResult {
        let report = Validator.validate(m, level: level)
        guard report.ok else {
            return RunResult(
                accepted: false, frames: [],
                error: report.errors.first?.message ?? "This machine is not a TM.",
                outcome: .error)
        }

        let chars = Array(input)
        var tape: [Int: String] = [:]
        for (i, c) in chars.enumerated() { tape[i] = String(c) }

        var state = m.start ?? ""
        var head = 0
        let log = FrameLog()

        func frame(_ note: String? = nil) -> Frame {
            let window = materialise(tape: tape, head: head, inputLength: chars.count)
            return Frame(
                active: [state],
                pos: max(0, min(head, chars.count)),
                tape: window.cells,
                head: window.head,
                tapeOffset: window.offset,
                note: note)
        }

        log.push(frame())

        if m.accepting.contains(state) {
            return RunResult(accepted: true, frames: log.frames, outcome: .accept)
        }

        // Rules by (state, read), so each step is a lookup rather than a scan.
        var rules: [String: Transition] = [:]
        for t in m.transitions {
            let key = "\(t.from)\u{1}\(t.read)"
            if rules[key] == nil { rules[key] = t }
        }

        for _ in 0..<Limits.tmSteps {
            let read = tape[head] ?? Symbols.blank
            guard let rule = rules["\(state)\u{1}\(read)"] else {
                log.push(frame("no rule for \(read)"))
                return RunResult(
                    accepted: false, frames: log.frames,
                    note: "Halted: no rule from this state reading \(read).",
                    outcome: .reject)
            }
            tape[head] = rule.write ?? read
            head += (rule.move == .L ? -1 : 1)
            state = rule.to
            log.push(frame())

            if m.accepting.contains(state) {
                return RunResult(accepted: true, frames: log.frames, outcome: .accept)
            }
        }

        return RunResult(
            accepted: false, frames: log.frames,
            note:
                "Still running after \(Limits.tmSteps) steps. That is not a rejection, the machine simply has not halted.",
            outcome: .nonhalting)
    }

    private struct TapeWindow {
        var cells: [String]
        var head: Int
        var offset: Int
    }

    private static func materialise(
        tape: [Int: String], head headIndex: Int, inputLength: Int
    ) -> TapeWindow {
        var lo = min(0, headIndex)
        var hi = max(inputLength - 1, headIndex)
        for idx in tape.keys {
            lo = min(lo, idx)
            hi = max(hi, idx)
        }
        lo -= 1
        hi += 1
        var cells: [String] = []
        cells.reserveCapacity(hi - lo + 1)
        for i in lo...hi { cells.append(tape[i] ?? Symbols.blank) }
        return TapeWindow(cells: cells, head: headIndex - lo, offset: lo)
    }

    // MARK: - dispatcher

    public static func run(_ m: Machine, level: LevelShape, input: String) -> RunResult {
        switch level.kind {
        case .DFA: return simulateDFA(m, level: level, input: input)
        case .NFA: return simulateNFA(m, level: level, input: input)
        case .PDA: return simulatePDA(m, level: level, input: input)
        case .TM: return simulateTM(m, level: level, input: input)
        }
    }
}

// MARK: - grading

public struct TestRow: Sendable {
    public var input: String
    public var expected: Bool
    public var actual: Bool
    public var pass: Bool
    public var outcome: RunOutcome
    public var note: String?
    /// Set when the machine was not well formed and so was never simulated.
    public var error: String?
}

public struct SuiteResult: Sendable {
    public var rows: [TestRow]
    public var passed: Int
    public var total: Int
    public var solved: Bool
    public var error: String?
}

extension Simulator {
    /// Grade a machine against a level's fixed suite. Expected verdicts come
    /// from the language, never from stored answers about a machine.
    public static func runSuite(
        _ m: Machine,
        level: LevelShape,
        tests: [String],
        expected: [Bool]
    ) -> SuiteResult {
        var rows: [TestRow] = []
        rows.reserveCapacity(tests.count)
        for (i, input) in tests.enumerated() {
            let result = run(m, level: level, input: input)
            let want = i < expected.count ? expected[i] : false
            rows.append(
                TestRow(
                    input: input,
                    expected: want,
                    actual: result.accepted,
                    pass: result.error == nil && result.accepted == want,
                    outcome: result.outcome,
                    note: result.note,
                    error: result.error))
        }
        let passed = rows.filter(\.pass).count
        return SuiteResult(
            rows: rows,
            passed: passed,
            total: rows.count,
            solved: !rows.isEmpty && passed == rows.count,
            error: rows.compactMap(\.error).first
        )
    }

    /// Every string over the alphabet up to `maxLength`, shortest first, in the
    /// same order the golden fixture's bitmap uses.
    public static func enumerateStrings(_ alphabet: [String], maxLength: Int) -> [String] {
        var out: [String] = [""]
        var frontier: [String] = [""]
        if maxLength <= 0 { return out }
        for _ in 1...maxLength {
            var next: [String] = []
            next.reserveCapacity(frontier.count * alphabet.count)
            for w in frontier {
                for a in alphabet { next.append(w + a) }
            }
            out.append(contentsOf: next)
            frontier = next
        }
        return out
    }
}
