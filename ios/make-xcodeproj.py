#!/usr/bin/env python3
"""
Generate App/AutomataK.xcodeproj/project.pbxproj.

Hand-written pbxproj rots the moment a file is added, so it is generated from
the file list instead. Object identifiers are derived from each path, so
re-running this produces a byte-identical project and a diff shows only what
actually changed.

The engine sources are compiled straight into the app target rather than linked
as a package: no resolution step, no import, and `swift test` in ios/ still
runs the same files against the golden fixture.
"""
import hashlib
import os
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent
PROJECT = ROOT / "App" / "AutomataK.xcodeproj"

APP_SOURCES = [
    "AutomataKApp.swift",
    "Theme.swift",
    "Store.swift",
    "Views/Geometry.swift",
    "Views/DiagramView.swift",
    "Views/LevelListView.swift",
    "Views/LevelView.swift",
    "Views/PaneView.swift",
    "Views/RuleEditorView.swift",
    "Views/TraceView.swift",
]

ENGINE_SOURCES = [
    "Types.swift",
    "Validate.swift",
    "Simulate.swift",
    "Grammar.swift",
    "Golden.swift",
    "Layout.swift",
]

# One golden.json in the repository, bundled from where the tests already keep it.
RESOURCES = [("golden.json", "../Tests/AutomataEngineTests/Fixtures/golden.json")]


def oid(*parts: str) -> str:
    """A stable 24 hex character object id, derived from what it identifies."""
    return hashlib.sha1("::".join(parts).encode()).hexdigest()[:24].upper()


def main() -> None:
    file_refs: list[str] = []
    build_files: list[str] = []
    source_phase: list[str] = []
    resource_phase: list[str] = []
    app_group: list[str] = []
    views_group: list[str] = []
    engine_group: list[str] = []

    def add(path: str, name: str, group: list[str], phase: list[str], kind: str) -> None:
        ref = oid("ref", path)
        build = oid("build", path)
        file_type = "sourcecode.swift" if kind == "source" else "text.json"
        file_refs.append(
            f'\t\t{ref} /* {name} */ = {{isa = PBXFileReference; lastKnownFileType = {file_type}; '
            f'name = "{name}"; path = "{path}"; sourceTree = "<group>"; }};'
        )
        build_files.append(
            f"\t\t{build} /* {name} in {'Sources' if kind == 'source' else 'Resources'} */ = "
            f"{{isa = PBXBuildFile; fileRef = {ref} /* {name} */; }};"
        )
        phase.append(f"\t\t\t\t{build} /* {name} in {'Sources' if kind == 'source' else 'Resources'} */,")
        group.append(f"\t\t\t\t{ref} /* {name} */,")

    for rel in APP_SOURCES:
        name = os.path.basename(rel)
        group = views_group if rel.startswith("Views/") else app_group
        add(f"AutomataK/{rel}", name, group, source_phase, "source")

    for rel in ENGINE_SOURCES:
        add(f"../Sources/AutomataEngine/{rel}", rel, engine_group, source_phase, "source")

    for name, rel in RESOURCES:
        add(rel, name, app_group, resource_phase, "resource")

    ids = {k: oid(k) for k in (
        "project", "target", "product", "mainGroup", "productsGroup", "appGroup",
        "viewsGroup", "engineGroup", "sourcesPhase", "resourcesPhase", "frameworksPhase",
        "configList", "projectConfigList", "debug", "release", "projectDebug", "projectRelease",
    )}

    common = """				CODE_SIGN_STYLE = Automatic;
				CURRENT_PROJECT_VERSION = 1;
				DEVELOPMENT_TEAM = "";
				ENABLE_PREVIEWS = YES;
				GENERATE_INFOPLIST_FILE = YES;
				INFOPLIST_KEY_CFBundleDisplayName = "automata-k";
				INFOPLIST_KEY_UIApplicationSceneManifest_Generation = YES;
				INFOPLIST_KEY_UILaunchScreen_Generation = YES;
				INFOPLIST_KEY_UISupportedInterfaceOrientations = "UIInterfaceOrientationPortrait UIInterfaceOrientationLandscapeLeft UIInterfaceOrientationLandscapeRight";
				IPHONEOS_DEPLOYMENT_TARGET = 17.0;
				MARKETING_VERSION = 1.0;
				PRODUCT_BUNDLE_IDENTIFIER = "org.automata-k.AutomataK";
				PRODUCT_NAME = "$(TARGET_NAME)";
				SWIFT_EMIT_LOC_STRINGS = YES;
				SWIFT_VERSION = 5.0;
				TARGETED_DEVICE_FAMILY = "1,2";"""

    project_common = """				ALWAYS_SEARCH_USER_PATHS = NO;
				CLANG_ENABLE_OBJC_WEAK = YES;
				ENABLE_STRICT_OBJC_MSGSEND = YES;
				GCC_NO_COMMON_BLOCKS = YES;
				SDKROOT = iphoneos;
				SWIFT_STRICT_CONCURRENCY = minimal;"""

    text = f"""// !$*UTF8*$!
{{
	archiveVersion = 1;
	classes = {{
	}};
	objectVersion = 56;
	objects = {{

/* Begin PBXBuildFile section */
{chr(10).join(build_files)}
/* End PBXBuildFile section */

/* Begin PBXFileReference section */
{chr(10).join(file_refs)}
		{ids['product']} /* automata-k.app */ = {{isa = PBXFileReference; explicitFileType = "wrapper.application"; includeInIndex = 0; path = "automata-k.app"; sourceTree = BUILT_PRODUCTS_DIR; }};
/* End PBXFileReference section */

/* Begin PBXFrameworksBuildPhase section */
		{ids['frameworksPhase']} /* Frameworks */ = {{
			isa = PBXFrameworksBuildPhase;
			buildActionMask = 2147483647;
			files = (
			);
			runOnlyForDeploymentPostprocessing = 0;
		}};
/* End PBXFrameworksBuildPhase section */

/* Begin PBXGroup section */
		{ids['mainGroup']} = {{
			isa = PBXGroup;
			children = (
				{ids['appGroup']} /* AutomataK */,
				{ids['engineGroup']} /* AutomataEngine */,
				{ids['productsGroup']} /* Products */,
			);
			sourceTree = "<group>";
		}};
		{ids['productsGroup']} /* Products */ = {{
			isa = PBXGroup;
			children = (
				{ids['product']} /* automata-k.app */,
			);
			name = Products;
			sourceTree = "<group>";
		}};
		{ids['appGroup']} /* AutomataK */ = {{
			isa = PBXGroup;
			children = (
{chr(10).join(app_group)}
				{ids['viewsGroup']} /* Views */,
			);
			name = AutomataK;
			sourceTree = "<group>";
		}};
		{ids['viewsGroup']} /* Views */ = {{
			isa = PBXGroup;
			children = (
{chr(10).join(views_group)}
			);
			name = Views;
			sourceTree = "<group>";
		}};
		{ids['engineGroup']} /* AutomataEngine */ = {{
			isa = PBXGroup;
			children = (
{chr(10).join(engine_group)}
			);
			name = AutomataEngine;
			sourceTree = "<group>";
		}};
/* End PBXGroup section */

/* Begin PBXNativeTarget section */
		{ids['target']} /* automata-k */ = {{
			isa = PBXNativeTarget;
			buildConfigurationList = {ids['configList']} /* Build configuration list for PBXNativeTarget "automata-k" */;
			buildPhases = (
				{ids['sourcesPhase']} /* Sources */,
				{ids['frameworksPhase']} /* Frameworks */,
				{ids['resourcesPhase']} /* Resources */,
			);
			buildRules = (
			);
			dependencies = (
			);
			name = "automata-k";
			productName = AutomataK;
			productReference = {ids['product']} /* automata-k.app */;
			productType = "com.apple.product-type.application";
		}};
/* End PBXNativeTarget section */

/* Begin PBXProject section */
		{ids['project']} /* Project object */ = {{
			isa = PBXProject;
			attributes = {{
				BuildIndependentTargetsInParallel = 1;
				LastSwiftUpdateCheck = 1520;
				LastUpgradeCheck = 1520;
				TargetAttributes = {{
					{ids['target']} = {{
						CreatedOnToolsVersion = 15.2;
					}};
				}};
			}};
			buildConfigurationList = {ids['projectConfigList']} /* Build configuration list for PBXProject "AutomataK" */;
			compatibilityVersion = "Xcode 14.0";
			developmentRegion = en;
			hasScannedForEncodings = 0;
			knownRegions = (
				en,
				Base,
			);
			mainGroup = {ids['mainGroup']};
			productRefGroup = {ids['productsGroup']} /* Products */;
			projectDirPath = "";
			projectRoot = "";
			targets = (
				{ids['target']} /* automata-k */,
			);
		}};
/* End PBXProject section */

/* Begin PBXResourcesBuildPhase section */
		{ids['resourcesPhase']} /* Resources */ = {{
			isa = PBXResourcesBuildPhase;
			buildActionMask = 2147483647;
			files = (
{chr(10).join(resource_phase)}
			);
			runOnlyForDeploymentPostprocessing = 0;
		}};
/* End PBXResourcesBuildPhase section */

/* Begin PBXSourcesBuildPhase section */
		{ids['sourcesPhase']} /* Sources */ = {{
			isa = PBXSourcesBuildPhase;
			buildActionMask = 2147483647;
			files = (
{chr(10).join(source_phase)}
			);
			runOnlyForDeploymentPostprocessing = 0;
		}};
/* End PBXSourcesBuildPhase section */

/* Begin XCBuildConfiguration section */
		{ids['projectDebug']} /* Debug */ = {{
			isa = XCBuildConfiguration;
			buildSettings = {{
{project_common}
				ONLY_ACTIVE_ARCH = YES;
				SWIFT_OPTIMIZATION_LEVEL = "-Onone";
			}};
			name = Debug;
		}};
		{ids['projectRelease']} /* Release */ = {{
			isa = XCBuildConfiguration;
			buildSettings = {{
{project_common}
				SWIFT_COMPILATION_MODE = wholemodule;
			}};
			name = Release;
		}};
		{ids['debug']} /* Debug */ = {{
			isa = XCBuildConfiguration;
			buildSettings = {{
{common}
			}};
			name = Debug;
		}};
		{ids['release']} /* Release */ = {{
			isa = XCBuildConfiguration;
			buildSettings = {{
{common}
			}};
			name = Release;
		}};
/* End XCBuildConfiguration section */

/* Begin XCConfigurationList section */
		{ids['projectConfigList']} /* Build configuration list for PBXProject "AutomataK" */ = {{
			isa = XCConfigurationList;
			buildConfigurations = (
				{ids['projectDebug']} /* Debug */,
				{ids['projectRelease']} /* Release */,
			);
			defaultConfigurationIsVisible = 0;
			defaultConfigurationName = Release;
		}};
		{ids['configList']} /* Build configuration list for PBXNativeTarget "automata-k" */ = {{
			isa = XCConfigurationList;
			buildConfigurations = (
				{ids['debug']} /* Debug */,
				{ids['release']} /* Release */,
			);
			defaultConfigurationIsVisible = 0;
			defaultConfigurationName = Release;
		}};
/* End XCConfigurationList section */
	}};
	rootObject = {ids['project']} /* Project object */;
}}
"""

    PROJECT.mkdir(parents=True, exist_ok=True)
    (PROJECT / "project.pbxproj").write_text(text)
    print(f"wrote {PROJECT / 'project.pbxproj'}")
    print(f"  {len(APP_SOURCES)} app sources, {len(ENGINE_SOURCES)} engine sources, {len(RESOURCES)} resource")


if __name__ == "__main__":
    main()
