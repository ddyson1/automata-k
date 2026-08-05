import XCTest

@testable import AutomataEngine

/// Validation, caps and trace frames, mirroring the same cases in
/// tests/engine.test.ts so the two engines fail in the same places as well as
/// succeeding in the same places.
final class EngineTests: XCTestCase {

    static var fixture: GoldenFile!

    override class func setUp() {
        super.setUp()
        fixture = try! GoldenTests.loadGolden()
    }

    private var golden: GoldenFile { Self.fixture }
    private func level(_ id: String) -> GoldenLevel { golden.level(id: id)! }

    private var twoArrowsOnZero: Machine {
        Machine(
            states: [
                AutomatonState(id: "q0", label: "q0", x: 100, y: 200),
                AutomatonState(id: "q1", label: "q1", x: 240, y: 200),
            ],
            transitions: [
                Transition(id: "t0", from: "q0", to: "q0", read: "0"),
                Transition(id: "t1", from: "q0", to: "q1", read: "0"),
                Transition(id: "t2", from: "q0", to: "q1", read: "1"),
                Transition(id: "t3", from: "q1", to: "q1", read: "0"),
                Transition(id: "t4", from: "q1", to: "q1", read: "1"),
            ],
            start: "q0",
            accepting: ["q1"])
    }

    // MARK: - validation

    func testDFAWithTwoArrowsOnOneSymbolIsReportedNotSimulated() {
        let dfa = level("dfa-ends-in-1")
        let report = Validator.validate(twoArrowsOnZero, level: dfa)
        XCTAssertFalse(report.ok)
        XCTAssertEqual(report.errors.first?.transitionIDs, ["t0", "t1"])
        XCTAssertTrue(report.errors.first?.message.contains("only one") ?? false)

        let result = Simulator.run(twoArrowsOnZero, level: dfa, input: "01")
        XCTAssertEqual(result.outcome, .error)
        XCTAssertTrue(result.frames.isEmpty)
    }

    func testNFAWithTheSameShapeIsNot() {
        let nfa = level("nfa-third-last-1")
        XCTAssertTrue(Validator.validate(twoArrowsOnZero, level: nfa).errors.isEmpty)

        let result = Simulator.run(twoArrowsOnZero, level: nfa, input: "01")
        XCTAssertNotEqual(result.outcome, .error)
        XCTAssertFalse(result.frames.isEmpty)
    }

    func testDFAWithAnEmptyMoveIsReported() {
        let dfa = level("dfa-ends-in-1")
        var machine = twoArrowsOnZero
        machine.transitions = [
            Transition(id: "t0", from: "q0", to: "q1", read: "0"),
            Transition(id: "t1", from: "q0", to: "q1", read: Symbols.epsilon),
        ]
        let report = Validator.validate(machine, level: dfa)
        XCTAssertFalse(report.ok)
        XCTAssertTrue(report.errors.contains { $0.message.contains("empty moves") })
    }

    func testPartialDFAIsLegalAndBehavesAsADeadState() {
        let dfa = level("dfa-ends-in-1")
        let partial = Machine(
            states: [AutomatonState(id: "q0", label: "q0", x: 100, y: 200)],
            transitions: [Transition(id: "t0", from: "q0", to: "q0", read: "1")],
            start: "q0",
            accepting: ["q0"])

        let report = Validator.validate(partial, level: dfa)
        XCTAssertTrue(report.ok)
        XCTAssertFalse(report.total)
        XCTAssertEqual(report.missingPairs, [MissingPair(state: "q0", symbol: "0")])

        let result = Simulator.run(partial, level: dfa, input: "10")
        XCTAssertFalse(result.accepted)
        XCTAssertEqual(result.outcome, .reject)
        XCTAssertTrue(result.note?.contains("no arrow on 0") ?? false)
    }

    func testTMWithTwoRulesOnOneReadSymbolIsReported() {
        let tm = level("tm-an-bn")
        let machine = Machine(
            states: [AutomatonState(id: "q0", label: "q0", x: 100, y: 200)],
            transitions: [
                Transition(id: "t0", from: "q0", to: "q0", read: "a", write: "a", move: .R),
                Transition(id: "t1", from: "q0", to: "q0", read: "a", write: "b", move: .L),
            ],
            start: "q0",
            accepting: [])
        XCTAssertFalse(Validator.validate(machine, level: tm).ok)
        XCTAssertEqual(Simulator.run(machine, level: tm, input: "a").outcome, .error)
    }

    // MARK: - caps

    func testTuringMachineThatNeverHaltsIsDistinctFromARejection() {
        let tm = level("tm-an-bn")
        let runaway = Machine(
            states: [
                AutomatonState(id: "q0", label: "q0", x: 100, y: 200),
                AutomatonState(id: "qa", label: "qa", x: 240, y: 200),
            ],
            transitions: [
                Transition(id: "t0", from: "q0", to: "q0", read: "a", write: "a", move: .R),
                Transition(
                    id: "t1", from: "q0", to: "q0", read: Symbols.blank, write: Symbols.blank,
                    move: .R),
            ],
            start: "q0",
            accepting: ["qa"])

        let result = Simulator.simulateTM(runaway, level: tm, input: "aa")
        XCTAssertEqual(result.outcome, .nonhalting)
        XCTAssertFalse(result.accepted)
        XCTAssertTrue(result.note?.contains("has not halted") ?? false)
        XCTAssertLessThanOrEqual(result.frames.count, Limits.frames)
    }

    func testPushdownThatPushesForeverStopsAtTheStackCap() {
        let pda = level("pda-balanced")
        let pusher = Machine(
            states: [
                AutomatonState(id: "q0", label: "q0", x: 100, y: 200),
                AutomatonState(id: "q1", label: "q1", x: 240, y: 200),
            ],
            transitions: [
                Transition(
                    id: "t0", from: "q0", to: "q0", read: Symbols.epsilon, pop: Symbols.epsilon,
                    push: "X")
            ],
            start: "q0",
            accepting: ["q1"])

        let result = Simulator.simulatePDA(pusher, level: pda, input: "()")
        XCTAssertFalse(result.accepted)
        XCTAssertEqual(result.outcome, .reject)
        XCTAssertTrue(result.note?.contains("stack height cap of 16") ?? false)
    }

    // MARK: - frames

    func testDFARunProducesOneFramePerSymbolPlusTheStart() {
        let dfa = level("dfa-ends-in-1")
        let result = Simulator.run(dfa.solution, level: dfa, input: "0101")
        XCTAssertEqual(result.frames.count, 5)
        XCTAssertEqual(result.frames.first?.pos, 0)
        XCTAssertEqual(result.frames.last?.pos, 4)
    }

    func testPushdownRunCarriesTheStackBottomFirst() {
        let pda = level("pda-an-bn")
        let result = Simulator.run(pda.solution, level: pda, input: "aabb")
        XCTAssertTrue(result.accepted)
        XCTAssertEqual(result.frames.first?.stack, [Symbols.stackBottom])
        XCTAssertEqual(result.frames.compactMap { $0.stack?.count }.max(), 3)
        XCTAssertEqual(result.frames.last?.stack, [])
    }

    func testTuringRunCarriesTheTapeAndHead() {
        let tm = level("tm-an-bn")
        let result = Simulator.run(tm.solution, level: tm, input: "ab")
        XCTAssertTrue(result.accepted)
        XCTAssertTrue(result.frames.first?.tape?.joined().contains("ab") ?? false)
        XCTAssertEqual(result.frames.first?.head, 1)
        XCTAssertEqual(result.frames.first?.tapeOffset, -1)
        XCTAssertTrue(result.frames.last?.tape?.joined().contains("XY") ?? false)
    }

    func testFramesAreCappedHoweverLongTheRun() {
        let tm = level("tm-an-bn-cn")
        let long = String(repeating: "a", count: 12) + String(repeating: "b", count: 12)
            + String(repeating: "c", count: 12)
        let result = Simulator.run(tm.solution, level: tm, input: long)
        XCTAssertTrue(result.accepted)
        XCTAssertLessThanOrEqual(result.frames.count, Limits.frames)
    }

    // MARK: - enumeration parity

    func testEnumerationOrderMatchesTheFixture() {
        let words = Simulator.enumerateStrings(["0", "1"], maxLength: 2)
        XCTAssertEqual(words, ["", "0", "1", "00", "01", "10", "11"])
    }
}
