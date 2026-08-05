import Foundation

/// Derivation by breadth-first search over sentential forms, mirroring the
/// harness in tests/grammar.test.ts.
///
/// It lives in the engine rather than the test target so the app can show a
/// derivation later, and so the Swift and TypeScript suites are running the
/// same algorithm rather than two descriptions of one.

public enum Grammar {

    /// Every terminal string the grammar generates up to `maxLength`.
    ///
    /// Symbols are single characters, so a production is applied by substring
    /// replacement at every occurrence of its left-hand side. Sentential forms
    /// longer than `maxLength + grammar.slack` are pruned, which is sound
    /// because no derivation of a short string needs to pass through one.
    public static func derive(_ grammar: GoldenGrammar, maxLength: Int) -> Set<String> {
        let cap = maxLength + grammar.slack
        let terminals = Set(grammar.terminals.compactMap { $0.first })

        var seen: Set<String> = [grammar.start]
        var queue: [String] = [grammar.start]
        var words: Set<String> = []
        var head = 0

        while head < queue.count {
            let form = queue[head]
            head += 1

            if form.allSatisfy({ terminals.contains($0) }) {
                // No production can apply: every left-hand side has a non terminal.
                if form.count <= maxLength { words.insert(form) }
                continue
            }

            for production in grammar.productions {
                guard !production.lhs.isEmpty else { continue }
                var searchStart = form.startIndex
                while searchStart < form.endIndex,
                    let range = form.range(of: production.lhs, range: searchStart..<form.endIndex)
                {
                    let next = form.replacingCharacters(in: range, with: production.rhs)
                    if next.count <= cap, !seen.contains(next) {
                        seen.insert(next)
                        queue.append(next)
                    }
                    searchStart = form.index(after: range.lowerBound)
                }
            }
        }

        return words
    }
}
