import SwiftUI

/// Stepping one string through the machine.
///
/// The transport takes the bottom outright while a string plays: you are
/// stepping, not editing, so the tools stand down rather than stack a second
/// panel over the canvas.
struct TraceView: View {
    let input: String
    let kind: MachineKind
    let frames: [Frame]
    let outcome: RunOutcome
    @Binding var step: Int
    var onClose: () -> Void

    private var frame: Frame? {
        guard !frames.isEmpty else { return nil }
        return frames[min(max(0, step), frames.count - 1)]
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                LabelCaps(text: "Trace")
                Spacer()
                Text(verdict)
                    .font(Face.mono(12))
                    .foregroundStyle(outcome == .accept ? Ink.pass : Ink.fail)
                Button(action: onClose) {
                    Image(systemName: "xmark")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(Ink.muted)
                        .frame(width: tapTarget, height: tapTarget)
                }
                .accessibilityLabel("Close the trace")
            }

            cells

            if let memory = memoryRow {
                memory
            }

            HStack(spacing: 6) {
                transport("chevron.left", "Back") { step = max(0, step - 1) }
                transport(nil, "Play") { step = min(frames.count - 1, step + 1) }
                transport("chevron.right", "Forward") { step = min(frames.count - 1, step + 1) }
                Spacer()
                Text("\(min(step + 1, max(1, frames.count)))/\(max(1, frames.count))")
                    .font(Face.mono(12))
                    .foregroundStyle(Ink.faint)
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 12)
        .padding(.bottom, 8)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Ink.surface)
        .overlay(alignment: .top) { Divider().overlay(Ink.hairline) }
    }

    private var verdict: String {
        switch outcome {
        case .accept: return "accepted"
        case .reject: return "rejected"
        case .error: return "not a machine"
        case .nonhalting: return "did not halt"
        }
    }

    /// The input, one cell per symbol, with the read head on the current one.
    private var cells: some View {
        let symbols = input.map(String.init)
        let position = frame?.pos ?? 0
        return HStack(spacing: 5) {
            if symbols.isEmpty {
                cell(Symbols.epsilon, state: .past)
            }
            ForEach(Array(symbols.enumerated()), id: \.offset) { i, symbol in
                cell(symbol, state: i == position ? .here : (i < position ? .past : .ahead))
            }
        }
    }

    private enum CellState { case past, here, ahead }

    private func cell(_ text: String, state: CellState) -> some View {
        Text(text)
            .font(Face.mono(13))
            .foregroundStyle(state == .here ? Ink.accentInk : (state == .past ? Ink.faint : Ink.ink))
            .frame(minWidth: 26, minHeight: 28)
            .padding(.horizontal, 5)
            .background(
                RoundedRectangle(cornerRadius: Radius.chip)
                    .fill(state == .here ? Ink.accent : Ink.surface)
                    .overlay {
                        RoundedRectangle(cornerRadius: Radius.chip)
                            .strokeBorder(state == .here ? Ink.accent : Ink.hairline, lineWidth: 1)
                    }
            )
    }

    /// Whatever extra memory this class has: a stack, or a tape and its head.
    @ViewBuilder private var memoryRow: some View {
        if let stack = frame?.stack, kind == .PDA {
            HStack(spacing: 6) {
                LabelCaps(text: "Stack")
                // Top of the stack first, which is the end a reader looks at.
                ForEach(Array(stack.reversed().enumerated()), id: \.offset) { _, symbol in
                    cell(symbol, state: .ahead)
                }
            }
        } else if let tape = frame?.tape, kind == .TM {
            HStack(spacing: 6) {
                LabelCaps(text: "Tape")
                ForEach(Array(tape.enumerated()), id: \.offset) { i, symbol in
                    cell(symbol, state: i == (frame?.head ?? -1) ? .here : .ahead)
                }
            }
        }
    }

    private func transport(_ symbol: String?, _ label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            SwiftUI.Group {
                if let symbol {
                    Image(systemName: symbol).font(.system(size: 13, weight: .medium))
                } else {
                    Text(label).font(Face.sans(14))
                }
            }
            .foregroundStyle(Ink.ink)
            .frame(minWidth: tapTarget, minHeight: tapTarget)
            .padding(.horizontal, symbol == nil ? 10 : 0)
            .background(
                RoundedRectangle(cornerRadius: Radius.control)
                    .strokeBorder(Ink.hairline, lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }
}
