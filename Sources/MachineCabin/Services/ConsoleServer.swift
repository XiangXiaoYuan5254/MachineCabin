import Combine
import Foundation

@MainActor
final class ConsoleServer: ObservableObject {
    enum Phase: Equatable {
        case idle
        case connecting
        case ready
        case failed(String)
    }

    static let shared = ConsoleServer()

    let consoleURL = URL(string: "http://127.0.0.1:49152/")!

    @Published private(set) var phase: Phase = .idle

    private var serverProcess: Process?
    private var logHandle: FileHandle?
    private var ownsServerProcess = false
    private var startupTask: Task<Void, Never>?

    private init() {}

    func start() {
        guard phase == .idle || isFailed else { return }
        startupTask?.cancel()
        phase = .connecting

        startupTask = Task { [weak self] in
            guard let self else { return }
            if await self.serverResponds() {
                self.phase = .ready
                return
            }

            do {
                try self.launchBundledServer()
            } catch {
                self.phase = .failed(error.localizedDescription)
                return
            }

            for _ in 0..<60 {
                if Task.isCancelled { return }
                if await self.serverResponds() {
                    self.phase = .ready
                    return
                }
                try? await Task.sleep(for: .milliseconds(200))
            }
            self.phase = .failed("服务端在 12 秒内没有响应。可在“应用支持/机舱/console-server.log”查看日志。")
        }
    }

    func restart() {
        stop()
        start()
    }

    func stop() {
        startupTask?.cancel()
        startupTask = nil
        if ownsServerProcess, let serverProcess, serverProcess.isRunning {
            serverProcess.terminate()
        }
        self.serverProcess = nil
        ownsServerProcess = false
        try? logHandle?.close()
        logHandle = nil
        phase = .idle
    }

    private var isFailed: Bool {
        if case .failed = phase { return true }
        return false
    }

    private func serverResponds() async -> Bool {
        var request = URLRequest(url: consoleURL.appending(path: "api/meta"))
        request.timeoutInterval = 1.2
        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let httpResponse = response as? HTTPURLResponse,
                  httpResponse.statusCode == 200 else { return false }
            return String(decoding: data, as: UTF8.self).contains("dataFile")
        } catch {
            return false
        }
    }

    private func launchBundledServer() throws {
        let fileManager = FileManager.default
        guard let resourcesURL = Bundle.main.resourceURL else {
            throw ServerError("找不到 App 资源目录。")
        }
        let webRoot = resourcesURL.appending(path: "web", directoryHint: .isDirectory)
        let serverEntry = webRoot.appending(path: "server/index.js")
        guard fileManager.fileExists(atPath: serverEntry.path) else {
            throw ServerError("App 内缺少服务端文件，请重新安装机舱。")
        }

        let nodeURL = try resolveNodeExecutable(resourcesURL: resourcesURL)
        let supportURL = try applicationSupportDirectory()
        try seedConfigurationIfNeeded(resourcesURL: resourcesURL, supportURL: supportURL)

        let logURL = supportURL.appending(path: "console-server.log")
        if !fileManager.fileExists(atPath: logURL.path) {
            fileManager.createFile(atPath: logURL.path, contents: nil)
        }
        let outputHandle = try FileHandle(forWritingTo: logURL)
        try outputHandle.seekToEnd()

        let process = Process()
        process.executableURL = nodeURL
        process.arguments = [serverEntry.path]
        process.currentDirectoryURL = webRoot
        process.standardOutput = outputHandle
        process.standardError = outputHandle

        var environment = ProcessInfo.processInfo.environment
        environment["VBCODING_DATA_DIR"] = supportURL.path
        environment["CONSOLE_HOST"] = "127.0.0.1"
        environment["CONSOLE_PORT"] = "49152"
        environment["PATH"] = [
            "/opt/homebrew/bin",
            "/usr/local/bin",
            "/usr/bin",
            "/bin",
            "/usr/sbin",
            "/sbin",
        ].joined(separator: ":")
        process.environment = environment
        process.terminationHandler = { [weak self] terminatedProcess in
            Task { @MainActor in
                guard let self, self.ownsServerProcess else { return }
                self.ownsServerProcess = false
                self.serverProcess = nil
                if self.phase == .ready {
                    self.phase = .failed("服务端已退出（状态码 \(terminatedProcess.terminationStatus)）。")
                }
            }
        }

        try process.run()
        serverProcess = process
        logHandle = outputHandle
        ownsServerProcess = true
    }

    private func resolveNodeExecutable(resourcesURL: URL) throws -> URL {
        let candidates = [
            resourcesURL.appending(path: "node/bin/node"),
            URL(fileURLWithPath: "/opt/homebrew/bin/node"),
            URL(fileURLWithPath: "/usr/local/bin/node"),
            URL(fileURLWithPath: "/usr/bin/node"),
        ]
        if let match = candidates.first(where: { FileManager.default.isExecutableFile(atPath: $0.path) }) {
            return match
        }
        throw ServerError("没有找到 Node.js。请先安装 Node.js，再重新打开机舱。")
    }

    private func applicationSupportDirectory() throws -> URL {
        let baseURL = try FileManager.default.url(
            for: .applicationSupportDirectory,
            in: .userDomainMask,
            appropriateFor: nil,
            create: true
        )
        let supportURL = baseURL.appending(path: "机舱", directoryHint: .isDirectory)
        try FileManager.default.createDirectory(at: supportURL, withIntermediateDirectories: true)
        return supportURL
    }

    private func seedConfigurationIfNeeded(resourcesURL: URL, supportURL: URL) throws {
        let destination = supportURL.appending(path: "services.json")
        guard !FileManager.default.fileExists(atPath: destination.path) else { return }
        let seed = resourcesURL.appending(path: "default-data/services.json")
        if FileManager.default.fileExists(atPath: seed.path) {
            try FileManager.default.copyItem(at: seed, to: destination)
        }
    }
}

private struct ServerError: LocalizedError {
    let message: String

    init(_ message: String) {
        self.message = message
    }

    var errorDescription: String? { message }
}
