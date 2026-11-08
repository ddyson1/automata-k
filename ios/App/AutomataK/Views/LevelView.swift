import SwiftUI
import UIKit

/// A level: the rail, and the canvas.
///
/// The rail across the top carries which level this is, what it asks in words
/// and in set-builder, and the verdict once a run has happened. Tapping it
/// opens the five panes full screen. Everything that acts on the machine sits
/// in the thumb's arc at the bottom: Run on the right, the four tools on the
/// left.
///
/// Grading happens on a press, not on every edit. Live grading is honest but
/// has no moment in it — the answer arrives while you are still mid-thought.
/// Every mark reverts to a dot the instant the machine stops being the one
/// that was run.
struct LevelView: View {
    let levelID: String

    @Environment(Store.self) private var store
    @Environment(\.dismiss) private var dismiss

    @State private var selected: String?
    @State private var result: SuiteResult?
    /// The machine `result` was computed from, so a stale verdict is visible.
    @State private var gradedAs: String?
    @State private var pane: PaneView.Tab?
    @State private var rule: PendingRule?
    @State private var renaming: String?
    @State private var renameText = ""
    @State private var trace: Trace?
    /// The level "Next level" pushes onto the stack.
    @State private var goTo: String?

    private struct PendingRule: Identifiable {
        var from: String
        var to: String
        var existing: Transition?
        var id: String { "\(from)-\(to)-\(existing?.id ?? "new")" }
    }

    private struct Trace: Identifiable {
        var input: String
        var frames: [Frame]
        var outcome: RunOutcome
        var step: Int = 0
        var id: String { input }
    }

    private var level: GoldenLevel? { store.level(id: levelID) }
    private var machine: Machine { store.machine(for: levelID) }

    /// Whether the verdict on screen is still true of what is on the canvas.
    private var current: Bool {
        gradedAs != nil && gradedAs == signature(machine)
    }

    var body: some View {
        if let level {
            content(level)
                .navigationBarTitleDisplayMode(.inline)
                .toolbar(.hidden, for: .navigationBar)
        } else {
            Text("No such level.").font(Face.sans(15))
        }
    }

    private func content(_ level: GoldenLevel) -> some View {
        VStack(spacing: 0) {
            rail(level)
            ZStack(alignment: .bottom) {
                DiagramView(
                    machine: machine,
                    kind: level.kind,
                    active: Set(trace.map { t in
                        t.frames.isEmpty ? [] : t.frames[min(t.step, t.frames.count - 1)].active
                    } ?? []),
                    selected: $selected,
                    onPlace: { point in
                        selected = store.addState(levelID, x: point.x, y: point.y)
                    },
                    onMove: { id, point in
                        store.moveState(levelID, id: id, x: point.x, y: point.y)
                    },
                    onConnect: { from, to in
                        rule = PendingRule(from: from, to: to, existing: nil)
                    },
                    onEditRule: { id in
                        if let t = machine.transitions.first(where: { $0.id == id }) {
                            rule = PendingRule(from: t.from, to: t.to, existing: t)
                        }
                    }
                )

                if trace == nil {
                    VStack(spacing: 10) {
                        Spacer(minLength: 0)
                        if let selected, machine.states.contains(where: { $0.id == selected }) {
                            stateBar(selected)
                        }
                        bottomBar(level)
                    }
                    .padding(.bottom, 12)
                }
            }
            .overlay(alignment: .bottom) {
                if let t = trace {
                    TraceView(
                        input: t.input,
                        kind: level.kind,
                        frames: t.frames,
                        outcome: t.outcome,
                        step: Binding(
                            get: { trace?.step ?? 0 },
                            set: { trace?.step = $0 }
                        ),
                        onClose: { trace = nil }
                    )
                }
            }
        }
        .background(Ink.ground)
        .sheet(item: $rule) { pending in
            RuleEditorView(
                level: level,
                machine: machine,
                from: pending.from,
                to: pending.to,
                existing: pending.existing,
                onCommit: { draft in
                    if let existing = pending.existing {
                        store.updateTransition(levelID, id: existing.id, draft)
                    } else {
                        store.addTransition(levelID, draft)
                    }
                },
                onDelete: deleteAction(for: pending)
            )
            .presentationDetents([.medium, .large])
        }
        .sheet(item: $pane) { tab in
            PaneView(
                level: level,
                machine: machine,
                result: result,
                current: current,
                shownSolution: store.wasShown(levelID),
                tab: Binding(get: { tab }, set: { pane = $0 }),
                onTrace: { input in
                    pane = nil
                    play(input, level)
                },
                onReveal: {
                    store.reveal(levelID)
                    selected = nil
                },
                onClear: {
                    store.clear(levelID)
                    selected = nil
                }
            )
        }
        .alert("Rename state", isPresented: Binding(
            get: { renaming != nil },
            set: { if !$0 { renaming = nil } }
        )) {
            TextField("Label", text: $renameText)
            Button("Cancel", role: .cancel) { renaming = nil }
            Button("Rename") {
                if let id = renaming { store.rename(levelID, id: id, to: renameText) }
                renaming = nil
            }
        }
        .navigationDestination(item: $goTo) { id in
            LevelView(levelID: id)
        }
        .onAppear {
            // Restore a verdict for whatever is on the canvas, without fanfare.
            if result == nil && !machine.states.isEmpty { runChecks(level, quiet: true) }
        }
    }

    // MARK: - the rail

    private func rail(_ level: GoldenLevel) -> some View {
        Button {
            pane = .brief
        } label: {
            VStack(alignment: .leading, spacing: 0) {
                HStack {
                    HStack(spacing: 4) {
                        Image(systemName: "chevron.left")
                            .font(.system(size: 11, weight: .semibold))
                        LabelCaps(text: "\(String(format: "%02d", level.index)) · \(level.title)")
                    }
                    .foregroundStyle(Ink.faint)
                    Spacer()
                    Image(systemName: "chevron.down")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(Ink.faint)
                }
                .padding(.bottom, 7)

                Text(level.goal)
                    .font(Face.serif(19))
                    .foregroundStyle(Ink.ink)
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.bottom, 5)

                Text(level.setBuilder)
                    .font(Face.mono(11.5))
                    .foregroundStyle(Ink.muted)
                    .lineLimit(1)

                // Only once a run has happened: grading is on a press, so
                // before the press there is nothing true to show.
                if let result, current {
                    HStack(alignment: .firstTextBaseline, spacing: 9) {
                        Text(scoreText(result, level))
                            .font(Face.sans(13.5, .semibold))
                            .foregroundStyle(result.error != nil ? Ink.fail : (result.solved ? Ink.pass : Ink.fail))
                        Text(whyText(result, level))
                            .font(Face.mono(11))
                            .foregroundStyle(Ink.muted)
                            .lineLimit(1)
                        Spacer()
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 8)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Ink.sunken)
                    .overlay(alignment: .top) { Divider().overlay(Ink.hairline) }
                    .padding(.horizontal, -16)
                    .padding(.top, 10)
                    .padding(.bottom, -12)
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 11)
            .padding(.bottom, 12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Ink.surface)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .overlay(alignment: .bottom) { Divider().overlay(Ink.rule) }
        .accessibilityLabel("Level \(level.index), \(level.title). \(level.goal) Open the level.")
    }

    private func scoreText(_ result: SuiteResult, _ level: GoldenLevel) -> String {
        if result.error != nil { return "Not a machine yet" }
        if result.solved { return "All \(result.total) agree" }
        return "\(result.passed) of \(result.total) agree"
    }

    private func whyText(_ result: SuiteResult, _ level: GoldenLevel) -> String {
        if let error = result.error { return error }
        if result.solved {
            let n = store.best(levelID) ?? machine.states.count
            return "\(n) state\(n == 1 ? "" : "s"), par \(level.par)."
        }
        guard let miss = result.rows.first(where: { !$0.pass }) else { return "" }
        let word = miss.input.isEmpty ? Symbols.epsilon : miss.input
        return "shortest disagreement · \(word)"
    }

    // MARK: - the controls

    private func stateBar(_ id: String) -> some View {
        HStack(spacing: 2) {
            barButton(machine.start == id ? "Start ✓" : "Start") { store.setStart(levelID, id: id) }
            barButton(machine.accepting.contains(id) ? "Accepting ✓" : "Accepting") {
                store.toggleAccepting(levelID, id: id)
            }
            barButton("Rename") {
                renameText = machine.label(of: id)
                renaming = id
            }
            barButton("Delete") {
                store.deleteState(levelID, id: id)
                selected = nil
            }
        }
        .padding(3)
        .background(
            Capsule().fill(Ink.surface)
                .overlay { Capsule().strokeBorder(Ink.hairline, lineWidth: 1) }
        )
    }

    private func barButton(_ title: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(Face.sans(12.5))
                .foregroundStyle(Ink.ink)
                .padding(.horizontal, 10)
                .frame(minHeight: 38)
        }
        .buttonStyle(.plain)
    }

    private func bottomBar(_ level: GoldenLevel) -> some View {
        HStack(alignment: .bottom) {
            HStack(spacing: 1) {
                tool("arrow.uturn.backward", "Undo", enabled: store.canUndo(levelID)) {
                    store.undo(levelID)
                    selected = nil
                }
                tool("arrow.uturn.forward", "Redo", enabled: store.canRedo(levelID)) {
                    store.redo(levelID)
                    selected = nil
                }
                tool("point.topleft.down.to.point.bottomright.curvepath", "Arrange the diagram", enabled: !machine.states.isEmpty) {
                    store.tidy(levelID)
                }
                tool("arrow.down.forward.and.arrow.up.backward", "Centre and fit", enabled: !machine.states.isEmpty) {
                    // The canvas refits itself from the machine, so nudging
                    // selection is enough to bring it back to frame.
                    selected = nil
                }
            }
            .padding(.horizontal, 4)
            .padding(.vertical, 2)
            .background(
                Capsule().fill(Ink.surface)
                    .overlay { Capsule().strokeBorder(Ink.hairline, lineWidth: 1) }
            )

            Spacer(minLength: 8)

            if !machine.states.isEmpty {
                runButton(level)
            }
        }
        .padding(.horizontal, 14)
    }

    private func tool(_ symbol: String, _ label: String, enabled: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(size: 16, weight: .regular))
                .foregroundStyle(enabled ? Ink.muted : Ink.faint.opacity(0.5))
                .frame(width: tapTarget, height: 40)
        }
        .buttonStyle(.plain)
        .disabled(!enabled)
        .accessibilityLabel(label)
    }

    private func runButton(_ level: GoldenLevel) -> some View {
        let solved = result?.solved == true && current
        let hasNext = store.nextLevel(after: levelID) != nil

        return HStack(spacing: 8) {
            if solved && hasNext {
                Button {
                    runChecks(level)
                } label: {
                    Text("Run again")
                        .font(Face.sans(14))
                        .foregroundStyle(Ink.ink)
                        .padding(.horizontal, 16)
                        .frame(minHeight: tapTarget)
                        .background(
                            Capsule().fill(Ink.surface)
                                .overlay { Capsule().strokeBorder(Ink.hairline, lineWidth: 1) }
                        )
                }
                .buttonStyle(.plain)
            }

            Button {
                if solved, let next = store.nextLevel(after: levelID) {
                    goTo = next.id
                } else {
                    runChecks(level)
                }
            } label: {
                Text(solved && hasNext ? "Next level ›" : (current ? "Run again" : "Run the checks"))
                    .font(Face.sans(14, .medium))
                    .foregroundStyle(Ink.accentInk)
                    .padding(.horizontal, 20)
                    .frame(minHeight: tapTarget)
                    .background(Capsule().fill(Ink.accent))
            }
            .buttonStyle(.plain)
        }
    }

    /// Only an existing rule can be deleted, so a new one gets no action.
    private func deleteAction(for pending: PendingRule) -> (() -> Void)? {
        guard let existing = pending.existing else { return nil }
        return { store.deleteTransition(levelID, id: existing.id) }
    }

    // MARK: - grading and tracing

    private func runChecks(_ level: GoldenLevel, quiet: Bool = false) {
        let m = machine
        let suite = Simulator.runSuite(
            m,
            level: level,
            tests: level.tests,
            expected: level.testVerdicts
        )
        result = suite
        gradedAs = signature(m)

        if suite.solved {
            store.markSolved(levelID, stateCount: m.states.count)
            if !quiet {
                UINotificationFeedbackGenerator().notificationOccurred(.success)
            }
        } else if !quiet && suite.error != nil {
            UINotificationFeedbackGenerator().notificationOccurred(.warning)
        }
    }

    private func play(_ input: String, _ level: GoldenLevel) {
        let run = Simulator.run(machine, level: level, input: input)
        trace = Trace(input: input, frames: run.frames, outcome: run.outcome)
        selected = nil
    }

    /// Everything about a machine that can change a verdict, and nothing else.
    /// Coordinates and labels are left out: tidying the diagram cannot turn a
    /// tick into a cross, and losing a green run to a tidy would be a lie
    /// about what the run measured.
    private func signature(_ m: Machine) -> String {
        let states = m.states.map(\.id).sorted().joined(separator: ",")
        let accepting = m.accepting.sorted().joined(separator: ",")
        let rules = m.transitions
            .map { "\($0.from)|\($0.to)|\($0.read)|\($0.pop ?? "")|\($0.push ?? "")|\($0.write ?? "")|\($0.move?.rawValue ?? "")" }
            .sorted()
            .joined(separator: ";")
        return "\(states)/\(m.start ?? "")/\(accepting)/\(rules)"
    }
}
