package dev.harbor.updater

import android.content.Context
import androidx.work.Worker
import androidx.work.WorkerParameters
import androidx.work.WorkManager
import com.google.firebase.FirebaseApp
import com.google.firebase.messaging.FirebaseMessaging
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import org.json.JSONObject

/** Compatibility only: retired Agent delivery never reads or erases its old outbox. */
object BackgroundChat {
    fun status(): JSONObject = JSONObject()
        .put("supported", false)
        .put("enabled", false)
        .put("retired", true)

    fun retire(context: Context) {
        // Cancel local schedulers only. Already accepted Hermes/VPS jobs continue.
        try {
            WorkManager.getInstance(context).cancelAllWorkByTag("warren-background")
        } catch (_: Exception) { }

        // Do not initialize Firebase solely for retirement or access chat credentials.
        // Token deletion is best effort; already queued pushes may still arrive.
        try {
            if (FirebaseApp.getApps(context).isNotEmpty()) {
                val messaging = FirebaseMessaging.getInstance()
                messaging.isAutoInitEnabled = false
                messaging.deleteToken().addOnFailureListener { }
            }
        } catch (_: Exception) { }
    }
}

// Keep the original class and constructor for WorkManager records saved by older APKs.
// Completing an old worker does not submit, cancel, or delete anything on the VPS.
class BackgroundChatWorker(context: Context, params: WorkerParameters) : Worker(context, params) {
    override fun doWork(): Result = Result.success()
}

// Retain the registered service class for upgrade compatibility, without new work.
class WarrenMessagingService : FirebaseMessagingService() {
    override fun onNewToken(token: String) { }
    override fun onMessageReceived(message: RemoteMessage) { }
}
