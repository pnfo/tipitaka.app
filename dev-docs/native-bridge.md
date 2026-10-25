# Native bridge (Android / iOS apps)

The apps load the web app build `web/dist-app` (`npm run build:web:app`: relative paths, hash routing) from local
files and run the Go engine (`server/mobile`, built with gomobile) next to the databases. The JS ↔ native contract
is one asynchronous call:

```
JS → native   Android: window.TipitakaNative.query(id, request)        (@JavascriptInterface)
              iOS:     window.webkit.messageHandlers.tipitaka.postMessage({ id, request })
native → JS   window.__tipitakaResolve(id, response)                    (on the UI thread)

request  = JSON {"op": "<operation>", ...string params}       e.g. {"op":"text","key":"dn-1-1","from":"3"}
response = engine.Query(request): {"ok": <result>} or {"error": "<code>", "message": "..."}
```
Operations and results are the same as `GET /api/<op>` (`server/engine/call.go`, types in `web/src/data/types.ts`).
Optional native methods: `TipitakaNative.share(text)`, `TipitakaNative.setStatusBarColor(hex)`.

## Android (`app.tipitaka.main`)
```java
// build.gradle: implementation files('libs/engine.aar')   (scripts/build-mobile.sh android)
import app.tipitaka.engine.mobile.Engine;
import app.tipitaka.engine.mobile.Mobile;

public class TipitakaBridge {
    private final WebView webView;
    private final ExecutorService pool = Executors.newFixedThreadPool(3);
    private volatile Engine engine; // opened once the dbs are copied out of the asset pack

    @JavascriptInterface
    public void query(String id, String request) {
        pool.execute(() -> {
            String res;
            try { res = engine().query(request); }
            catch (Exception e) { res = "{\"error\":\"internal\",\"message\":" + JSONObject.quote(e.getMessage()) + "}"; }
            String js = "window.__tipitakaResolve(" + JSONObject.quote(id) + "," + JSONObject.quote(res) + ")";
            webView.post(() -> webView.evaluateJavascript(js, null));
        });
    }
    private synchronized Engine engine() throws Exception {
        if (engine == null) engine = Mobile.open(dbPath("text.db"), dbPath("dict.db"));  // copy from assets first
        return engine;
    }
}
webView.addJavascriptInterface(new TipitakaBridge(webView), "TipitakaNative");
webView.loadUrl("file:///android_asset/dist-app/index.html");   // or WebViewAssetLoader (https://appassets…)
```
* Databases: `text.db` (~330 MB) and `dict.db` (~420 MB) ship in an install-time asset pack and are copied to
  `getDatabasePath()` on first run (or when `Engine.version()` / build-info changes). DPD can move to an on-demand
  pack if the install size matters.
* minSdk 24 (Android 7). ABIs in the AAR: arm64-v8a, armeabi-v7a, x86_64 (emulator).
* Back key: `webView.canGoBack() ? webView.goBack() : finish()`; external links open in the browser.

## iOS (`apple/iOS/App.swift`, `app.tipitaka.main`)
`scripts/build-apple.sh` builds `Engine.xcframework` (`MobileOpen(text, dict, &err)`, `engine.query(_:)`), the app web
build and the Xcode project (XcodeGen, `apple/project.yml`). A `WKWebView` loads `dist-app` from the bundle through a
`WKURLSchemeHandler` at `app://tipitaka/` (a real origin for localStorage and fonts); the `WKScriptMessageHandler`
named `tipitaka` runs `query` on a background queue and calls `window.__tipitakaResolve(id, response)` on the main
queue. The databases are in the bundle (`db/`). A second handler, `chrome`, reports the header and page colours so the
status bar area follows the theme. iOS 15+. Debug builds take `-start <route> -theme <theme>` launch arguments
(`xcrun simctl launch <device> app.tipitaka.main -start /latn/dn-1-1`), for screenshots.

The macOS App Store app is the Wails desktop app (`server/desktop.go`) in the same Xcode project: the Go universal
binary replaces the placeholder executable of the `Tipitaka-macOS` target, so Xcode signs, archives and uploads it.

## Testing
`e2e/android.spec.ts` (`android-sim` project) runs the app build with a simulated bridge (async answers, the page
never calls `/api`). `web/src/data/api.test.ts` covers out-of-order answers and errors.
