package dev.harbor.updater

internal object UpdateValidation {
    fun identityMatches(
        actualPackage: String,
        expectedPackage: String,
        actualVersion: String?,
        expectedVersion: String,
        actualCode: Long,
        expectedCode: Long,
        installedCode: Long,
    ): Boolean = actualPackage == expectedPackage && actualVersion == expectedVersion &&
        actualCode == expectedCode && actualCode > installedCode

    // Certificate rotation is deliberately not accepted by this first version.
    // Android's installer independently validates the APK signature again.
    fun signersMatch(installed: Set<String>, candidate: Set<String>): Boolean =
        installed.isNotEmpty() && installed == candidate
}
