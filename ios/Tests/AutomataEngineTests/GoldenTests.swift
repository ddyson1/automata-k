import XCTest

@testable import AutomataEngine

/// Section 9.1, in Swift.
///
/// The TypeScript engine is the proven one. This holds the Swift port to the
/// same bits: for every level, the verified solution is run against every
/// string over its alphabet up to the level's depth, and compared to the
/// language bitmap the fixture carries. Zero mismatches allowed.
final class GoldenTests: XCTestCase {

    static var fixture: GoldenFile!

    override class func setUp() {
        super.setUp()
        fixture = try! loadGolden()
    }

    static func loadGolden() throws -> GoldenFile {
        if let url = Bundle.module.url(
            forResource: "golden", withExtension: "json", subdirectory: "Fixtures")
        {
            return try GoldenFile.load(contentsOf: url)
        }
        if let url = Bundle.module.url(forResource: "golden", withExtension: "json") {
            return try GoldenFile.load(contentsOf: url)
        }
        // Running outside a bundle, for example from a plain `swift test` on a
        // checkout: fall back to the file beside this source.
        let here = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .appendingPathComponent("Fixtures/golden.json")
        return try GoldenFile.load(contentsOf: here)
    }

    private var golden: GoldenFile { Self.fixture }

    // MARK: - shape

    func testFixtureCoversTwelveLevels() {
        XCTAssertEqual(golden.version, 1)
        XCTAssertEqual(golden.levels.count, 12)
        XCTAssertEqual(golden.totals.levels, 12)
        XCTAssertEqual(golden.levels.map(\.index), Array(1...12))
    }

    func testHierarchyOrder() {
        let kinds = golden.levels.map(\.kind)
        XCTAssertEqual(
            kinds,
            [.DFA, .DFA, .DFA, .DFA, .NFA, .NFA, .NFA, .PDA, .PDA, .PDA, .TM, .TM])
    }

    func testEnumerationMatchesTheBitmapLength() {
        for level in golden.levels {
            XCTAssertEqual(
                level.enumeration().count, level.stringCount,
                "\(level.id) built a different enumeration than the fixture was packed from")
            XCTAssertEqual(level.languageBitmap().count, level.stringCount, level.id)
        }
    }

    // MARK: - 9.1

    func testSolutionsAgreeWithTheLanguageEverywhere() {
        var checked = 0
        var mismatches: [String] = []

        for level in golden.levels {
            let words = level.enumeration()
            let bits = level.languageBitmap()

            for (i, word) in words.enumerated() {
                let result = Simulator.run(level.solution, level: level, input: word)
                if let error = result.error {
                    mismatches.append("\(level.id) \(quoted(word)) errored: \(error)")
                    continue
                }
                if result.outcome == .nonhalting {
                    mismatches.append("\(level.id) \(quoted(word)) hit a simulation cap")
                    continue
                }
                if result.accepted != bits[i] {
                    mismatches.append(
                        "\(level.id) \(quoted(word)) expected \(bits[i]) got \(result.accepted)")
                }
                checked += 1
            }
        }

        XCTAssertEqual(
            mismatches.prefix(12).joined(separator: "\n"), "",
            "the Swift engine disagrees with the proven language")
        XCTAssertEqual(checked, golden.totals.strings)
        print("  9.1 swift: \(golden.levels.count) levels, \(checked) strings, 0 mismatches")
    }

    func testSolutionsPassTheirOwnSuites() {
        var strings = 0
        for level in golden.levels {
            let result = Simulator.runSuite(
                level.solution, level: level, tests: level.tests, expected: level.testVerdicts)
            strings += result.total
            XCTAssertTrue(result.solved, "\(level.id) did not pass its own suite")
            XCTAssertNil(result.error, level.id)
        }
        XCTAssertEqual(strings, golden.totals.tests)
    }

    func testSolutionsAreWellFormed() {
        for level in golden.levels {
            let report = Validator.validate(level.solution, level: level)
            XCTAssertTrue(
                report.errors.isEmpty,
                "\(level.id): \(report.errors.map(\.message).joined(separator: "; "))")
        }
    }

    func testEverySolutionHasParStates() {
        for level in golden.levels {
            XCTAssertEqual(level.solution.states.count, level.par, level.id)
        }
    }

    func testEveryStateSitsInsideTheCanvas() {
        for level in golden.levels {
            for state in level.solution.states {
                XCTAssertGreaterThanOrEqual(state.x, Canvas.stateRadius, "\(level.id) \(state.id)")
                XCTAssertLessThanOrEqual(
                    state.x, Canvas.width - Canvas.stateRadius, "\(level.id) \(state.id)")
                XCTAssertGreaterThanOrEqual(state.y, Canvas.stateRadius, "\(level.id) \(state.id)")
                XCTAssertLessThanOrEqual(
                    state.y, Canvas.height - Canvas.stateRadius, "\(level.id) \(state.id)")
            }
        }
    }

    private func quoted(_ w: String) -> String { w.isEmpty ? "ε" : "\"\(w)\"" }
}
