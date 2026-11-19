package com.cyberarena.game;

import android.Manifest;
import android.app.Activity;
import android.content.pm.PackageManager;
import android.content.pm.ActivityInfo;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.PowerManager;
import android.webkit.RenderProcessGoneDetail;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;

/* CyberArena: o jogo inteiro roda dentro do app, SEMPRE deitado (paisagem) e em tela cheia. */
public class MainActivity extends Activity {
    static final String HOST = "appassets.androidplatform.net";
    WebView web;
    PermissionRequest pendingMic;   // pedido de microfone do chat de voz do grupo, esperando a permissão do Android
    static final int REQ_MIC = 77;

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);
        Window w = getWindow();
        w.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON | WindowManager.LayoutParams.FLAG_FULLSCREEN);
        if (Build.VERSION.SDK_INT >= 28) w.getAttributes().layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
        // desempenho estável: o aparelho segura um clock constante em vez de esquentar e derrubar o FPS no meio da partida
        if (Build.VERSION.SDK_INT >= 24) { try { PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE); if (pm != null && pm.isSustainedPerformanceModeSupported()) w.setSustainedPerformanceMode(true); } catch (Exception ignored) { } }
        w.addFlags(WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED);
        createWeb(b);
    }

    void createWeb(Bundle b) {
        web = new WebView(this);
        web.setBackgroundColor(Color.BLACK);
        web.setLayerType(View.LAYER_TYPE_HARDWARE, null);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.setVerticalScrollBarEnabled(false); web.setHorizontalScrollBarEnabled(false);
        // o motor do jogo tem prioridade máxima e não é derrubado pelo Android enquanto o app está aberto
        if (Build.VERSION.SDK_INT >= 26) web.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, false);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true); s.setDomStorageEnabled(true); s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false); s.setAllowFileAccess(false);
        s.setLoadWithOverviewMode(true); s.setUseWideViewPort(true);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        // chat de voz do grupo (WebRTC): libera SÓ o microfone, SÓ para as páginas do próprio jogo
        web.setWebChromeClient(new WebChromeClient() {
            @Override public void onPermissionRequest(final PermissionRequest req) {
                runOnUiThread(new Runnable() { @Override public void run() {
                    boolean mic = false;
                    for (String r : req.getResources()) if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(r)) mic = true;
                    if (!mic || req.getOrigin() == null || !HOST.equals(req.getOrigin().getHost())) { req.deny(); return; }
                    if (Build.VERSION.SDK_INT < 23 || checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
                        req.grant(new String[] { PermissionRequest.RESOURCE_AUDIO_CAPTURE });
                    } else {
                        if (pendingMic != null) pendingMic.deny();
                        pendingMic = req; requestPermissions(new String[] { Manifest.permission.RECORD_AUDIO }, REQ_MIC);
                    }
                } });
            }
            @Override public void onPermissionRequestCanceled(PermissionRequest req) { if (pendingMic == req) pendingMic = null; }
        });
        web.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) {
                Uri u = r.getUrl();
                if (!HOST.equals(u.getHost())) return null;
                String p = u.getPath(); if (p == null || p.equals("/")) p = "/index.html";
                p = Uri.decode(p).substring(1);
                if (p.contains("..")) return null;
                try {
                    InputStream in = getAssets().open("www/" + p);
                    Map<String, String> h = new HashMap<>(); h.put("Access-Control-Allow-Origin", "*"); h.put("Cache-Control", "no-cache");
                    return new WebResourceResponse(mime(p), mime(p).startsWith("text") || mime(p).endsWith("javascript") || mime(p).endsWith("json") ? "utf-8" : null, 200, "OK", h, in);
                } catch (Exception e) {
                    return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", new HashMap<String, String>(), new java.io.ByteArrayInputStream(new byte[0]));
                }
            }
            // se o motor do WebView cair (falta de memória), recria o jogo em vez de fechar o app
            @Override public boolean onRenderProcessGone(WebView v, RenderProcessGoneDetail d) {
                try { setContentView(new View(MainActivity.this)); v.destroy(); } catch (Exception ignored) { }
                web = null; createWeb(null); return true;
            }
            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) { return !HOST.equals(r.getUrl().getHost()); }
        });
        setContentView(web);
        hideBars();
        if (b != null) web.restoreState(b); else web.loadUrl("https://" + HOST + "/index.html");
    }


    static String mime(String p) {
        String e = p.substring(p.lastIndexOf('.') + 1).toLowerCase();
        switch (e) {
            case "html": return "text/html"; case "js": case "mjs": return "text/javascript"; case "css": return "text/css";
            case "json": case "webmanifest": return "application/json"; case "png": return "image/png"; case "jpg": case "jpeg": return "image/jpeg";
            case "webp": return "image/webp"; case "svg": return "image/svg+xml"; case "gif": return "image/gif"; case "mp3": return "audio/mpeg";
            case "wav": return "audio/wav"; case "ogg": return "audio/ogg"; case "wasm": return "application/wasm"; case "glb": return "model/gltf-binary";
            case "txt": case "md": return "text/plain"; default: return "application/octet-stream";
        }
    }

    @SuppressWarnings("deprecation")
    void hideBars() {
        if (web == null) return;
        web.setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
    }
    @Override public void onRequestPermissionsResult(int code, String[] perms, int[] res) {
        super.onRequestPermissionsResult(code, perms, res);
        if (code != REQ_MIC || pendingMic == null) return;
        if (res.length > 0 && res[0] == PackageManager.PERMISSION_GRANTED) pendingMic.grant(new String[] { PermissionRequest.RESOURCE_AUDIO_CAPTURE }); else pendingMic.deny();
        pendingMic = null;
    }
    @Override public void onWindowFocusChanged(boolean f) { super.onWindowFocusChanged(f); if (f) hideBars(); }
    @Override protected void onSaveInstanceState(Bundle o) { super.onSaveInstanceState(o); if (web != null) web.saveState(o); }
    @Override protected void onPause() { super.onPause(); if (web != null) { web.onPause(); web.pauseTimers(); } }
    @Override protected void onResume() { super.onResume(); if (web != null) { web.resumeTimers(); web.onResume(); } hideBars(); }
    @SuppressWarnings("deprecation")
    @Override public void onBackPressed() { if (web != null && web.canGoBack()) web.goBack(); else super.onBackPressed(); }
}
