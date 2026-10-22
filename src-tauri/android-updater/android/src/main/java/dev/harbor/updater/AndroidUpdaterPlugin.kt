package dev.harbor.updater

import android.app.Activity
import android.content.ClipData
import android.content.Intent
import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.io.File
import java.security.MessageDigest
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

@InvokeArg
class InstallApkArgs {
    lateinit var path: String
    lateinit var packageName: String
    lateinit var versionName: String
    lateinit var sha256: String
    var versionCode: Long = 0
    var size: Long = 0
}

@TauriPlugin
class AndroidUpdaterPlugin(private val activity: Activity) : Plugin(activity) {
    private val worker = Executors.newSingleThreadExecutor { task ->
        Thread(task, "harbor-update-verifier").apply { isDaemon = true }
    }
    private val installing = AtomicBoolean(false)

    @Suppress("DEPRECATION")
    private fun installedPackage(): PackageInfo =
        activity.packageManager.getPackageInfo(activity.packageName, signatureFlags())

    @Suppress("DEPRECATION")
    private fun signatureFlags(): Int = if (Build.VERSION.SDK_INT >= 28) {
        PackageManager.GET_SIGNING_CERTIFICATES
    } else {
        PackageManager.GET_SIGNATURES
    }

    @Suppress("DEPRECATION")
    private fun versionCode(info: PackageInfo): Long = if (Build.VERSION.SDK_INT >= 28) {
        info.longVersionCode
    } else {
        info.versionCode.toLong()
    }

    private fun hex(bytes: ByteArray): String = bytes.joinToString("") { "%02x".format(it.toInt() and 0xff) }

    @Suppress("DEPRECATION")
    private fun signerDigests(info: PackageInfo): Set<String> {
        val signatures = if (Build.VERSION.SDK_INT >= 28) {
            info.signingInfo?.apkContentsSigners
        } else {
            info.signatures
        }
        return signatures?.map { hex(MessageDigest.getInstance("SHA-256").digest(it.toByteArray())) }?.toSet()
            ?: emptySet()
    }

    @Command
    fun runtimeInfo(invoke: Invoke) {
        try {
            val info = installedPackage()
            val result = JSObject()
            result.put("packageName", activity.packageName)
            result.put("versionName", info.versionName ?: "")
            result.put("versionCode", versionCode(info))
            result.put("cacheDir", activity.cacheDir.canonicalPath)
            invoke.resolve(result)
        } catch (_: Exception) {
            invoke.reject("Android application details could not be read.")
        }
    }

    @Suppress("DEPRECATION")
    private fun verifyApk(args: InstallApkArgs): File {
        require(args.packageName == activity.packageName) { "Package mismatch" }
        require(args.sha256.matches(Regex("[a-f0-9]{64}"))) { "Checksum invalid" }
        require(args.size in 1..(512L * 1024L * 1024L)) { "Size invalid" }
        require(args.versionCode > 0 && args.versionName.isNotBlank()) { "Version invalid" }
        val root = File(activity.cacheDir, "harbor-updates").canonicalFile
        val expected = File(root, "${args.sha256}.apk")
        val apk = File(args.path).canonicalFile
        require(apk == expected && apk.parentFile == root && apk.isFile) { "Cache path invalid" }
        require(apk.length() == args.size) { "Size mismatch" }
        val hash = MessageDigest.getInstance("SHA-256")
        // Tauri dispatches commands on the main thread; all file I/O and archive
        // parsing here runs on the dedicated worker before returning to the UI.
        apk.inputStream().buffered().use { input ->
            val buffer = ByteArray(64 * 1024)
            var bytes = 0L
            while (true) {
                val count = input.read(buffer)
                if (count < 0) break
                bytes += count
                require(bytes <= args.size) { "Size changed" }
                hash.update(buffer, 0, count)
            }
            require(bytes == args.size) { "Size changed" }
        }
        require(hex(hash.digest()) == args.sha256) { "Checksum mismatch" }
        val candidate = activity.packageManager.getPackageArchiveInfo(apk.path, signatureFlags())
            ?: throw IllegalArgumentException("APK could not be inspected")
        val installed = installedPackage()
        require(UpdateValidation.identityMatches(candidate.packageName, activity.packageName,
            candidate.versionName, args.versionName, versionCode(candidate), args.versionCode, versionCode(installed))) {
            "APK identity or version mismatch"
        }
        require(UpdateValidation.signersMatch(signerDigests(installed), signerDigests(candidate))) {
            "APK signing certificate mismatch"
        }
        return apk
    }

    private fun resolveStatus(invoke: Invoke, status: String) {
        val result = JSObject()
        result.put("status", status)
        invoke.resolve(result)
    }

    @Command
    fun installApk(invoke: Invoke) {
        if (!installing.compareAndSet(false, true)) {
            invoke.reject("Another installation request is still being checked.")
            return
        }
        val args = try {
            invoke.parseArgs(InstallApkArgs::class.java)
        } catch (_: Exception) {
            installing.set(false)
            invoke.reject("The installation request is invalid.")
            return
        }
        worker.execute {
            val apk = try {
                verifyApk(args)
            } catch (_: Exception) {
                installing.set(false)
                invoke.reject("The APK identity, version, checksum, or signing certificate did not pass verification.")
                return@execute
            }
            activity.runOnUiThread {
                try {
                    check(!activity.isFinishing && !activity.isDestroyed) { "Activity closed" }
                    if (Build.VERSION.SDK_INT >= 26 && !activity.packageManager.canRequestPackageInstalls()) {
                        val permission = Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                            Uri.parse("package:${activity.packageName}"))
                        activity.startActivity(permission)
                        // The user returns to Harbor and explicitly clicks Install again.
                        // Permission approval never starts installation automatically.
                        resolveStatus(invoke, "permissionRequired")
                    } else {
                        val uri = FileProvider.getUriForFile(activity, "${activity.packageName}.harbor.updates", apk)
                        val installer = Intent(Intent.ACTION_VIEW).apply {
                            setDataAndType(uri, "application/vnd.android.package-archive")
                            clipData = ClipData.newRawUri("Warren update", uri)
                            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                        }
                        activity.startActivity(installer)
                        // Opening the system dialog is not proof that installation completed.
                        resolveStatus(invoke, "installerOpened")
                    }
                } catch (_: Exception) {
                    invoke.reject("Android could not open the installation or permission dialog.")
                } finally {
                    installing.set(false)
                }
            }
        }
    }
}
