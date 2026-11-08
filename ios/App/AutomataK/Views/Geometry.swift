import CoreGraphics
import Foundation
import SwiftUI

/// Where the arrows go. The constants are the web build's, from
/// src/ui/geometry.ts, so a machine reads the same on both.
enum Geo {
    static let stateRadius: CGFloat = 28
    static let hitRadius: CGFloat = 36
    static let arrowClearance: CGFloat = 3
    static let arrowLength: CGFloat = 11
    static let arrowHalfWidth: CGFloat = 5.2
    static let bendDefault: CGFloat = 11
    static let bendParallel: CGFloat = 34

    /// A self loop's centre and radius, in state radii.
    static let loopCentre: CGFloat = 1.14
    static let loopRadius: CGFloat = 0.68
    /// How far a self loop reaches from the centre of its own state.
    static var loopReach: CGFloat { loopCentre + loopRadius }

    static let chipRowHeight: CGFloat = 24
    static let chipCharWidth: CGFloat = 7.2
    static let chipPadX: CGFloat = 6
    static let chipGap: CGFloat = 10
    static let chipGapLoop: CGFloat = 4

    /// The control point of the curve from `a` to `b`, bowed by `bend`.
    static func control(_ a: CGPoint, _ b: CGPoint, bend: CGFloat) -> CGPoint {
        let mx = (a.x + b.x) / 2
        let my = (a.y + b.y) / 2
        let dx = b.x - a.x
        let dy = b.y - a.y
        let len = max(1, (dx * dx + dy * dy).squareRoot())
        // Perpendicular to the line, so the bow opens to one side.
        return CGPoint(x: mx - dy / len * bend, y: my + dx / len * bend)
    }

    /// A point on the quadratic from `a` to `b` through `c`, at `t` in 0...1.
    static func onCurve(_ a: CGPoint, _ c: CGPoint, _ b: CGPoint, _ t: CGFloat) -> CGPoint {
        let u = 1 - t
        return CGPoint(
            x: u * u * a.x + 2 * u * t * c.x + t * t * b.x,
            y: u * u * a.y + 2 * u * t * c.y + t * t * b.y
        )
    }

    /// The tangent direction at `t`, for pointing an arrowhead.
    static func tangent(_ a: CGPoint, _ c: CGPoint, _ b: CGPoint, _ t: CGFloat) -> CGVector {
        let u = 1 - t
        return CGVector(
            dx: 2 * u * (c.x - a.x) + 2 * t * (b.x - c.x),
            dy: 2 * u * (c.y - a.y) + 2 * t * (b.y - c.y)
        )
    }

    /// Move `p` towards `towards` by `distance`.
    static func step(_ p: CGPoint, towards: CGPoint, distance: CGFloat) -> CGPoint {
        let dx = towards.x - p.x
        let dy = towards.y - p.y
        let len = max(0.0001, (dx * dx + dy * dy).squareRoot())
        return CGPoint(x: p.x + dx / len * distance, y: p.y + dy / len * distance)
    }

    /// A filled triangle at `tip`, pointing along `direction`.
    static func arrowhead(tip: CGPoint, direction: CGVector) -> Path {
        let len = max(0.0001, (direction.dx * direction.dx + direction.dy * direction.dy).squareRoot())
        let ux = direction.dx / len
        let uy = direction.dy / len
        let backX = tip.x - ux * arrowLength
        let backY = tip.y - uy * arrowLength
        var path = Path()
        path.move(to: tip)
        path.addLine(to: CGPoint(x: backX - uy * arrowHalfWidth, y: backY + ux * arrowHalfWidth))
        path.addLine(to: CGPoint(x: backX + uy * arrowHalfWidth, y: backY - ux * arrowHalfWidth))
        path.closeSubpath()
        return path
    }

    /// The width a chip needs for `text`.
    static func chipWidth(_ text: String) -> CGFloat {
        CGFloat(text.count) * chipCharWidth + chipPadX * 2
    }
}

/// One drawn edge: the curve, where its arrowhead sits, and where its chip
/// wants to be.
struct EdgeShape {
    var path: Path
    var tip: CGPoint
    var direction: CGVector
    var chipAnchor: CGPoint
}

enum EdgeBuilder {

    /// The curve between two different states, trimmed to their rims.
    static func between(_ a: CGPoint, _ b: CGPoint, bend: CGFloat) -> EdgeShape {
        let control = Geo.control(a, b, bend: bend)
        let from = Geo.step(a, towards: control, distance: Geo.stateRadius)
        let toward = Geo.step(b, towards: control, distance: Geo.stateRadius + Geo.arrowClearance)

        var path = Path()
        path.move(to: from)
        path.addQuadCurve(to: toward, control: control)

        let direction = Geo.tangent(from, control, toward, 1)
        let mid = Geo.onCurve(from, control, toward, 0.5)
        // The chip sits off the outside of the bow so it never lies on the line.
        let dx = toward.x - from.x
        let dy = toward.y - from.y
        let len = max(1, (dx * dx + dy * dy).squareRoot())
        let anchor = CGPoint(
            x: mid.x - dy / len * Geo.chipGap,
            y: mid.y + dx / len * Geo.chipGap
        )
        return EdgeShape(path: path, tip: toward, direction: direction, chipAnchor: anchor)
    }

    /// A self loop, drawn above the state so it never crosses the row.
    static func loop(at p: CGPoint) -> EdgeShape {
        let r = Geo.stateRadius
        let centre = CGPoint(x: p.x, y: p.y - r * Geo.loopCentre)
        let radius = r * Geo.loopRadius

        var path = Path()
        path.addArc(
            center: centre,
            radius: radius,
            startAngle: .degrees(150),
            endAngle: .degrees(30),
            clockwise: false
        )

        let tip = CGPoint(
            x: centre.x + radius * CGFloat(cos(Double.pi / 6)),
            y: centre.y + radius * CGFloat(sin(Double.pi / 6))
        )
        return EdgeShape(
            path: path,
            tip: tip,
            direction: CGVector(dx: 0.35, dy: 1),
            chipAnchor: CGPoint(x: centre.x, y: centre.y - radius - Geo.chipGapLoop - 9)
        )
    }
}
