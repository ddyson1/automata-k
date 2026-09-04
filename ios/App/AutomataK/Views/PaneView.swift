import SwiftUI

/// The five panes the rail opens: what the level asks, the machine as a formal
/// object, why this language needs this class, a grammar that generates it,
/// and a nudge.
///
/// Full screen rather than a sheet over the canvas. At 390pt you can read the
/// question or see the automaton, never both, so this stops pretending
/// otherwise and gives the reading the whole screen.
struct PaneView: View {
    enum Tab: String, CaseIterable, Identifiable {
        case brief = "Brief"
        case machine = "Machine"
        case theory = "Theory"
        case grammar = "Grammar"
        case stuck = "Stuck"
        var id: String { rawValue }
    }

    let level: GoldenLevel
    let machine: Machine
    let result: SuiteResult?
    /// Whether `result` is still true of what is on the canvas.
    let current: Bool
    let shownSolution: Bool

    @Binding var tab: Tab
    var onTrace: (String) -> Void
    var onReveal: () -> Void
    var onClear: () -> Void

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                tabs
                ScrollView {
                    VStack(alignment: .leading, spacing: 18) {
                        switch tab {
                        case .brief: brief
                        case .machine: machineTab
                        case .theory: theory
                        case .grammar: grammar
                        case .stuck: stuck
                        }
                    }
                    .padding(16)
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            .background(Ink.surface)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .principal) {
                    LabelCaps(text: "Level \(level.index) · \(className)")
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }

    private var className: String {
        switch level.kind {
        case .DFA: return "Finite automaton"
        case .NFA: return "Finite automaton, nondeterministic"
        case .PDA: return "Pushdown automaton"
        case .TM: return "Turing machine"
        }
    }

    private var tabs: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 16) {
                ForEach(Tab.allCases) { entry in
                    Button {
                        tab = entry
                    } label: {
                        Text(entry.rawValue)
                            .font(Face.sans(14, tab == entry ? .medium : .regular))
                            .foregroundStyle(tab == entry ? Ink.ink : Ink.muted)
                            .padding(.vertical, 11)
                            .overlay(alignment: .bottom) {
                                Rectangle()
                                    .fill(tab == entry ? Ink.ink : .clear)
                                    .frame(height: 2)
                            }
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 16)
        }
        .overlay(alignment: .bottom) { Divider().overlay(Ink.hairline) }
    }

    // MARK: - the brief

    private var brief: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text(level.goal)
                .font(Face.serif(21))
                .foregroundStyle(Ink.ink)
            Text(level.setBuilder)
                .font(Face.mono(12))
                .foregroundStyle(Ink.muted)

            list(
                "These must be accepted",
                level.tests.indices.filter { level.testVerdicts[$0] }
            )
            list(
                "These must be rejected",
                level.tests.indices.filter { !level.testVerdicts[$0] }
            )
        }
    }

    /// The strings, with the mark this machine earned on each. A mark is only
    /// shown for a result still true of the canvas: a tick that might no
    /// longer hold is worse than no tick.
    private func list(_ title: String, _ indices: [Int]) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            LabelCaps(text: title)
                .padding(.bottom, 6)
            ForEach(indices, id: \.self) { i in
                let input = level.tests[i]
                let row = result?.rows.first { $0.input == input }
                Button {
                    onTrace(input)
                } label: {
                    HStack(spacing: 11) {
                        Text(mark(row))
                            .font(Face.mono(12))
                            .foregroundStyle(markColour(row))
                            .frame(width: 12, alignment: .leading)
                        Text(input.isEmpty ? Symbols.epsilon : input)
                            .font(Face.mono(13))
                            .foregroundStyle(Ink.ink)
                        Spacer()
                        Text("trace ›")
                            .font(Face.mono(11))
                            .foregroundStyle(Ink.faint)
                    }
                    .padding(.vertical, 9)
                    .frame(minHeight: tapTarget)
                    .contentShape(Rectangle())
                    .overlay(alignment: .bottom) { Divider().overlay(Ink.hairline) }
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func mark(_ row: TestRow?) -> String {
        guard current, let row else { return "·" }
        return row.pass ? "✓" : "✕"
    }

    private func markColour(_ row: TestRow?) -> Color {
        guard current, let row else { return Ink.faint }
        return row.pass ? Ink.pass : Ink.fail
    }

    // MARK: - the machine, as a formal object

    private var machineTab: some View {
        let kind = level.kind
        let report = Validator.validate(machine, level: level)
        return VStack(alignment: .leading, spacing: 16) {
            block("The tuple", tupleLine)
            block("Q, the states", machine.states.isEmpty
                ? "Nothing drawn yet."
                : "{ " + machine.states.map(\.label).joined(separator: ", ") + " }, so \(machine.states.count) states")
            block("Σ, the input alphabet", "{ " + level.alphabet.joined(separator: ", ") + " }")
            if kind == .PDA, let stack = level.stackAlphabet {
                block("Γ, the stack alphabet", "{ " + stack.joined(separator: ", ") + " }")
            }
            if kind == .TM, let tape = level.tapeAlphabet {
                block("Γ, the tape alphabet", "{ " + tape.joined(separator: ", ") + " }")
            }
            block("q₀, the start state", machine.start.map { machine.label(of: $0) } ?? "not set")
            block("F, the accepting states", machine.accepting.isEmpty
                ? "none"
                : "{ " + machine.accepting.map { machine.label(of: $0) }.joined(separator: ", ") + " }")

            VStack(alignment: .leading, spacing: 8) {
                LabelCaps(text: "δ, the transition function")
                if machine.transitions.isEmpty {
                    Text("No rules yet.")
                        .font(Face.sans(14))
                        .foregroundStyle(Ink.muted)
                }
                ForEach(machine.transitions, id: \.id) { t in
                    Text("δ(\(machine.label(of: t.from)), \(Layout.chip(t, kind: kind))) = \(machine.label(of: t.to))")
                        .font(Face.mono(12.5))
                        .foregroundStyle(Ink.ink)
                        .padding(.vertical, 4)
                }
                if kind == .DFA {
                    Text(deltaNote(report))
                        .font(Face.mono(11.5))
                        .foregroundStyle(report.total ? Ink.muted : Ink.fail)
                        .padding(.top, 4)
                }
            }

            if !report.errors.isEmpty {
                VStack(alignment: .leading, spacing: 6) {
                    LabelCaps(text: "Not a machine yet")
                    ForEach(report.errors.indices, id: \.self) { i in
                        Text(report.errors[i].message)
                            .font(Face.sans(13))
                            .foregroundStyle(Ink.fail)
                    }
                }
            }
        }
    }

    private var tupleLine: String {
        switch level.kind {
        case .DFA, .NFA: return "M = (Q, Σ, δ, q₀, F)"
        case .PDA: return "M = (Q, Σ, Γ, δ, q₀, Z, F)"
        case .TM: return "M = (Q, Σ, Γ, δ, q₀, ⊔, F)"
        }
    }

    private func deltaNote(_ report: ValidationReport) -> String {
        let pairs = machine.states.count * level.alphabet.count
        let missing = report.missingPairs.count
        return report.total
            ? "δ is total: all \(pairs) pairs defined."
            : "δ is partial: \(pairs - missing) of \(pairs) pairs defined, \(missing) undefined."
    }

    // MARK: - theory, grammar, stuck

    private var theory: some View {
        VStack(alignment: .leading, spacing: 16) {
            block("Why this language needs this machine", level.theory)
            block("Chomsky type \(level.chomsky)", hierarchyBlurb)
        }
    }

    private var hierarchyBlurb: String {
        switch level.chomsky {
        case 3: return "Regular. A finite automaton is enough: the whole memory is which state it is in."
        case 2: return "Context free. A stack is enough, and a finite automaton is not — you cannot match nesting with finite memory."
        case 1: return "Context sensitive. Beyond a stack: this needs a tape it can rewrite and walk both ways."
        default: return "Recursively enumerable."
        }
    }

    private var grammar: some View {
        VStack(alignment: .leading, spacing: 16) {
            VStack(alignment: .leading, spacing: 6) {
                LabelCaps(text: "A grammar that generates it")
                ForEach(level.grammar.productions.indices, id: \.self) { i in
                    let p = level.grammar.productions[i]
                    Text("\(p.lhs) → \(p.rhs.isEmpty ? Symbols.epsilon : p.rhs)")
                        .font(Face.mono(13))
                        .foregroundStyle(Ink.ink)
                }
            }
            block("Start symbol", level.grammar.start)
            block("Non-terminals", "{ " + level.grammar.nonTerminals.joined(separator: ", ") + " }")
            block("Terminals", "{ " + level.grammar.terminals.joined(separator: ", ") + " }")
            Text(
                "A grammar builds strings; a machine takes them apart. They describe the same "
                    + "language from opposite ends."
            )
            .font(Face.sans(13))
            .foregroundStyle(Ink.muted)
        }
    }

    private var stuck: some View {
        VStack(alignment: .leading, spacing: 20) {
            block("A nudge", level.hint)

            VStack(alignment: .leading, spacing: 10) {
                LabelCaps(text: "The whole answer")
                Text(shownSolution
                    ? "This level is already marked as solved by reveal."
                    : "Taking this marks the level as solved after seeing the answer, which is recorded separately from solving it yourself.")
                    .font(Face.sans(13))
                    .foregroundStyle(Ink.muted)
                Button {
                    onReveal()
                    dismiss()
                } label: {
                    Text(shownSolution ? "Show it again" : "Put a worked solution on the canvas")
                        .font(Face.sans(15, .medium))
                        .foregroundStyle(Ink.ink)
                        .frame(maxWidth: .infinity, minHeight: tapTarget)
                        .background(
                            RoundedRectangle(cornerRadius: Radius.control)
                                .strokeBorder(Ink.rule, lineWidth: 1)
                        )
                }
                .buttonStyle(.plain)
            }

            if !machine.states.isEmpty {
                VStack(alignment: .leading, spacing: 10) {
                    LabelCaps(text: "Start again")
                    Text("Empties this level and leaves every other one alone. Undo puts it back.")
                        .font(Face.sans(13))
                        .foregroundStyle(Ink.muted)
                    Button(role: .destructive) {
                        onClear()
                        dismiss()
                    } label: {
                        Text("Take everything off the canvas")
                            .font(Face.sans(15))
                            .frame(maxWidth: .infinity, minHeight: tapTarget)
                    }
                }
            }
        }
    }

    private func block(_ title: String, _ body: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            LabelCaps(text: title)
            Text(body)
                .font(title.hasPrefix("The tuple") ? Face.mono(14) : Face.sans(14))
                .foregroundStyle(Ink.inkSoft)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}
