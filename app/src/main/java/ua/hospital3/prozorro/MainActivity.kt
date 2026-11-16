package ua.hospital3.prozorro

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.view.View
import android.view.ViewGroup
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.LinearLayout
import android.widget.Toast
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import org.json.JSONObject

class MainActivity : Activity() {

    companion object {
        const val EXTRA_TENDER = "tenderID"
        private const val REQ_NOTIFICATIONS = 42
        private const val PREFS_UI = "ui"
    }

    private lateinit var web: WebView
    private var pageLoaded = false
    private var pendingTender: String? = null

    @SuppressLint("SetJavaScriptEnabled", "JavascriptInterface")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Малюємо від краю до краю і самі відступаємо під системні панелі —
        // однаково на всіх версіях Android (на Android 15+ це обов'язково).
        WindowCompat.setDecorFitsSystemWindows(window, false)
        makeBarsTransparent()

        val brand = ContextCompat.getColor(this, R.color.brand)
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.WHITE)
        }
        val topSpacer = View(this).apply { setBackgroundColor(brand) }
        web = WebView(this)
        val bottomSpacer = View(this).apply { setBackgroundColor(Color.WHITE) }
        root.addView(topSpacer, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0))
        root.addView(web, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))
        root.addView(bottomSpacer, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0))
        setContentView(root)

        WindowCompat.getInsetsController(window, root).apply {
            isAppearanceLightStatusBars = false     // білі значки на синьому
            isAppearanceLightNavigationBars = true  // темні значки на білому
        }

        ViewCompat.setOnApplyWindowInsetsListener(root) { _, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            val ime = insets.getInsets(WindowInsetsCompat.Type.ime())
            topSpacer.layoutParams = topSpacer.layoutParams.apply { height = bars.top }
            bottomSpacer.layoutParams =
                bottomSpacer.layoutParams.apply { height = maxOf(bars.bottom, ime.bottom) }
            root.setPadding(bars.left, 0, bars.right, 0)
            WindowInsetsCompat.CONSUMED
        }

        web.settings.javaScriptEnabled = true
        web.settings.domStorageEnabled = true
        web.settings.textZoom = 100
        web.setBackgroundColor(Color.parseColor("#F3F5F9"))
        web.addJavascriptInterface(Bridge(this, web), "Android")
        web.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val url = request.url.toString()
                if (url.startsWith("file:///android_asset/")) return false
                openExternal(url)
                return true
            }

            override fun onPageFinished(view: WebView, url: String) {
                pageLoaded = true
                deliverPendingTender()
            }
        }

        pendingTender = intent?.getStringExtra(EXTRA_TENDER)
        web.loadUrl("file:///android_asset/index.html")

        Notifier.ensureChannel(this)
        askNotificationPermission(force = false)
        Scheduler.schedule(this)
    }

    @Suppress("DEPRECATION")
    private fun makeBarsTransparent() {
        window.statusBarColor = Color.TRANSPARENT
        window.navigationBarColor = Color.TRANSPARENT
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        pendingTender = intent.getStringExtra(EXTRA_TENDER)
        if (pageLoaded) deliverPendingTender()
    }

    override fun onResume() {
        super.onResume()
        if (pageLoaded) web.evaluateJavascript("window.onAppResume && window.onAppResume()", null)
    }

    private fun deliverPendingTender() {
        val id = pendingTender ?: return
        pendingTender = null
        web.evaluateJavascript(
            "window.openTenderFromNotification && window.openTenderFromNotification(${JSONObject.quote(id)})",
            null,
        )
    }

    /** Запит дозволу на сповіщення (Android 13+). Автоматично — лише один раз. */
    fun askNotificationPermission(force: Boolean) {
        if (Build.VERSION.SDK_INT < 33) {
            if (force && !Notifier.allowed(this)) openNotificationSettings()
            return
        }
        if (checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) {
            if (force && !Notifier.allowed(this)) openNotificationSettings()
            return
        }
        val ui = getSharedPreferences(PREFS_UI, Context.MODE_PRIVATE)
        val askedBefore = ui.getBoolean("askedNotifications", false)
        if (askedBefore && force && !shouldShowRequestPermissionRationale(Manifest.permission.POST_NOTIFICATIONS)) {
            // Користувач уже відмовив назавжди — лишається системне налаштування.
            openNotificationSettings()
            return
        }
        if (!askedBefore || force) {
            ui.edit().putBoolean("askedNotifications", true).apply()
            requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), REQ_NOTIFICATIONS)
        }
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == REQ_NOTIFICATIONS && pageLoaded) {
            web.evaluateJavascript("window.onAppResume && window.onAppResume()", null)
        }
    }

    private fun openNotificationSettings() {
        try {
            startActivity(
                Intent("android.settings.APP_NOTIFICATION_SETTINGS")
                    .putExtra("android.provider.extra.APP_PACKAGE", packageName)
            )
        } catch (e: Exception) {
            Toast.makeText(this, "Увімкніть сповіщення в налаштуваннях Android", Toast.LENGTH_LONG).show()
        }
    }

    fun openExternal(url: String) {
        try {
            startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
        } catch (e: ActivityNotFoundException) {
            Toast.makeText(this, "Немає програми, щоб відкрити посилання", Toast.LENGTH_SHORT).show()
        }
    }

    fun shareText(text: String) {
        val send = Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_TEXT, text)
        }
        startActivity(Intent.createChooser(send, "Поділитися"))
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        // Спершу даємо веб-інтерфейсу закрити відкриту картку/екран.
        web.evaluateJavascript("(window.handleBack && window.handleBack()) ? 'y' : 'n'") { result ->
            if (result != "\"y\"") finish()
        }
    }
}

object BuildConfigCompat {
    fun versionName(ctx: Context): String = try {
        @Suppress("DEPRECATION")
        ctx.packageManager.getPackageInfo(ctx.packageName, 0).versionName ?: ""
    } catch (e: Exception) {
        ""
    }
}
