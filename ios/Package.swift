// swift-tools-version: 5.9
import PackageDescription

// The engine is a plain library with no UI dependency, exactly as the
// TypeScript one is. The app target in the Xcode project depends on it, and so
// does the test target that holds it to the golden fixture.
let package = Package(
    name: "AutomataEngine",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [
        .library(name: "AutomataEngine", targets: ["AutomataEngine"])
    ],
    targets: [
        .target(name: "AutomataEngine"),
        .testTarget(
            name: "AutomataEngineTests",
            dependencies: ["AutomataEngine"],
            resources: [.copy("Fixtures/golden.json")]
        )
    ]
)
