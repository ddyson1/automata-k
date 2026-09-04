import SwiftUI

/// The level list: one row per level, climbing the hierarchy, grouped by
/// machine class.
///
/// Locked levels stay visible and stay readable. The shape of the whole climb
/// is the point, and hiding the top of it would make the game smaller than the
/// subject.
struct LevelListView: View {
    @Environment(Store.self) private var store

    private struct Band: Identifiable {
        let kind: MachineKind
        let label: String
        let blurb: String
        var id: String { kind.rawValue }
    }

    private let bands: [Band] = [
        Band(
            kind: .DFA,
            label: "Deterministic finite automata",
            blurb: "One arrow per symbol per state. Finite memory, and nothing else."
        ),
        Band(
            kind: .NFA,
            label: "Nondeterministic finite automata",
            blurb: "Guessing, and epsilon moves. The same languages, drawn smaller."
        ),
        Band(
            kind: .PDA,
            label: "Pushdown automata",
            blurb: "One unbounded stack. Enough to match nesting, not enough to count twice."
        ),
        Band(
            kind: .TM,
            label: "Turing machines",
            blurb: "A tape you can rewrite and walk both ways. Every restriction is gone."
        ),
    ]

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 0) {
                    header
                    ForEach(bands) { band in
                        let levels = store.levels.filter { $0.kind == band.kind }
                        if !levels.isEmpty {
                            bandHead(band)
                            ForEach(levels, id: \.id) { level in
                                row(level)
                            }
                        }
                    }
                    footer
                }
                .padding(.horizontal, 18)
            }
            .background(Ink.ground)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar(.hidden, for: .navigationBar)
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("automata-k")
                .font(Face.serif(32))
                .foregroundStyle(Ink.ink)
            Text(
                "Draw a machine. It is graded against the language, not against an answer key. "
                    + "\(store.levels.count) levels, from finite automata to Turing machines."
            )
            .font(Face.sans(15))
            .foregroundStyle(Ink.muted)
            HStack(spacing: 10) {
                LabelCaps(text: "Solved")
                Text("\(store.progress.solved.count)/\(store.levels.count)")
                    .font(Face.mono(13, .medium))
                    .foregroundStyle(Ink.ink)
            }
            .padding(.top, 8)
        }
        .padding(.top, 24)
        .padding(.bottom, 18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .overlay(alignment: .bottom) { Divider().overlay(Ink.rule) }
    }

    private func bandHead(_ band: Band) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            LabelCaps(text: band.label)
            Text(band.blurb)
                .font(Face.sans(13))
                .foregroundStyle(Ink.muted)
        }
        .padding(.top, 26)
        .padding(.bottom, 10)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func row(_ level: GoldenLevel) -> some View {
        let unlocked = store.isUnlocked(level)
        let solved = store.isSolved(level.id)
        let drawn = store.machine(for: level.id).states.count

        // An unsolved level with work on it used to read exactly like an
        // untouched one, so opening it and meeting your own half finished
        // machine came as a surprise. Say so here instead.
        let status: String = {
            if solved {
                let n = store.best(level.id) ?? level.par
                return "\(n) states, par \(level.par)" + (store.wasShown(level.id) ? ", shown" : "")
            }
            if !unlocked { return "Locked" }
            if drawn > 0 { return "\(drawn) state\(drawn == 1 ? "" : "s") drawn, par \(level.par)" }
            return "par \(level.par)"
        }()

        return NavigationLink {
            LevelView(levelID: level.id)
        } label: {
            HStack(alignment: .firstTextBaseline, spacing: 14) {
                Text(String(format: "%02d", level.index))
                    .font(Face.mono(13))
                    .foregroundStyle(Ink.faint)
                    .frame(width: 26, alignment: .leading)
                VStack(alignment: .leading, spacing: 3) {
                    Text(level.title)
                        .font(Face.sans(16, .medium))
                        .foregroundStyle(Ink.ink)
                    Text(level.setBuilder)
                        .font(Face.mono(11.5))
                        .foregroundStyle(Ink.muted)
                        .lineLimit(1)
                }
                Spacer(minLength: 8)
                Text(status)
                    .font(Face.sans(12))
                    .foregroundStyle(Ink.muted)
                Text(solved ? "✓" : "")
                    .font(Face.sans(13))
                    .foregroundStyle(Ink.pass)
                    .frame(width: 14, alignment: .trailing)
            }
            .padding(.vertical, 13)
            .frame(minHeight: tapTarget, alignment: .leading)
            .contentShape(Rectangle())
            .opacity(unlocked ? 1 : 0.45)
            .overlay(alignment: .bottom) { Divider().overlay(Ink.hairline) }
        }
        .buttonStyle(.plain)
        .disabled(!unlocked)
        .accessibilityLabel("Level \(level.index), \(level.title). \(status).")
    }

    private var footer: some View {
        Text(
            "Progress is kept on this device only. No accounts, no analytics, no network calls."
        )
        .font(Face.sans(12))
        .foregroundStyle(Ink.faint)
        .padding(.vertical, 30)
    }
}
