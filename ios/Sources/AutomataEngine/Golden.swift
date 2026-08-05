import Foundation

/// The golden fixture: level data and the languages themselves, generated from
/// the TypeScript engine that sections 9.1 and 9.2 prove.
///
/// This is the single source of truth for level content on iOS. The `accepts`
/// predicate is not ported, because a ported predicate is a predicate that can
/// drift; instead the language arrives as a bitmap over the canonical
/// enumeration of Σ*, and both engines are held to the same bits.

public struct GoldenProduction: Codable, Sendable, Hashable {
    public var lhs: String
    public var rhs: String
}

public struct GoldenGrammar: Codable, Sendable, Hashable {
    public var nonTerminals: [String]
    public var terminals: [String]
    public var start: String
    public var productions: [GoldenProduction]
    /// How much longer than the target a sentential form may get.
    public var slack: Int
}

public struct GoldenLevel: Codable, Sendable, LevelShape {
    public var id: String
    public var index: Int
    public var type: String
    public var title: String
    public var alphabet: [String]
    public var stackAlphabet: [String]?
    public var tapeAlphabet: [String]?
    public var par: Int
    public var maxLength: Int
    public var tests: [String]
    public var testVerdicts: [Bool]
    public var solution: Machine
    public var grammar: GoldenGrammar
    public var languageBits: String
    public var stringCount: Int

    public var kind: MachineKind { MachineKind(rawValue: type) ?? .DFA }

    /// Every string over the alphabet up to `maxLength`, in the order the
    /// bitmap is packed in.
    public func enumeration() -> [String] {
        Simulator.enumerateStrings(alphabet, maxLength: maxLength)
    }

    /// The language, one bool per string of `enumeration()`.
    public func languageBitmap() -> [Bool] {
        guard let data = Data(base64Encoded: languageBits) else { return [] }
        let bytes = [UInt8](data)
        var out: [Bool] = []
        out.reserveCapacity(stringCount)
        for i in 0..<stringCount {
            let index = i >> 3
            let byte = index < bytes.count ? bytes[index] : 0
            out.append((byte & (UInt8(1) << UInt8(i & 7))) != 0)
        }
        return out
    }

    /// A lookup from string to membership, for the strings the fixture covers.
    public func languageTable() -> [String: Bool] {
        let words = enumeration()
        let bits = languageBitmap()
        var table: [String: Bool] = [:]
        table.reserveCapacity(words.count)
        for (i, w) in words.enumerated() where i < bits.count {
            table[w] = bits[i]
        }
        return table
    }
}

public struct GoldenTotals: Codable, Sendable, Hashable {
    public var levels: Int
    public var strings: Int
    public var tests: Int
}

public struct GoldenFile: Codable, Sendable {
    public var version: Int
    public var generatedFrom: String
    public var totals: GoldenTotals
    public var levels: [GoldenLevel]

    public static func load(contentsOf url: URL) throws -> GoldenFile {
        try JSONDecoder().decode(GoldenFile.self, from: Data(contentsOf: url))
    }

    public static func load(data: Data) throws -> GoldenFile {
        try JSONDecoder().decode(GoldenFile.self, from: data)
    }

    public func level(id: String) -> GoldenLevel? {
        levels.first { $0.id == id }
    }

    /// Levels unlock in order: level n is playable once level n-1 is solved.
    public func isUnlocked(_ level: GoldenLevel, solved: Set<String>) -> Bool {
        if level.index == 1 { return true }
        guard let previous = levels.first(where: { $0.index == level.index - 1 }) else {
            return true
        }
        return solved.contains(previous.id)
    }
}
