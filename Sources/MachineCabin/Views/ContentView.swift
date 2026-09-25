import SwiftUI

struct ContentView: View {
    @ObservedObject var server: ConsoleServer
    @State private var webError: String?

    var body: some View {
        ZStack {
            switch server.phase {
            case .ready:
                ConsoleWebView(url: server.consoleURL, loadError: $webError)
                    .overlay(alignment: .top) {
                        if let webError {
                            errorBanner(webError)
                        }
                    }

            case .idle, .connecting:
                VStack(spacing: 14) {
                    ProgressView()
                        .controlSize(.large)
                    Text("正在准备服务控制台…")
                        .font(.headline)
                    Text("首次启动可能需要几秒钟。")
                        .font(.callout)
                        .foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(.background)

            case .failed(let message):
                VStack(spacing: 16) {
                    Image(systemName: "exclamationmark.triangle")
                        .font(.system(size: 34))
                        .foregroundStyle(.orange)
                    Text("控制台未能启动")
                        .font(.title2.weight(.semibold))
                    Text(message)
                        .font(.callout)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                        .frame(maxWidth: 520)
                    Button("重试") {
                        server.restart()
                    }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.large)
                }
                .padding(40)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(.background)
            }
        }
        .frame(minWidth: 1100, minHeight: 720)
        .task {
            server.start()
        }
    }

    @ViewBuilder
    private func errorBanner(_ message: String) -> some View {
        HStack(spacing: 10) {
            Image(systemName: "wifi.exclamationmark")
            Text(message)
                .lineLimit(2)
            Spacer()
            Button("重新连接") {
                webError = nil
                server.restart()
            }
        }
        .font(.callout)
        .padding(.horizontal, 14)
        .frame(minHeight: 42)
        .background(.regularMaterial)
        .overlay(alignment: .bottom) { Divider() }
    }
}
