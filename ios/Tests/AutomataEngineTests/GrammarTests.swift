import XCTest

@testable import AutomataEngine

/// Section 9.2, in Swift.
///
/// Each grammar is derived by breadth-first search over sentential forms with a
/// length cap, and the generated set is asserted equal to the level's language
/// over the same range. One wrong production shows up immediately, including in
/// the context sensitive grammar for aⁿbⁿcⁿ.
final class GrammarTests: XCTestCase {

    static var fixture: GoldenFile!

    override class func setUp() {
        super.setUp()
        fixture = try! GoldenTests.loadGolden()
    }

    private var golden: GoldenFile { Self.fixture }

    func testEveryGrammarGeneratesExactlyItsLanguage() {
        var compared = 0
        var problems: [String] = []

        for level in golden.levels {
            let words = level.enumeration()
            let bits = level.languageBitmap()
            var expected: Set<String> = []
            for (i, w) in words.enumerated() where bits[i] { expected.insert(w) }

            let derived = Grammar.derive(level.grammar, maxLength: level.maxLength)

            let over = derived.subtracting(expected).sorted().prefix(6)
            let under = expected.subtracting(derived).sorted().prefix(6)

            if !over.isEmpty {
                problems.append("\(level.id) derives but should not: \(over.map(display))")
            }
            if !under.isEmpty {
                problems.append("\(level.id) cannot derive: \(under.map(display))")
            }
            compared += expected.count + derived.count
        }

        XCTAssertEqual(problems.joined(separator: "\n"), "")
        print("  9.2 swift: \(golden.levels.count) grammars, \(compared) strings, 0 mismatches")
    }

    func testGrammarsAreWellFormed() {
        for level in golden.levels {
            let g = level.grammar
            XCTAssertTrue(g.nonTerminals.contains(g.start), level.id)
            XCTAssertEqual(Set(g.terminals), Set(level.alphabet), level.id)

            let known = Set(g.nonTerminals + g.terminals)
            for p in g.productions {
                XCTAssertFalse(p.lhs.isEmpty, "\(level.id) has an empty left-hand side")
                XCTAssertTrue(
                    p.lhs.contains(where: { g.nonTerminals.contains(String($0)) }),
                    "\(level.id): \(p.lhs) -> \(p.rhs) must rewrite a non terminal")
                for ch in p.lhs + p.rhs {
                    XCTAssertTrue(
                        known.contains(String(ch)),
                        "\(level.id): \(ch) in \(p.lhs) -> \(p.rhs) is not declared")
                }
            }
        }
    }

    /// The harness has to be able to fail, or it is proving nothing.
    func testTheHarnessCatchesAWrongProduction() throws {
        let level = try XCTUnwrap(golden.level(id: "pda-an-bn"))
        var broken = level.grammar
        broken.productions = [
            GoldenProduction(lhs: "S", rhs: "aSbb"),
            GoldenProduction(lhs: "S", rhs: ""),
        ]
        let derived = Grammar.derive(broken, maxLength: level.maxLength)

        let words = level.enumeration()
        let bits = level.languageBitmap()
        var expected: Set<String> = []
        for (i, w) in words.enumerated() where bits[i] { expected.insert(w) }

        XCTAssertNotEqual(derived, expected)
    }

    func testTheHarnessCatchesAWrongContextSensitiveProduction() throws {
        let level = try XCTUnwrap(golden.level(id: "tm-an-bn-cn"))
        var broken = level.grammar
        // CB -> BC is what sorts the block. Without it nothing past n = 1 derives.
        broken.productions = broken.productions.filter { $0.lhs != "CB" }
        let derived = Grammar.derive(broken, maxLength: level.maxLength)

        XCTAssertTrue(derived.contains("abc"))
        XCTAssertFalse(derived.contains("aabbcc"))
    }

    private func display(_ w: String) -> String { w.isEmpty ? "ε" : w }
}
