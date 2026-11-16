package ua.hospital3.prozorro

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat

object Notifier {
    private const val CHANNEL = "tenders"
    private const val GROUP = "ua.hospital3.prozorro.TENDERS"

    fun ensureChannel(ctx: Context) {
        val nm = ctx.getSystemService(NotificationManager::class.java) ?: return
        val channel = NotificationChannel(
            CHANNEL,
            ctx.getString(R.string.channel_name),
            NotificationManager.IMPORTANCE_DEFAULT,
        )
        channel.description = ctx.getString(R.string.channel_desc)
        nm.createNotificationChannel(channel)
    }

    fun allowed(ctx: Context): Boolean {
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS) !=
            PackageManager.PERMISSION_GRANTED
        ) return false
        return NotificationManagerCompat.from(ctx).areNotificationsEnabled()
    }

    private fun openIntent(ctx: Context, tenderId: String?, requestCode: Int): PendingIntent {
        val intent = Intent(ctx, MainActivity::class.java).apply {
            if (tenderId != null) putExtra(MainActivity.EXTRA_TENDER, tenderId)
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        return PendingIntent.getActivity(
            ctx, requestCode, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    fun show(ctx: Context, events: List<Event>) {
        if (events.isEmpty() || !allowed(ctx)) return
        ensureChannel(ctx)
        val nm = NotificationManagerCompat.from(ctx)
        events.take(15).forEach { e ->
            val firstLine = e.text.lineSequence().firstOrNull() ?: ""
            val n = NotificationCompat.Builder(ctx, CHANNEL)
                .setSmallIcon(R.drawable.ic_stat_notify)
                .setColor(ContextCompat.getColor(ctx, R.color.brand))
                .setContentTitle(e.title)
                .setContentText(firstLine)
                .setSubText(e.tenderId)
                .setStyle(NotificationCompat.BigTextStyle().bigText(e.text))
                .setContentIntent(openIntent(ctx, e.tenderId, e.tenderId.hashCode()))
                .setGroup(GROUP)
                .setAutoCancel(true)
                .build()
            try {
                nm.notify(e.tenderId.hashCode(), n)
            } catch (e: SecurityException) {
            }
        }
        if (events.size > 1) {
            val summary = NotificationCompat.Builder(ctx, CHANNEL)
                .setSmallIcon(R.drawable.ic_stat_notify)
                .setColor(ContextCompat.getColor(ctx, R.color.brand))
                .setContentTitle("Зміни в закупівлях: ${events.size}")
                .setContentIntent(openIntent(ctx, null, 0))
                .setGroup(GROUP)
                .setGroupSummary(true)
                .setAutoCancel(true)
                .build()
            try {
                nm.notify(SUMMARY_ID, summary)
            } catch (e: SecurityException) {
            }
        }
    }

    fun showNoChanges(ctx: Context) {
        if (!allowed(ctx)) return
        ensureChannel(ctx)
        val n = NotificationCompat.Builder(ctx, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_notify)
            .setColor(ContextCompat.getColor(ctx, R.color.brand))
            .setContentTitle("Перевірку виконано")
            .setContentText("Нових змін у закупівлях немає")
            .setTimeoutAfter(15_000)
            .setAutoCancel(true)
            .build()
        try {
            NotificationManagerCompat.from(ctx).notify(NO_CHANGES_ID, n)
        } catch (e: SecurityException) {
        }
    }

    private const val SUMMARY_ID = 1
    private const val NO_CHANGES_ID = 2
}
