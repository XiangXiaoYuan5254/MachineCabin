// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "MachineCabin",
    platforms: [.macOS(.v13)],
    products: [
        .executable(name: "MachineCabin", targets: ["MachineCabin"]),
    ],
    targets: [
        .executableTarget(
            name: "MachineCabin",
            path: "Sources/MachineCabin"
        ),
    ]
)
