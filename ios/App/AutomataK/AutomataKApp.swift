import SwiftUI

/// automata-k.
///
/// The engine sources under ios/Sources/AutomataEngine are compiled straight
/// into this target rather than linked as a package, so there is no import and
/// no package resolution step: open the project and build. `swift test` in
/// ios/ still runs the same sources against the golden fixture.
@main
struct AutomataKApp: App {
    @State private var store = Store(levels: GoldenStore.load())

    var body: some Scene {
        WindowGroup {
            LevelListView()
                .environment(store)
                .tint(Ink.ink)
        }
    }
}

/// The fixture, read once at launch from the app bundle.
///
/// It is the single source of truth for level content: the languages arrive as
/// bitmaps generated from the proven TypeScript engine, so nothing here can
/// drift from what the web app grades against.
enum GoldenStore {
    static func load() -> [GoldenLevel] {
        guard let url = Bundle.main.url(forResource: "golden", withExtension: "json") else {
            assertionFailure("golden.json is missing from the app bundle")
            return []
        }
        do {
            let file = try GoldenFile.load(contentsOf: url)
            return file.levels.sorted { $0.index < $1.index }
        } catch {
            assertionFailure("golden.json could not be read: \(error)")
            return []
        }
    }
}
