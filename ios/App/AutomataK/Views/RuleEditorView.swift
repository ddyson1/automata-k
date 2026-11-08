import SwiftUI

/// Writing one rule.
///
/// A DFA arrow carries one symbol; a pushdown arrow carries read, pop and
/// push; a Turing arrow carries read, write and a direction. The fields shown
/// are the ones that class actually has, so the sheet never asks for a stack
/// symbol on a finite automaton.
struct RuleEditorView: View {
    let level: GoldenLevel
    let machine: Machine
    let from: String
    let to: String
    /// Set when an existing rule is being changed rather than a new one added.
    let existing: Transition?

    var onCommit: (Transition) -> Void
    var onDelete: (() -> Void)?

    @Environment(\.dismiss) private var dismiss

    @State private var read = ""
    @State private var pop = ""
    @State private var push = ""
    @State private var write = ""
    @State private var move: Move = .R

    private var readable: [String] {
        // An epsilon move is a guess, which only a nondeterministic machine
        // and a pushdown automaton are allowed to make.
        level.kind == .NFA || level.kind == .PDA
            ? level.alphabet + [Symbols.epsilon]
            : level.alphabet
    }

    private var stack: [String] { level.stackAlphabet ?? [Symbols.stackBottom] }
    private var tape: [String] { level.tapeAlphabet ?? level.alphabet + [Symbols.blank] }

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 22) {
                Text("\(machine.label(of: from)) → \(machine.label(of: to))")
                    .font(Face.mono(17, .medium))
                    .foregroundStyle(Ink.ink)

                picker("Read", options: readable, selection: $read)

                if level.kind == .PDA {
                    picker("Pop", options: stack + [Symbols.epsilon], selection: $pop)
                    picker("Push", options: stack + [Symbols.epsilon], selection: $push)
                }

                if level.kind == .TM {
                    picker("Write", options: tape, selection: $write)
                    picker("Move", options: ["L", "R"], selection: Binding(
                        get: { move.rawValue },
                        set: { move = Move(rawValue: $0) ?? .R }
                    ))
                }

                Spacer()

                if let onDelete {
                    Button(role: .destructive) {
                        onDelete()
                        dismiss()
                    } label: {
                        Text("Delete this rule")
                            .font(Face.sans(15))
                            .frame(maxWidth: .infinity, minHeight: tapTarget)
                    }
                }
            }
            .padding(20)
            .background(Ink.surface)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(existing == nil ? "Add" : "Save") {
                        onCommit(build())
                        dismiss()
                    }
                    .fontWeight(.semibold)
                }
            }
        }
        .onAppear(perform: seed)
    }

    private func picker(_ title: String, options: [String], selection: Binding<String>) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            LabelCaps(text: title)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(options, id: \.self) { option in
                        let on = selection.wrappedValue == option
                        Button {
                            selection.wrappedValue = option
                        } label: {
                            Text(option)
                                .font(Face.mono(15))
                                .foregroundStyle(on ? Ink.accentInk : Ink.ink)
                                .frame(minWidth: tapTarget, minHeight: tapTarget)
                                .padding(.horizontal, 8)
                                .background(
                                    RoundedRectangle(cornerRadius: Radius.control)
                                        .fill(on ? Ink.accent : Ink.surface)
                                        .overlay {
                                            RoundedRectangle(cornerRadius: Radius.control)
                                                .strokeBorder(on ? Ink.accent : Ink.hairline, lineWidth: 1)
                                        }
                                )
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, 1)
            }
        }
    }

    private func seed() {
        if let t = existing {
            read = t.read
            pop = t.pop ?? Symbols.epsilon
            push = t.push ?? Symbols.epsilon
            write = t.write ?? t.read
            move = t.move ?? .R
        } else {
            read = readable.first ?? ""
            pop = stack.first ?? Symbols.stackBottom
            push = Symbols.epsilon
            write = tape.first ?? Symbols.blank
            move = .R
        }
    }

    private func build() -> Transition {
        switch level.kind {
        case .DFA, .NFA:
            return Transition(id: existing?.id ?? "", from: from, to: to, read: read)
        case .PDA:
            return Transition(id: existing?.id ?? "", from: from, to: to, read: read, pop: pop, push: push)
        case .TM:
            return Transition(
                id: existing?.id ?? "",
                from: from,
                to: to,
                read: read,
                write: write.isEmpty ? read : write,
                move: move
            )
        }
    }
}
