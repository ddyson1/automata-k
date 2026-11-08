import Foundation

/// Arranging a machine so the diagram reads. A port of src/engine/layout.ts,
/// kept identical to it so a machine tidied on the phone and the same machine
/// tidied in the browser come out in the same shape.
///
/// Rank the states by how far they are from the start along the arrows and
/// give each rank a column: a chain comes out as a row in the order it runs, a
/// branch comes out as a fork. Within a column, order by the average height of
/// whatever points at a state — the cheap half of what a real graph layout
/// engine does about edge crossings, and at five states the half that matters.
///
/// Nothing here is clamped to the logical canvas. Tidy is always followed by a
/// fit, and a six state chain needs more room than 340 units.

public struct Point: Sendable, Hashable {
    public var x: Double
    public var y: Double

    public init(x: Double, y: Double) {
        self.x = x
        self.y = y
    }
}

public enum Layout {

    private static let R = Canvas.stateRadius

    /// Least room between columns: an arrow, and a one character chip on it.
    private static let colPitch = 2 * R + 66

    /// Least room between rows: a self loop clear of the state above or below.
    private static let rowPitch = 2 * R + 48

    /// Advance of one character in the chip's face, and the height of one chip
    /// in a stack. Duplicated from the drawing code rather than imported: the
    /// engine does not depend on the UI.
    private static let chipCharW = 7.2
    private static let chipRowH = 24.0

    /// Above this, a rank with no structure to it is better off as a grid.
    private static let gridAbove = 3

    /// The class a machine's rules imply. A layout is never told the level.
    public static func kindOf(_ m: Machine) -> MachineKind {
        for t in m.transitions {
            if t.move != nil || t.write != nil { return .TM }
            if t.pop != nil || t.push != nil { return .PDA }
        }
        return .DFA
    }

    /// What a rule writes on its arrow. The app draws exactly this string.
    public static func chip(_ t: Transition, kind: MachineKind) -> String {
        switch kind {
        case .DFA, .NFA:
            return t.read
        case .PDA:
            return "\(t.read), \(t.pop ?? Symbols.epsilon) → \(t.push ?? Symbols.epsilon)"
        case .TM:
            return "\(t.read) → \(t.write ?? t.read), \(t.move?.rawValue ?? "R")"
        }
    }

    /// Pitches wide enough for what this machine actually writes on its arrows.
    /// Spacing every machine as though it were a DFA is what left the dense
    /// levels with their chips lying on top of each other after a tidy.
    private static func pitches(_ m: Machine) -> (col: Double, row: Double) {
        let kind = kindOf(m)
        var widest = 1
        var perEdge: [String: Int] = [:]
        for t in m.transitions {
            widest = max(widest, chip(t, kind: kind).count)
            let key = "\(t.from)\u{0}\(t.to)"
            perEdge[key, default: 0] += 1
        }
        let stacked = max(1, perEdge.values.max() ?? 1)
        return (
            col: max(colPitch, 2 * R + Double(widest) * chipCharW + 30),
            row: max(rowPitch, 2 * R + Double(stacked) * chipRowH + 24)
        )
    }

    /// Lay out `n` states with nothing joining them: a squarish grid, centred.
    private static func gridLayout(_ n: Int, col: Double, row: Double) -> [Point] {
        let cols = max(1, Int(ceil(Double(n).squareRoot())))
        let rows = Int(ceil(Double(n) / Double(cols)))
        let x0 = Canvas.width / 2 - (Double(cols - 1) * col) / 2
        let y0 = Canvas.height / 2 - (Double(rows - 1) * row) / 2
        return (0..<n).map { i in
            Point(
                x: (x0 + Double(i % cols) * col).rounded(),
                y: (y0 + Double(i / cols) * row).rounded()
            )
        }
    }

    /// Positions for every state of `m`, in the order `m.states` is in.
    ///
    /// Reads only the graph, never the current coordinates, so it is
    /// idempotent: tidying twice gives the same picture as tidying once.
    public static func layoutMachine(_ m: Machine) -> [Point] {
        let n = m.states.count
        if n == 0 { return [] }
        if n == 1 { return [Point(x: Canvas.width / 2, y: Canvas.height / 2)] }

        let (COL, ROW) = pitches(m)
        var index: [String: Int] = [:]
        for (i, s) in m.states.enumerated() { index[s.id] = i }

        var out: [[Int]] = Array(repeating: [], count: n)
        var into: [[Int]] = Array(repeating: [], count: n)
        for t in m.transitions {
            guard let a = index[t.from], let b = index[t.to], a != b else { continue }
            out[a].append(b)
            into[b].append(a)
        }

        // Rank by breadth first search along the arrows. The start goes first
        // so the machine is laid out in the direction it runs; anything the
        // start cannot reach is rooted separately at rank 0, so a stranded
        // state sits beside the beginning rather than trailing off the end.
        var rank = Array(repeating: -1, count: n)
        let startIndex = m.start.flatMap { index[$0] }
        var roots: [Int] = []
        if let s = startIndex { roots.append(s) }
        for i in 0..<n where i != startIndex { roots.append(i) }

        for root in roots {
            if rank[root] != -1 { continue }
            rank[root] = 0
            var queue = [root]
            var head = 0
            while head < queue.count {
                let u = queue[head]
                head += 1
                for v in out[u] where rank[v] == -1 {
                    rank[v] = rank[u] + 1
                    queue.append(v)
                }
            }
        }

        let depth = (rank.max() ?? 0) + 1
        // One rank and more than a handful means there is no sequence to show.
        if depth == 1 && n > gridAbove { return gridLayout(n, col: COL, row: ROW) }

        var columns: [[Int]] = Array(repeating: [], count: depth)
        for i in 0..<n { columns[rank[i]].append(i) }

        // Order within each column by the mean height of its predecessors in
        // the column before. Three sweeps is enough at this size; the original
        // order breaks ties, and that is usually the order they were drawn in.
        var row = Array(repeating: 0, count: n)
        for col in columns {
            for (j, i) in col.enumerated() { row[i] = j }
        }

        for _ in 0..<3 {
            for c in 1..<columns.count {
                var key: [Int: Double] = [:]
                for i in columns[c] {
                    let above = into[i].filter { rank[$0] == c - 1 }
                    key[i] = above.isEmpty
                        ? Double(row[i])
                        : above.reduce(0.0) { $0 + Double(row[$1]) } / Double(above.count)
                }
                columns[c].sort { a, b in
                    let ka = key[a] ?? 0
                    let kb = key[b] ?? 0
                    if ka != kb { return ka < kb }
                    return row[a] < row[b]
                }
                for (j, i) in columns[c].enumerated() { row[i] = j }
            }
        }

        let x0 = Canvas.width / 2 - (Double(depth - 1) * COL) / 2
        let midY = Canvas.height / 2
        var points = Array(repeating: Point(x: 0, y: 0), count: n)

        for (c, column) in columns.enumerated() {
            // Every column is centred on the same line, so a chain is level
            // and a fork opens symmetrically about it.
            let top = midY - (Double(column.count - 1) * ROW) / 2
            for (j, i) in column.enumerated() {
                points[i] = Point(
                    x: (x0 + Double(c) * COL).rounded(),
                    y: (top + Double(j) * ROW).rounded()
                )
            }
        }

        return points
    }

    /// `m` with its states moved to where `layoutMachine` puts them.
    public static func laidOut(_ m: Machine) -> Machine {
        let points = layoutMachine(m)
        var next = m
        for (i, p) in points.enumerated() where i < next.states.count {
            next.states[i].x = p.x
            next.states[i].y = p.y
        }
        return next
    }
}
