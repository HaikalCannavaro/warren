package dev.harbor.updater

import android.Manifest
import android.app.Activity
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import androidx.work.*
import com.google.firebase.FirebaseApp
import com.google.firebase.messaging.FirebaseMessaging
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import org.json.JSONArray
import org.json.JSONObject
import java.net.URL
import java.security.KeyStore
import java.util.concurrent.TimeUnit
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import javax.net.ssl.HttpsURLConnection

/** Device-protected outbox: independent of Activity/WebView, never stores a vault password. */
object BackgroundChat {
    var activity: java.lang.ref.WeakReference<Activity>? = null
    const val CHANNEL = "warren_agent_results"
    private const val PREFS = "warren.background.encrypted.v1"
    private const val ALIAS = "warren.background.v1"
    private val terminal = setOf("complete", "error", "unknown")

    private fun key(): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (store.getKey(ALIAS, null) as? SecretKey)?.let { return it }
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
            init(KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build())
        }.generateKey()
    }

    @Synchronized fun read(context: Context): JSONObject {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val value = prefs.getString("data", null) ?: return JSONObject().put("jobs", JSONObject())
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, Base64.decode(prefs.getString("iv", ""), Base64.NO_WRAP)))
        // Fail visibly on a lost Keystore key; never overwrite an unreadable outbox.
        return JSONObject(String(cipher.doFinal(Base64.decode(value, Base64.NO_WRAP)), Charsets.UTF_8))
    }

    @Synchronized fun change(context: Context, transform: (JSONObject) -> Unit): JSONObject {
        val state = read(context)
        transform(state)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key())
        val encrypted = cipher.doFinal(state.toString().toByteArray(Charsets.UTF_8))
        check(context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putString("data", Base64.encodeToString(encrypted, Base64.NO_WRAP))
            .putString("iv", Base64.encodeToString(cipher.iv, Base64.NO_WRAP)).commit()) { "Could not save the background outbox." }
        return state
    }

    private fun validId(value: String) = value.length in 1..128 && value.all { it.isLetterOrDigit() && it.code < 128 || it == '-' || it == '_' }
    private fun firebase(context: Context): Boolean = FirebaseApp.getApps(context).isNotEmpty() || FirebaseApp.initializeApp(context) != null
    private fun notifications(context: Context): Boolean = Build.VERSION.SDK_INT < 33 || ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED

    fun status(context: Context): JSONObject {
        val state = read(context)
        val config = state.optJSONObject("config") ?: JSONObject()
        val jobs = state.optJSONObject("jobs") ?: JSONObject()
        return JSONObject().put("supported", true).put("enabled", config.optBoolean("enabled"))
            .put("profileId", config.optString("profileId")).put("relayUrl", config.optString("relayUrl"))
            .put("pushReady", firebase(context)).put("notificationsAllowed", notifications(context))
            .put("pendingCount", jobs.keys().asSequence().count { jobs.getJSONObject(it).optString("state") !in terminal })
            .put("lastError", state.optString("lastError"))
    }

    fun command(activity: Activity, action: String, payload: JSONObject): JSONObject {
        when (action) {
            "status" -> return status(activity)
            "permission" -> {
                ensureChannel(activity)
                if (firebase(activity)) FirebaseMessaging.getInstance().token.addOnSuccessListener { token ->
                    change(activity) { it.put("fcmToken", token) }; schedule(activity)
                }
                return status(activity)
            }
            "configure" -> {
                val relayUrl = payload.getString("relayUrl").trimEnd('/')
                val url = URL(relayUrl)
                require(url.protocol == "https" && url.userInfo == null && url.query == null && url.ref == null) { "Use an HTTPS relay address without credentials or a query." }
                require(validId(payload.getString("profileId")) && validId(payload.getString("deviceId"))) { "Invalid profile or device." }
                require(payload.getString("token").length in 32..8192) { "Enter the relay token." }
                val config = JSONObject(payload.toString()).put("relayUrl", relayUrl).put("enabled", true)
                val health = http(config, "GET", "/v1/health")
                require(health.getString("protocol") == "warren-background-v1" && health.getString("gatewayUrl") == payload.getString("gatewayUrl")) { "This relay serves a different Gateway." }
                change(activity) { state ->
                    val old = state.optJSONObject("config")
                    val jobs = state.getJSONObject("jobs")
                    require(jobs.length() == 0 || old == null || old.optString("relayUrl") == relayUrl && old.optString("profileId") == config.getString("profileId") && old.optString("deviceId") == config.getString("deviceId")) { "Sync existing background messages before changing the source." }
                    state.put("config", config).put("lastError", "")
                }
                schedule(activity)
                return status(activity)
            }
            "disable" -> {
                change(activity) { it.optJSONObject("config")?.put("enabled", false) }
                WorkManager.getInstance(activity).cancelAllWorkByTag("warren-background")
                return status(activity)
            }
            "enqueue" -> {
                val config = read(activity).getJSONObject("config")
                require(config.optBoolean("enabled") && config.getString("profileId") == payload.getString("profileId")) { "Background delivery is not configured for this Agent." }
                val request = payload.getJSONObject("request")
                for (name in listOf("submissionId", "conversationId", "deviceId")) require(validId(request.getString(name))) { "Invalid request identity." }
                require(request.getString("deviceId") == config.getString("deviceId")) { "Device identity changed." }
                require(request.getString("text").isNotBlank() && request.getString("text").toByteArray(Charsets.UTF_8).size <= 65536) { "Message is empty or too long." }
                val id = request.getString("submissionId")
                change(activity) { state ->
                    val jobs = state.getJSONObject("jobs")
                    val existing = jobs.optJSONObject(id)
                    require(existing == null || existing.getJSONObject("request").toString() == request.toString()) { "Submission ID already belongs to another message." }
                    require(existing != null || jobs.length() < 100) { "Sync saved results before adding more messages." }
                    if (existing == null) jobs.put(id, JSONObject().put("submissionId", id).put("conversationId", request.getString("conversationId"))
                        .put("profileId", payload.getString("profileId")).put("request", request).put("state", "queued").put("text", "").put("accepted", false).put("updatedAt", 0))
                }
                schedule(activity)
                return JSONObject().put("queued", true)
            }
            "sync" -> { schedule(activity); return JSONObject().put("scheduled", true) }
            "results" -> {
                val state = read(activity)
                val config = state.optJSONObject("config") ?: return JSONObject().put("jobs", JSONArray())
                if (payload.optString("deviceId") != config.optString("deviceId")) return JSONObject().put("jobs", JSONArray())
                val jobs = state.getJSONObject("jobs")
                val open = activity.intent.getStringExtra("warrenConversationId") ?: activity.intent.getStringExtra("conversationId")
                val output = JSONObject().put("jobs", JSONArray(jobs.keys().asSequence().map { key ->
                    val copy = JSONObject(jobs.getJSONObject(key).toString()); copy.remove("request"); copy
                }.toList()))
                if (open != null && validId(open)) {
                    output.put("openConversationId", open)
                    activity.intent.removeExtra("warrenConversationId"); activity.intent.removeExtra("conversationId")
                }
                return output
            }
            "ack" -> {
                change(activity) { state ->
                    val jobs = state.getJSONObject("jobs")
                    val ids = payload.getJSONArray("ids")
                    for (index in 0 until ids.length()) {
                        val id = ids.getString(index)
                        if (jobs.optJSONObject(id)?.optString("state") in terminal) jobs.remove(id)
                    }
                }
                return JSONObject().put("saved", true)
            }
            else -> error("Unsupported background action.")
        }
    }

    fun schedule(context: Context) {
        if (read(context).optJSONObject("config")?.optBoolean("enabled") != true) return
        val constraints = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()
        val manager = WorkManager.getInstance(context)
        val builder = OneTimeWorkRequestBuilder<BackgroundChatWorker>().setConstraints(constraints)
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS).addTag("warren-background")
        if (Build.VERSION.SDK_INT >= 31) builder.setExpedited(OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST)
        // A push/resume resets a stale retry delay. Repeated HTTP submits retain the immutable ID.
        manager.enqueueUniqueWork("warren-background-now", ExistingWorkPolicy.REPLACE, builder.build())
        manager.enqueueUniquePeriodicWork("warren-background-periodic", ExistingPeriodicWorkPolicy.KEEP,
            PeriodicWorkRequestBuilder<BackgroundChatWorker>(15, TimeUnit.MINUTES).setConstraints(constraints).addTag("warren-background").build())
    }

    fun ensureChannel(context: Context) {
        if (Build.VERSION.SDK_INT >= 26) context.getSystemService(NotificationManager::class.java)
            .createNotificationChannel(NotificationChannel(CHANNEL, "Agent results", NotificationManager.IMPORTANCE_DEFAULT))
    }

    fun notify(context: Context, id: String, conversation: String) {
        ensureChannel(context)
        if (activity?.get()?.hasWindowFocus() == true) return
        if (!notifications(context)) return
        val launch = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: return
        launch.putExtra("warrenConversationId", conversation)
        val pending = PendingIntent.getActivity(context, id.hashCode(), launch, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val notification = NotificationCompat.Builder(context, CHANNEL).setSmallIcon(context.applicationInfo.icon)
            .setContentTitle("Warren").setContentText("Your Agent task has an update. Open Warren to sync.")
            .setContentIntent(pending).setAutoCancel(true).build()
        context.getSystemService(NotificationManager::class.java).notify(id, 736, notification)
    }

    class HttpFailure(val code: Int) : Exception("Background relay returned HTTP $code.")
    fun http(config: JSONObject, method: String, route: String, body: JSONObject? = null): JSONObject {
        val connection = URL(config.getString("relayUrl") + route).openConnection() as HttpsURLConnection
        try {
            connection.instanceFollowRedirects = false
            connection.connectTimeout = 15000; connection.readTimeout = 20000
            connection.requestMethod = method
            connection.setRequestProperty("Authorization", "Bearer " + config.getString("token"))
            connection.setRequestProperty("Accept", "application/json")
            if (body != null) {
                connection.doOutput = true; connection.setRequestProperty("Content-Type", "application/json")
                connection.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
            }
            val code = connection.responseCode
            if (code !in 200..299) throw HttpFailure(code)
            val bytes = connection.inputStream.use { it.readBytesLimited(3 * 1024 * 1024) }
            return JSONObject(String(bytes, Charsets.UTF_8))
        } finally { connection.disconnect() }
    }

    private fun java.io.InputStream.readBytesLimited(limit: Int): ByteArray {
        val output = java.io.ByteArrayOutputStream()
        val chunk = ByteArray(8192)
        while (true) { val size = read(chunk); if (size < 0) break; require(output.size() + size <= limit) { "Relay result is too large." }; output.write(chunk, 0, size) }
        return output.toByteArray()
    }
}

class BackgroundChatWorker(context: Context, params: WorkerParameters) : Worker(context, params) {
    override fun doWork(): Result {
        try {
            val state = BackgroundChat.read(applicationContext)
            val config = state.optJSONObject("config") ?: return Result.success()
            if (!config.optBoolean("enabled")) return Result.success()
            val token = state.optString("fcmToken")
            if (token.isNotBlank()) BackgroundChat.http(config, "POST", "/v1/devices", JSONObject().put("deviceId", config.getString("deviceId")).put("token", token))
            val jobs = state.getJSONObject("jobs")
            val deadline = System.currentTimeMillis() + 60000
            var unfinished = false
            for (id in jobs.keys()) {
                if (isStopped) return Result.retry()
                val job = jobs.getJSONObject(id)
                if (job.optString("state") in setOf("complete", "error", "unknown")) continue
                if (System.currentTimeMillis() >= deadline) { unfinished = true; break }
                try {
                    val reply = if (!job.optBoolean("accepted")) BackgroundChat.http(config, "POST", "/v1/jobs", job.getJSONObject("request"))
                        else BackgroundChat.http(config, "GET", "/v1/jobs/$id")
                    if (isStopped) return Result.retry()
                    require(reply.getString("submissionId") == id && reply.getString("conversationId") == job.getString("conversationId") && reply.getString("deviceId") == config.getString("deviceId")) { "Relay result identity did not match the request." }
                    require(reply.getString("state") in setOf("queued", "running", "complete", "error", "unknown")) { "Unrecognized relay status." }
                    BackgroundChat.change(applicationContext) { current ->
                        val live = current.getJSONObject("jobs").optJSONObject(id)
                        if (live != null && live.optString("state") !in setOf("complete", "error", "unknown") && reply.optLong("updatedAt") >= live.optLong("updatedAt")) {
                            for (key in listOf("state", "text", "error", "sessionId", "agentProfile", "updatedAt")) if (reply.has(key)) live.put(key, reply.get(key))
                            live.put("accepted", true)
                        }
                        current.put("lastError", "")
                    }
                    if (reply.getString("state") !in setOf("complete", "error", "unknown")) unfinished = true
                } catch (failure: BackgroundChat.HttpFailure) {
                    if (failure.code in setOf(400, 409, 413) || failure.code == 404 && job.optBoolean("accepted")) {
                        BackgroundChat.change(applicationContext) { current -> current.getJSONObject("jobs").optJSONObject(id)?.put("state", "unknown")?.put("error", failure.message) }
                    } else throw failure
                }
            }
            return if (unfinished) Result.retry() else Result.success()
        } catch (_: Exception) {
            try { BackgroundChat.change(applicationContext) { it.put("lastError", "Background connection unavailable. Delivery will retry with the same message ID.") } } catch (_: Exception) { }
            return Result.retry()
        }
    }
}

class WarrenMessagingService : FirebaseMessagingService() {
    override fun onNewToken(token: String) {
        try {
            BackgroundChat.change(this) { it.put("fcmToken", token) }
            BackgroundChat.schedule(this)
        } catch (_: Exception) { /* Keep the encrypted outbox intact if Keystore is unavailable. */ }
    }
    override fun onMessageReceived(message: RemoteMessage) {
        // FCM is a wake-up hint only. The authenticated relay supplies the actual chat.
        try { BackgroundChat.schedule(this) } catch (_: Exception) { }
        val id = message.data["submissionId"] ?: return
        val conversation = message.data["conversationId"] ?: return
        BackgroundChat.notify(this, id, conversation)
    }
}
