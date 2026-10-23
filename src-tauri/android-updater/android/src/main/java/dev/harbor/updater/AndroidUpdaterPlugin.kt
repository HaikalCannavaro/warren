package dev.harbor.updater

import android.app.Activity
import android.content.ClipData
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import android.view.View
import android.webkit.WebView
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.fragment.app.FragmentActivity
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.io.File
import java.security.KeyStore
import java.security.MessageDigest
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

@InvokeArg
class InstallApkArgs {
    lateinit var path: String
    lateinit var packageName: String
    lateinit var versionName: String
    lateinit var sha256: String
    var versionCode: Long = 0
    var size: Long = 0
}

@InvokeArg
class EnrollBiometricArgs {
    var password: String = ""
}

@InvokeArg
class UnlockBiometricArgs {
    var title: String = "Unlock Warren"
    var subtitle: String = "Verify your fingerprint to open your workspace"
    var cancelText: String = "Use password"
}

@TauriPlugin
class AndroidUpdaterPlugin(private val activity: Activity) : Plugin(activity) {
    private val worker = Executors.newSingleThreadExecutor { task ->
        Thread(task, "harbor-update-verifier").apply { isDaemon = true }
    }
    private val installing = AtomicBoolean(false)
    private val biometricPrefsName = "warren.biometric.v1"
    private val biometricKeyAlias = "warren.vault.biometric.v1"
    private val prefCiphertext = "ciphertext"
    private val prefIv = "iv"

    override fun load(webView: WebView) {
        super.load(webView)
        activity.runOnUiThread {
            try {
                val window = activity.window
                val bgColor = Color.parseColor("#0c131f")
                @Suppress("DEPRECATION")
                run {
                    window.statusBarColor = bgColor
                    window.navigationBarColor = bgColor
                }
                val controller = WindowInsetsControllerCompat(window, window.decorView)
                controller.isAppearanceLightStatusBars = false
                controller.isAppearanceLightNavigationBars = false
                val rootView = activity.findViewById<View>(android.R.id.content) ?: webView
                rootView.setBackgroundColor(bgColor)
                ViewCompat.setOnApplyWindowInsetsListener(rootView) { view, windowInsets ->
                    val insets = windowInsets.getInsets(
                        WindowInsetsCompat.Type.systemBars() or
                            WindowInsetsCompat.Type.displayCutout() or
                            WindowInsetsCompat.Type.ime()
                    )
                    view.setPadding(insets.left, insets.top, insets.right, insets.bottom)
                    WindowInsetsCompat.CONSUMED
                }
                ViewCompat.requestApplyInsets(rootView)
            } catch (_: Exception) {
            }
        }
    }

    private fun biometricPrefs() =
        activity.getSharedPreferences(biometricPrefsName, Context.MODE_PRIVATE)

    private fun hasSavedCiphertextAndKey(): Boolean {
        return try {
            val prefs = biometricPrefs()
            val ct = prefs.getString(prefCiphertext, null)
            val iv = prefs.getString(prefIv, null)
            if (ct.isNullOrBlank() || iv.isNullOrBlank()) return false
            val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
            keyStore.containsAlias(biometricKeyAlias)
        } catch (_: Exception) {
            false
        }
    }

    private fun getOrCreateSecretKey(): SecretKey {
        val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        val existing = keyStore.getKey(biometricKeyAlias, null) as? SecretKey
        if (existing != null) return existing
        val keyGenerator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        val spec = KeyGenParameterSpec.Builder(
            biometricKeyAlias,
            KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
        )
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256)
            .build()
        keyGenerator.init(spec)
        return keyGenerator.generateKey()
    }

    private fun clearBiometricStorage() {
        try {
            biometricPrefs().edit().clear().apply()
        } catch (_: Exception) {
        }
        try {
            val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
            if (keyStore.containsAlias(biometricKeyAlias)) {
                keyStore.deleteEntry(biometricKeyAlias)
            }
        } catch (_: Exception) {
        }
    }

    @Command
    fun biometricStatus(invoke: Invoke) {
        try {
            val manager = BiometricManager.from(activity)
            val authenticators = BiometricManager.Authenticators.BIOMETRIC_STRONG or BiometricManager.Authenticators.BIOMETRIC_WEAK
            val res = manager.canAuthenticate(authenticators)
            val available = res == BiometricManager.BIOMETRIC_SUCCESS || res == BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED
            val enrolled = res == BiometricManager.BIOMETRIC_SUCCESS
            val enabled = enrolled && hasSavedCiphertextAndKey()
            val result = JSObject()
            result.put("available", available)
            result.put("enrolled", enrolled)
            result.put("enabled", enabled)
            invoke.resolve(result)
        } catch (_: Exception) {
            val result = JSObject()
            result.put("available", false)
            result.put("enrolled", false)
            result.put("enabled", false)
            invoke.resolve(result)
        }
    }

    @Command
    fun enrollBiometric(invoke: Invoke) {
        val args = try {
            invoke.parseArgs(EnrollBiometricArgs::class.java)
        } catch (_: Exception) {
            invoke.reject("Invalid biometric enrollment arguments.")
            return
        }
        if (args.password.length < 12) {
            invoke.reject("Master password must be at least 12 characters.")
            return
        }
        try {
            val secretKey = getOrCreateSecretKey()
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.ENCRYPT_MODE, secretKey)
            val iv = cipher.iv
            val plainBytes = args.password.toByteArray(Charsets.UTF_8)
            val ciphertext = cipher.doFinal(plainBytes)
            plainBytes.fill(0)
            biometricPrefs().edit()
                .putString(prefCiphertext, Base64.encodeToString(ciphertext, Base64.NO_WRAP))
                .putString(prefIv, Base64.encodeToString(iv, Base64.NO_WRAP))
                .apply()
            val result = JSObject()
            result.put("enabled", true)
            invoke.resolve(result)
        } catch (_: Exception) {
            clearBiometricStorage()
            invoke.reject("Could not enroll biometric unlock on this device.")
        }
    }

    @Command
    fun unlockBiometric(invoke: Invoke) {
        val args = try {
            invoke.parseArgs(UnlockBiometricArgs::class.java)
        } catch (_: Exception) {
            UnlockBiometricArgs()
        }
        if (!hasSavedCiphertextAndKey()) {
            invoke.reject("Biometric unlock is not configured yet. Unlock with your master password first.")
            return
        }
        val fragmentActivity = activity as? FragmentActivity
        if (fragmentActivity == null) {
            invoke.reject("Biometric prompt requires a compatible Android activity.")
            return
        }
        activity.runOnUiThread {
            try {
                check(!activity.isFinishing && !activity.isDestroyed) { "Activity closed" }
                val resolved = AtomicBoolean(false)
                val executor = ContextCompat.getMainExecutor(activity)
                val prompt = BiometricPrompt(
                    fragmentActivity,
                    executor,
                    object : BiometricPrompt.AuthenticationCallback() {
                        override fun onAuthenticationSucceeded(authResult: BiometricPrompt.AuthenticationResult) {
                            if (!resolved.compareAndSet(false, true)) return
                            try {
                                val prefs = biometricPrefs()
                                val ctBase64 = prefs.getString(prefCiphertext, null)
                                val ivBase64 = prefs.getString(prefIv, null)
                                require(!ctBase64.isNullOrBlank() && !ivBase64.isNullOrBlank()) { "Missing stored credentials" }
                                val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
                                val secretKey = keyStore.getKey(biometricKeyAlias, null) as? SecretKey
                                    ?: throw IllegalStateException("Missing keystore key")
                                val cipher = Cipher.getInstance("AES/GCM/NoPadding")
                                val iv = Base64.decode(ivBase64, Base64.NO_WRAP)
                                val ciphertext = Base64.decode(ctBase64, Base64.NO_WRAP)
                                cipher.init(Cipher.DECRYPT_MODE, secretKey, GCMParameterSpec(128, iv))
                                val decryptedBytes = cipher.doFinal(ciphertext)
                                val password = String(decryptedBytes, Charsets.UTF_8)
                                decryptedBytes.fill(0)
                                val out = JSObject()
                                out.put("password", password)
                                invoke.resolve(out)
                            } catch (_: Exception) {
                                clearBiometricStorage()
                                invoke.reject("Biometric key expired. Unlock once with your master password to re-enable fingerprint unlock.")
                            }
                        }

                        override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                            if (!resolved.compareAndSet(false, true)) return
                            invoke.reject(errString.toString().ifBlank { "Biometric authentication cancelled." })
                        }
                    }
                )
                val promptInfo = BiometricPrompt.PromptInfo.Builder()
                    .setTitle(args.title.ifBlank { "Unlock Warren" })
                    .setSubtitle(args.subtitle.ifBlank { "Verify your fingerprint to open your workspace" })
                    .setNegativeButtonText(args.cancelText.ifBlank { "Use password" })
                    .setAllowedAuthenticators(
                        BiometricManager.Authenticators.BIOMETRIC_STRONG or
                            BiometricManager.Authenticators.BIOMETRIC_WEAK
                    )
                    .build()
                prompt.authenticate(promptInfo)
            } catch (_: Exception) {
                invoke.reject("Android could not open the biometric prompt.")
            }
        }
    }

    @Command
    fun clearBiometric(invoke: Invoke) {
        clearBiometricStorage()
        val result = JSObject()
        result.put("enabled", false)
        invoke.resolve(result)
    }

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
