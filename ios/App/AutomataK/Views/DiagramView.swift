import SwiftUI

/// The canvas.
///
/// The web build reveals a state's drag grips on hover, and a touch screen has
/// no hover — that gesture was the one thing with no touch-native answer. Here
/// selection does the revealing: tap a state and its four grips appear on the
/// rim and stay there, so drawing an arrow is drag-a-grip-to-a-state with
/// nothing hidden behind a pointer the device does not have.
///
/// Everything else follows from that. Double tap the paper to place a state,
/// drag a state body to move it, tap a chip to edit its rule.
struct DiagramView: View {
    let machine: Machine
    let kind: MachineKind
    /// States lit by a trace, drawn filled.
    let active: Set<String>
    @Binding var selected: String?

    var onPlace: (CGPoint) -> Void
    var onMove: (String, CGPoint) -> Void
    var onConnect: (String, String) -> Void
    var onEditRule: (String) -> Void

    /// The live state of a drag off a grip, in canvas coordinates.
    @State private var dragFrom: String?
    @State private var dragPoint: CGPoint?
    /// Where a state is being dragged to, before it is committed on release.
    @State private var moving: String?
    @State private var movePoint: CGPoint?

    var body: some View {
        GeometryReader { geo in
            let frame = fitted(into: geo.size)

            ZStack(alignment: .topLeading) {
                Ink.ground
                DottedPaper()

                SwiftUI.Canvas { context, _ in
                    draw(in: &context, frame: frame)
                }
                .allowsHitTesting(false)

                ForEach(chips(frame), id: \.id) { chip in
                    ChipView(text: chip.text)
                        .position(chip.at)
                        .onTapGesture { onEditRule(chip.id) }
                }

                ForEach(machine.states, id: \.id) { state in
                    let at = place(state, frame)
                    StateView(
                        label: state.label,
                        isStart: machine.start == state.id,
                        isAccepting: machine.accepting.contains(state.id),
                        isSelected: selected == state.id,
                        isActive: active.contains(state.id)
                    )
                    .position(at)
                    .gesture(moveGesture(state, frame))
                    .onTapGesture {
                        selected = selected == state.id ? nil : state.id
                    }

                    if selected == state.id {
                        GripRing(at: at, onDrag: { point in
                            dragFrom = state.id
                            dragPoint = point
                        }, onDrop: { point in
                            // Landing back on the state it came from is a self
                            // loop, which is a rule like any other.
                            if let target = hit(point, frame) {
                                onConnect(state.id, target)
                            }
                            dragFrom = nil
                            dragPoint = nil
                        })
                    }
                }
            }
            .contentShape(Rectangle())
            .onTapGesture(count: 2, coordinateSpace: .local) { location in
                onPlace(unplace(location, frame))
            }
            .onTapGesture { selected = nil }
        }
    }

    // MARK: - drawing

    private func draw(in context: inout GraphicsContext, frame: Fit) {
        for edge in edges(frame) {
            context.stroke(edge.shape.path, with: .color(Ink.ink), lineWidth: 1.6)
            context.fill(
                Geo.arrowhead(tip: edge.shape.tip, direction: edge.shape.direction),
                with: .color(Ink.ink)
            )
        }

        // The arrow that says where the machine starts.
        if let start = machine.start, let s = machine.states.first(where: { $0.id == start }) {
            let at = place(s, frame)
            let from = CGPoint(x: at.x - Geo.stateRadius - 26, y: at.y)
            let to = CGPoint(x: at.x - Geo.stateRadius - Geo.arrowClearance, y: at.y)
            var path = Path()
            path.move(to: from)
            path.addLine(to: to)
            context.stroke(path, with: .color(Ink.ink), lineWidth: 1.6)
            context.fill(
                Geo.arrowhead(tip: to, direction: CGVector(dx: 1, dy: 0)),
                with: .color(Ink.ink)
            )
        }

        // The arrow being dragged off a grip, before it lands anywhere.
        if let from = dragFrom, let point = dragPoint,
           let s = machine.states.first(where: { $0.id == from }) {
            var path = Path()
            path.move(to: place(s, frame))
            path.addLine(to: point)
            context.stroke(
                path,
                with: .color(Ink.muted),
                style: StrokeStyle(lineWidth: 1.6, dash: [5, 5])
            )
        }
    }

    private struct DrawnEdge {
        var id: String
        var shape: EdgeShape
        var text: String
    }

    /// Every rule, as a curve. Rules that share a pair of states are bowed
    /// apart, and their chips stack, so nothing sits on top of anything else.
    private func edges(_ frame: Fit) -> [DrawnEdge] {
        var byPair: [String: [Transition]] = [:]
        for t in machine.transitions {
            byPair["\(t.from)\u{0}\(t.to)", default: []].append(t)
        }

        var drawn: [DrawnEdge] = []
        for (_, group) in byPair {
            guard let first = group.first,
                  let a = machine.states.first(where: { $0.id == first.from })
            else { continue }
            let pa = place(a, frame)

            if first.from == first.to {
                let shape = EdgeBuilder.loop(at: pa)
                for (i, t) in group.enumerated() {
                    var s = shape
                    s.chipAnchor.y -= CGFloat(i) * Geo.chipRowHeight
                    drawn.append(DrawnEdge(id: t.id, shape: s, text: Layout.chip(t, kind: kind)))
                }
                continue
            }

            guard let b = machine.states.first(where: { $0.id == first.to }) else { continue }
            let pb = place(b, frame)
            // A pair with an arrow coming back the other way needs a wider bow
            // so the two curves do not lie on each other.
            let mirrored = machine.transitions.contains { $0.from == first.to && $0.to == first.from }
            let base = mirrored ? Geo.bendParallel : Geo.bendDefault

            for (i, t) in group.enumerated() {
                let shape = EdgeBuilder.between(pa, pb, bend: base + CGFloat(i) * 18)
                drawn.append(DrawnEdge(id: t.id, shape: shape, text: Layout.chip(t, kind: kind)))
            }
        }
        return drawn
    }

    private struct Chip: Identifiable {
        var id: String
        var text: String
        var at: CGPoint
    }

    private func chips(_ frame: Fit) -> [Chip] {
        edges(frame).map { Chip(id: $0.id, text: $0.text, at: $0.shape.chipAnchor) }
    }

    // MARK: - gestures

    private func moveGesture(_ state: AutomatonState, _ frame: Fit) -> some Gesture {
        DragGesture(minimumDistance: 6)
            .onChanged { value in
                moving = state.id
                movePoint = value.location
            }
            .onEnded { value in
                onMove(state.id, unplace(value.location, frame))
                moving = nil
                movePoint = nil
            }
    }

    /// Which state, if any, is under `point`.
    private func hit(_ point: CGPoint, _ frame: Fit) -> String? {
        machine.states.first { s in
            let at = place(s, frame)
            let dx = at.x - point.x
            let dy = at.y - point.y
            return (dx * dx + dy * dy).squareRoot() <= Geo.hitRadius
        }?.id
    }

    // MARK: - fitting

    /// Scale and offset that frame the machine in the space available, the way
    /// the web build's fit does.
    struct Fit {
        var scale: CGFloat
        var dx: CGFloat
        var dy: CGFloat
    }

    private func fitted(into size: CGSize) -> Fit {
        guard !machine.states.isEmpty else {
            return Fit(scale: 1, dx: size.width / 2 - Canvas.width / 2, dy: size.height / 2 - Canvas.height / 2)
        }
        let pad = Geo.stateRadius * Geo.loopReach + 26
        let xs = machine.states.map { CGFloat($0.x) }
        let ys = machine.states.map { CGFloat($0.y) }
        let minX = (xs.min() ?? 0) - pad
        let maxX = (xs.max() ?? 0) + pad
        let minY = (ys.min() ?? 0) - pad
        let maxY = (ys.max() ?? 0) + pad
        let w = max(1, maxX - minX)
        let h = max(1, maxY - minY)
        // Never magnify: a two state machine at 3x looks like a mistake.
        let scale = min(1, min(size.width / w, size.height / h))
        return Fit(
            scale: scale,
            dx: size.width / 2 - (minX + maxX) / 2 * scale,
            dy: size.height / 2 - (minY + maxY) / 2 * scale
        )
    }

    private func place(_ s: AutomatonState, _ frame: Fit) -> CGPoint {
        if moving == s.id, let p = movePoint { return p }
        return CGPoint(x: CGFloat(s.x) * frame.scale + frame.dx, y: CGFloat(s.y) * frame.scale + frame.dy)
    }

    private func unplace(_ p: CGPoint, _ frame: Fit) -> CGPoint {
        CGPoint(x: (p.x - frame.dx) / frame.scale, y: (p.y - frame.dy) / frame.scale)
    }
}

/// The dot grid the machine is drawn on.
private struct DottedPaper: View {
    var body: some View {
        SwiftUI.Canvas { context, size in
            let step: CGFloat = 22
            var y: CGFloat = 0
            while y < size.height {
                var x: CGFloat = 0
                while x < size.width {
                    context.fill(
                        Path(ellipseIn: CGRect(x: x, y: y, width: 1.6, height: 1.6)),
                        with: .color(Ink.dot)
                    )
                    x += step
                }
                y += step
            }
        }
        .allowsHitTesting(false)
    }
}

/// One state: a hairline rim, a double rim when it accepts, filled while a
/// trace is standing in it.
private struct StateView: View {
    let label: String
    let isStart: Bool
    let isAccepting: Bool
    let isSelected: Bool
    let isActive: Bool

    var body: some View {
        ZStack {
            Circle()
                .fill(isActive ? Ink.ink : Ink.surface)
                .frame(width: Geo.stateRadius * 2, height: Geo.stateRadius * 2)
            Circle()
                .strokeBorder(Ink.ink, lineWidth: 1.6)
                .frame(width: Geo.stateRadius * 2, height: Geo.stateRadius * 2)
            if isAccepting {
                Circle()
                    .strokeBorder(isActive ? Ink.surface : Ink.ink, lineWidth: 1.6)
                    .frame(width: (Geo.stateRadius - 4.5) * 2, height: (Geo.stateRadius - 4.5) * 2)
            }
            if isSelected {
                Circle()
                    .strokeBorder(Ink.ink, lineWidth: 1)
                    .frame(width: (Geo.stateRadius + 7) * 2, height: (Geo.stateRadius + 7) * 2)
                    .opacity(0.35)
            }
            Text(label)
                .font(Face.mono(13))
                .foregroundStyle(isActive ? Ink.surface : Ink.ink)
        }
        .frame(width: Geo.hitRadius * 2, height: Geo.hitRadius * 2)
        .contentShape(Circle())
        .accessibilityLabel(
            "State \(label)"
                + (isStart ? ", start" : "")
                + (isAccepting ? ", accepting" : "")
        )
    }
}

/// The four grips a selected state wears. Dragging one draws an arrow — this
/// is the gesture hover used to own.
private struct GripRing: View {
    let at: CGPoint
    var onDrag: (CGPoint) -> Void
    var onDrop: (CGPoint) -> Void

    private let angles: [Double] = [0, 90, 180, 270]

    var body: some View {
        ForEach(angles, id: \.self) { angle in
            let radians = angle * .pi / 180
            let p = CGPoint(
                x: at.x + Geo.stateRadius * CGFloat(cos(radians)),
                y: at.y + Geo.stateRadius * CGFloat(sin(radians))
            )
            Circle()
                .fill(Ink.surface)
                .overlay { Circle().strokeBorder(Ink.ink, lineWidth: 1.4) }
                .frame(width: 13, height: 13)
                .frame(width: tapTarget, height: tapTarget)
                .contentShape(Circle())
                .position(p)
                .gesture(
                    DragGesture(minimumDistance: 2)
                        .onChanged { onDrag($0.location) }
                        .onEnded { onDrop($0.location) }
                )
                .accessibilityLabel("Drag to another state to draw an arrow")
        }
    }
}

/// A rule, written on its arrow.
private struct ChipView: View {
    let text: String

    var body: some View {
        Text(text)
            .font(Face.mono(11))
            .foregroundStyle(Ink.ink)
            .padding(.horizontal, Geo.chipPadX)
            .padding(.vertical, 3)
            .background(
                RoundedRectangle(cornerRadius: Radius.chip)
                    .fill(Ink.surface)
                    .overlay {
                        RoundedRectangle(cornerRadius: Radius.chip)
                            .strokeBorder(Ink.hairline, lineWidth: 1)
                    }
            )
            .contentShape(Rectangle())
    }
}
