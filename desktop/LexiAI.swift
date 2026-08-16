// LexiAI — a native window onto the local bilingual LexiAI build (http://localhost:5181).
// Owns its Dock icon (unlike the previous Chrome --app wrapper) and nudges the
// launchd service awake if the server is down.

import Cocoa
import WebKit

final class AppDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate, WKUIDelegate {
  let url = URL(string: "http://localhost:5181")!
  var window: NSWindow!
  var webView: WKWebView!
  var retries = 0

  func applicationDidFinishLaunching(_ note: Notification) {
    kickServer()
    // WebKit reads this at first use; without it the page's spellcheck="true"
    // attribute is ignored and no red squiggles ever appear.
    UserDefaults.standard.register(defaults: ["WebContinuousSpellCheckingEnabled": true])
    let web = WKWebView(frame: .zero)
    web.navigationDelegate = self
    web.uiDelegate = self
    webView = web

    let win = NSWindow(
      contentRect: NSRect(x: 0, y: 0, width: 1320, height: 880),
      styleMask: [.titled, .closable, .miniaturizable, .resizable],
      backing: .buffered, defer: false)
    win.title = "LexiAI"
    win.minSize = NSSize(width: 700, height: 500)
    win.contentView = web
    win.center()
    win.setFrameAutosaveName("LexiAIMain")
    win.makeKeyAndOrderFront(nil)
    window = win

    web.load(URLRequest(url: url))
    NSApp.activate(ignoringOtherApps: true)

    // Coming back to the app with a dead page (Mac slept, server restarted…)
    // should never require a manual relaunch — reconnect automatically.
    NotificationCenter.default.addObserver(forName: NSApplication.didBecomeActiveNotification, object: nil, queue: .main) { [weak self] _ in
      guard let self, let web = self.webView else { return }
      if web.url == nil { self.kickServer(); web.load(URLRequest(url: self.url)) }
    }
  }

  func applicationShouldTerminateAfterLastWindowClosed(_ app: NSApplication) -> Bool { true }

  // The launchd service may still be waking up — retry FOREVER (gently), never
  // strand the user on a blank page. launchd keeps the server alive, so the
  // page always comes back eventually.
  private func scheduleRetry() {
    retries += 1
    if retries % 10 == 1 { kickServer() } // nudge the service every few seconds
    let delay = min(2.0, 0.4 + Double(retries) * 0.1)
    DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in
      guard let self else { return }
      self.webView.load(URLRequest(url: self.url))
    }
  }

  func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
    scheduleRetry()
  }

  func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
    scheduleRetry()
  }

  func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { retries = 0 }

  @objc func reloadPage(_ sender: Any?) {
    if webView.url == nil { kickServer(); webView.load(URLRequest(url: url)) }
    else { webView.reload() }
  }

  // window.confirm / window.alert need a native host to show anything.
  func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String,
               initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
    let a = NSAlert()
    a.messageText = message
    a.addButton(withTitle: "OK")
    a.addButton(withTitle: "Cancel")
    completionHandler(a.runModal() == .alertFirstButtonReturn)
  }

  func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String,
               initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
    let a = NSAlert()
    a.messageText = message
    a.addButton(withTitle: "OK")
    a.runModal()
    completionHandler()
  }

  private func kickServer() {
    let p = Process()
    p.executableURL = URL(fileURLWithPath: "/bin/launchctl")
    p.arguments = ["kickstart", "gui/\(getuid())/com.janet.lexiai-local"]
    try? p.run()
  }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)

// Minimal menu bar so ⌘Q and the standard editing shortcuts reach the page.
let mainMenu = NSMenu()

let appItem = NSMenuItem()
mainMenu.addItem(appItem)
let appMenu = NSMenu()
appMenu.addItem(withTitle: "Hide LexiAI", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
appMenu.addItem(NSMenuItem.separator())
appMenu.addItem(withTitle: "Quit LexiAI", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
appItem.submenu = appMenu

let editItem = NSMenuItem()
mainMenu.addItem(editItem)
let editMenu = NSMenu(title: "Edit")
editMenu.addItem(withTitle: "Undo", action: Selector(("undo:")), keyEquivalent: "z")
editMenu.addItem(withTitle: "Redo", action: Selector(("redo:")), keyEquivalent: "Z")
editMenu.addItem(NSMenuItem.separator())
editMenu.addItem(withTitle: "Cut", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
editMenu.addItem(withTitle: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
editMenu.addItem(withTitle: "Paste", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
editMenu.addItem(withTitle: "Select All", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
editMenu.addItem(NSMenuItem.separator())
let spellingItem = NSMenuItem(title: "Spelling", action: nil, keyEquivalent: "")
let spellingMenu = NSMenu(title: "Spelling")
spellingMenu.addItem(withTitle: "Check Spelling While Typing", action: Selector(("toggleContinuousSpellChecking:")), keyEquivalent: "")
spellingMenu.addItem(withTitle: "Show Spelling and Grammar", action: Selector(("showGuessPanel:")), keyEquivalent: ":")
spellingItem.submenu = spellingMenu
editMenu.addItem(spellingItem)
editItem.submenu = editMenu

let viewItem = NSMenuItem()
mainMenu.addItem(viewItem)
let viewMenu = NSMenu(title: "View")
viewMenu.addItem(withTitle: "Reload", action: #selector(AppDelegate.reloadPage(_:)), keyEquivalent: "r")
viewItem.submenu = viewMenu

app.mainMenu = mainMenu
app.run()
