package ua.hospital3.prozorro

import android.os.Handler
import android.os.Looper
import android.webkit.JavascriptInterface
import android.webkit.WebView
import org.json.JSONObject
import java.util.concurrent.Executors

/**
 * Міст між веб-інтерфейсом (assets/index.html) і Android.
 * У JavaScript доступний як window.Android.
 * Мережеві запити йдуть через нативний код — так немає обмежень CORS.
 */
class Bridge(private val activity: MainActivity, private val web: WebView) {
    private val executor = Executors.newFixedThreadPool(4)
    private val main = Handler(Looper.getMainLooper())

    @JavascriptInterface
    fun request(id: String, method: String, url: String, body: String?) {
        executor.execute {
            val js = try {
                val r = Net.request(method.uppercase(), url, body?.takeIf { it.isNotEmpty() })
                "window.__bridgeDone(${JSONObject.quote(id)}, ${r.code}, ${JSONObject.quote(r.body)}, null)"
            } catch (e: Exception) {
                val msg = e.message ?: "Помилка мережі"
                "window.__bridgeDone(${JSONObject.quote(id)}, 0, null, ${JSONObject.quote(msg)})"
            }
            main.post { web.evaluateJavascript(js, null) }
        }
    }

    @JavascriptInterface
    fun getSettings(): String = Prefs.settingsJson(activity)

    @JavascriptInterface
    fun saveSettings(json: String) {
        Prefs.saveSettings(activity, json)
        main.post { Scheduler.schedule(activity) }
    }

    @JavascriptInterface
    fun lastCheck(): String = Prefs.state(activity).optLong("lastCheck", 0L).toString()

    @JavascriptInterface
    fun checkNow() {
        Scheduler.runNow(activity)
    }

    @JavascriptInterface
    fun notificationsAllowed(): Boolean = Notifier.allowed(activity)

    @JavascriptInterface
    fun requestNotifications() {
        main.post { activity.askNotificationPermission(force = true) }
    }

    @JavascriptInterface
    fun openUrl(url: String) {
        main.post { activity.openExternal(url) }
    }

    @JavascriptInterface
    fun share(text: String) {
        main.post { activity.shareText(text) }
    }

    @JavascriptInterface
    fun appVersion(): String = BuildConfigCompat.versionName(activity)
}
