import AppKit
import SwiftUI
import WebKit

struct ConsoleWebView: NSViewRepresentable {
    let url: URL
    @Binding var loadError: String?

    // 和 Windows 版 desktop/preload.cjs 暴露同样的 window.machineCabin 接口，页面不用区分外壳。
    private static let bridgeScript = """
    window.machineCabin = {
      chooseDirectories: () => window.webkit.messageHandlers.machineCabin.postMessage({ action: 'chooseDirectories' }),
    };
    """

    func makeCoordinator() -> Coordinator {
        Coordinator(loadError: $loadError)
    }

    func makeNSView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.preferences.isElementFullscreenEnabled = true
        configuration.userContentController.addUserScript(
            WKUserScript(source: Self.bridgeScript, injectionTime: .atDocumentStart, forMainFrameOnly: true)
        )
        configuration.userContentController.addScriptMessageHandler(
            context.coordinator,
            contentWorld: .page,
            name: "machineCabin"
        )

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = context.coordinator
        webView.uiDelegate = context.coordinator
        webView.allowsMagnification = true
        webView.setValue(false, forKey: "drawsBackground")
        webView.load(URLRequest(url: url))
        return webView
    }

    func updateNSView(_ webView: WKWebView, context: Context) {
        guard webView.url == nil else { return }
        webView.load(URLRequest(url: url))
    }

    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandlerWithReply {
        @Binding private var loadError: String?

        init(loadError: Binding<String?>) {
            _loadError = loadError
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            loadError = nil
        }

        func webView(
            _ webView: WKWebView,
            didFail navigation: WKNavigation!,
            withError error: Error
        ) {
            loadError = error.localizedDescription
        }

        func webView(
            _ webView: WKWebView,
            didFailProvisionalNavigation navigation: WKNavigation!,
            withError error: Error
        ) {
            loadError = error.localizedDescription
        }

        func webView(
            _ webView: WKWebView,
            createWebViewWith configuration: WKWebViewConfiguration,
            for navigationAction: WKNavigationAction,
            windowFeatures: WKWindowFeatures
        ) -> WKWebView? {
            if navigationAction.targetFrame == nil, let destination = navigationAction.request.url {
                NSWorkspace.shared.open(destination)
            }
            return nil
        }

        func userContentController(
            _ userContentController: WKUserContentController,
            didReceive message: WKScriptMessage
        ) async -> (Any?, String?) {
            guard message.frameInfo.isMainFrame,
                  (message.body as? [String: Any])?["action"] as? String == "chooseDirectories",
                  let window = message.webView?.window
            else {
                return (nil, "不支持的操作。")
            }

            let panel = NSOpenPanel()
            panel.canChooseFiles = false
            panel.canChooseDirectories = true
            panel.canCreateDirectories = true
            panel.allowsMultipleSelection = true
            panel.prompt = "添加"
            panel.message = "可以按住 ⌘ 选择多个文件夹。"
            let response = await panel.beginSheetModal(for: window)
            return (response == .OK ? panel.urls.map(\.path) : [], nil)
        }
    }
}
