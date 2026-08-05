import Foundation

/// Core engine types, mirroring src/engine/types.ts one for one.
///
/// This target imports Foundation and nothing else. No SwiftUI, no UIKit, so
/// the whole engine is testable from `swift test` with no simulator, which is
/// the same property the TypeScript engine has.

public enum MachineKind: String, Codable, Sendable, CaseIterable {
    case DFA, NFA, PDA, TM
}

public enum Move: String, Codable, Sendable {
    case L, R
}

public enum Symbols {
    /// Epsilon. A distinct symbol constant, never a member of an input alphabet.
    public static let epsilon = "ε"
    /// The blank tape symbol. Never an input symbol.
    public static let blank = "⊔"
    /// Bottom-of-stack marker a PDA stack is initialised with.
    public static let stackBottom = "$"
}

public struct AutomatonState: Codable, Hashable, Sendable, Identifiable {
    public var id: String
    public var label: String
    public var x: Double
    public var y: Double

    public init(id: String, label: String, x: Double, y: Double) {
        self.id = id
        self.label = label
        self.x = x
        self.y = y
    }
}

/// One arrow-borne rule. Field use by machine class:
///   DFA  read
///   NFA  read, which may be epsilon
///   PDA  read, pop, push, each of which may be epsilon
///   TM   read, write, move
public struct Transition: Codable, Hashable, Sendable, Identifiable {
    public var id: String
    public var from: String
    public var to: String
    public var read: String
    public var pop: String?
    public var push: String?
    public var write: String?
    public var move: Move?

    public init(
        id: String,
        from: String,
        to: String,
        read: String,
        pop: String? = nil,
        push: String? = nil,
        write: String? = nil,
        move: Move? = nil
    ) {
        self.id = id
        self.from = from
        self.to = to
        self.read = read
        self.pop = pop
        self.push = push
        self.write = write
        self.move = move
    }
}

public struct Machine: Codable, Hashable, Sendable {
    public var states: [AutomatonState]
    public var transitions: [Transition]
    public var start: String?
    public var accepting: [String]

    public init(
        states: [AutomatonState] = [],
        transitions: [Transition] = [],
        start: String? = nil,
        accepting: [String] = []
    ) {
        self.states = states
        self.transitions = transitions
        self.start = start
        self.accepting = accepting
    }

    public func label(of id: String) -> String {
        states.first(where: { $0.id == id })?.label ?? "?"
    }
}

/// One step of a run, used to drive the trace player.
public struct Frame: Sendable, Hashable {
    public var active: [String]
    public var pos: Int
    /// PDA only. Bottom first, so the last element is the top of the stack.
    public var stack: [String]?
    /// TM only. A materialised window of the tape.
    public var tape: [String]?
    /// TM only. Index of the head within `tape`.
    public var head: Int?
    /// TM only. Tape cell index that `tape[0]` corresponds to.
    public var tapeOffset: Int?
    public var note: String?

    public init(
        active: [String],
        pos: Int,
        stack: [String]? = nil,
        tape: [String]? = nil,
        head: Int? = nil,
        tapeOffset: Int? = nil,
        note: String? = nil
    ) {
        self.active = active
        self.pos = pos
        self.stack = stack
        self.tape = tape
        self.head = head
        self.tapeOffset = tapeOffset
        self.note = note
    }
}

public enum RunOutcome: String, Sendable {
    case accept, reject, error, nonhalting
}

public struct RunResult: Sendable {
    public var accepted: Bool
    public var frames: [Frame]
    /// Set when the machine is not well formed and was therefore not simulated.
    public var error: String?
    /// Informational: partial delta counts, caps hit, and so on.
    public var note: String?
    /// Distinguishes a rejection from a run that hit a cap without halting.
    public var outcome: RunOutcome

    public init(
        accepted: Bool,
        frames: [Frame],
        error: String? = nil,
        note: String? = nil,
        outcome: RunOutcome
    ) {
        self.accepted = accepted
        self.frames = frames
        self.error = error
        self.note = note
        self.outcome = outcome
    }
}

/// Simulation caps. These are the same numbers as the TypeScript engine, and
/// the golden fixture depends on them matching.
public enum Limits {
    /// PDA: maximum configurations dequeued before giving up.
    public static let pdaConfigs = 40_000
    /// PDA: stack height cap, as a function of input length.
    public static func pdaStackHeight(_ inputLength: Int) -> Int { 2 * inputLength + 12 }
    /// TM: maximum steps before reporting a non-halting result.
    public static let tmSteps = 4_000
    /// Frames retained for the trace player. Simulation continues past this.
    public static let frames = 400
}

/// The logical canvas. Authored coordinates are resolution independent.
public enum Canvas {
    public static let width: Double = 340
    public static let height: Double = 460
    public static let stateRadius: Double = 28
    public static let hitRadius: Double = 36
    public static let padding: Double = 10
}
