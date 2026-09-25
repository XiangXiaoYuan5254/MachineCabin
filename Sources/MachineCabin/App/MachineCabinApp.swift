import AppKit
import SwiftUI

@main
struct MachineCabinApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @StateObject private var consoleServer = ConsoleServer.shared

    var body: some Scene {
        WindowGroup("机舱", id: "main") {
            ContentView(server: consoleServer)
        }
        .defaultSize(width: 1480, height: 920)
        .windowResizability(.contentMinSize)
        .commands {
            CommandGroup(replacing: .newItem) {}

            CommandMenu("服务控制台") {
                Button("重新连接") {
                    consoleServer.restart()
                }
                .keyboardShortcut("r", modifiers: [.command, .shift])

                Button("在默认浏览器中打开") {
                    NSWorkspace.shared.open(consoleServer.consoleURL)
                }
                .keyboardShortcut("o", modifiers: [.command, .shift])
            }
        }
    }
}

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.regular)
        NSApp.activate(ignoringOtherApps: true)
    }

    func applicationWillTerminate(_ notification: Notification) {
        ConsoleServer.shared.stop()
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        true
    }
}
