package ua.hospital3.prozorro

import android.content.Context
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.Worker
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import java.util.concurrent.TimeUnit

/** Фонова перевірка змін у закупівлях. */
class CheckWorker(ctx: Context, params: WorkerParameters) : Worker(ctx, params) {
    override fun doWork(): Result {
        val ctx = applicationContext
        val manual = inputData.getBoolean(KEY_MANUAL, false)
        if (!manual && !Prefs.settings(ctx).optBoolean("notify", true)) return Result.success()
        return try {
            val events = Checker.run(ctx)
            Notifier.show(ctx, events)
            if (manual && events.isEmpty()) Notifier.showNoChanges(ctx)
            Result.success()
        } catch (e: Exception) {
            if (runAttemptCount < 2) Result.retry() else Result.failure()
        }
    }

    companion object {
        const val KEY_MANUAL = "manual"
    }
}

object Scheduler {
    private const val PERIODIC = "prozorro-check"
    private const val ONE_TIME = "prozorro-check-now"

    private fun constraints() = Constraints.Builder()
        .setRequiredNetworkType(NetworkType.CONNECTED)
        .build()

    fun schedule(ctx: Context) {
        val settings = Prefs.settings(ctx)
        val wm = WorkManager.getInstance(ctx.applicationContext)
        if (!settings.optBoolean("notify", true)) {
            wm.cancelUniqueWork(PERIODIC)
            return
        }
        val hours = settings.optInt("intervalHours", 3).coerceIn(1, 24).toLong()
        val request = PeriodicWorkRequestBuilder<CheckWorker>(hours, TimeUnit.HOURS)
            .setConstraints(constraints())
            .build()
        wm.enqueueUniquePeriodicWork(PERIODIC, ExistingPeriodicWorkPolicy.UPDATE, request)
    }

    fun runNow(ctx: Context) {
        val request = OneTimeWorkRequestBuilder<CheckWorker>()
            .setConstraints(constraints())
            .setInputData(workDataOf(CheckWorker.KEY_MANUAL to true))
            .build()
        WorkManager.getInstance(ctx.applicationContext)
            .enqueueUniqueWork(ONE_TIME, ExistingWorkPolicy.REPLACE, request)
    }
}
