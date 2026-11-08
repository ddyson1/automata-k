import SwiftUI
import UIKit

/// The palette and the type roles, lifted from web/src/theme.css so the two
/// apps are the same app. Achromatic by decision: colour appears only to carry
/// a verdict.
///
/// Every token is a dynamic colour, so light and dark are one declaration
/// rather than two code paths.
enum Ink {
    private static func dynamic(_ light: UInt32, _ dark: UInt32) -> Color {
        Color(UIColor { traits in
            traits.userInterfaceStyle == .dark ? UIColor(rgb: dark) : UIColor(rgb: light)
        })
    }

    static let ground = dynamic(0xf7f7f5, 0x141518)
    static let surface = dynamic(0xffffff, 0x1a1c1f)
    static let sunken = dynamic(0xf1f1ee, 0x17181b)
    static let ink = dynamic(0x14161a, 0xeceae5)
    static let inkSoft = dynamic(0x34383e, 0xc9c7c2)
    static let muted = dynamic(0x6b6f76, 0x92959b)
    static let faint = dynamic(0x9a9ea4, 0x6a6d73)
    static let hairline = dynamic(0xe4e4e0, 0x2b2d31)
    static let rule = dynamic(0xc8c8c2, 0x43464b)
    static let accent = dynamic(0x14161a, 0xeceae5)
    static let accentInk = dynamic(0xffffff, 0x141518)
    static let accentTint = dynamic(0xebebe7, 0x26282c)
    static let pass = dynamic(0x1f6f43, 0x7fb595)
    static let passTint = dynamic(0xeef4f0, 0x1a241e)
    static let fail = dynamic(0xa32d18, 0xdd9276)
    static let dot = dynamic(0xe3e3df, 0x26282c)
}

extension UIColor {
    convenience init(rgb: UInt32) {
        self.init(
            red: Double((rgb >> 16) & 0xff) / 255,
            green: Double((rgb >> 8) & 0xff) / 255,
            blue: Double(rgb & 0xff) / 255,
            alpha: 1
        )
    }
}

/// Three faces, three jobs. If a thing is formal it is monospaced — that rule
/// is how the app says "this is mathematics" without saying so.
///
/// The web build ships subset Literata, Inter and JetBrains Mono. Here the
/// system's own serif, sans and monospace stand in for them, so the app
/// carries no font files and every size still answers to Dynamic Type.
enum Face {
    static func mono(_ size: CGFloat, _ weight: Font.Weight = .regular) -> Font {
        .system(size: size, weight: weight, design: .monospaced)
    }

    static func serif(_ size: CGFloat, _ weight: Font.Weight = .regular) -> Font {
        .system(size: size, weight: weight, design: .serif)
    }

    static func sans(_ size: CGFloat, _ weight: Font.Weight = .regular) -> Font {
        .system(size: size, weight: weight)
    }
}

enum Radius {
    static let chip: CGFloat = 5
    static let control: CGFloat = 8
    static let sheet: CGFloat = 16
}

/// Nothing a finger has to hit is smaller than this.
let tapTarget: CGFloat = 44

/// A small uppercase label, in the mono face, as everywhere else in the app.
struct LabelCaps: View {
    let text: String

    var body: some View {
        Text(text.uppercased())
            .font(Face.mono(10, .medium))
            .tracking(1.0)
            .foregroundStyle(Ink.faint)
    }
}
