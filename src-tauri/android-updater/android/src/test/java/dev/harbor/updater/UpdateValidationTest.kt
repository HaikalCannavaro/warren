package dev.harbor.updater

import org.junit.Assert.*
import org.junit.Test

class UpdateValidationTest {
    @Test fun rejectsMismatchedPackageVersionOrDowngrade() {
        assertTrue(UpdateValidation.identityMatches("dev.harbor.workspace", "dev.harbor.workspace", "0.2.1", "0.2.1", 2001, 2001, 2000))
        assertFalse(UpdateValidation.identityMatches("evil.app", "dev.harbor.workspace", "0.2.1", "0.2.1", 2001, 2001, 2000))
        assertFalse(UpdateValidation.identityMatches("dev.harbor.workspace", "dev.harbor.workspace", "0.2.0", "0.2.1", 2001, 2001, 2000))
        assertFalse(UpdateValidation.identityMatches("dev.harbor.workspace", "dev.harbor.workspace", "0.2.1", "0.2.1", 2000, 2001, 2000))
        assertFalse(UpdateValidation.identityMatches("dev.harbor.workspace", "dev.harbor.workspace", "0.2.1", "0.2.1", 2001, 2001, 2001))
    }

    @Test fun requiresExactNonemptySignerSet() {
        assertTrue(UpdateValidation.signersMatch(setOf("a", "b"), setOf("b", "a")))
        assertFalse(UpdateValidation.signersMatch(setOf("a"), setOf("b")))
        assertFalse(UpdateValidation.signersMatch(emptySet(), emptySet()))
        assertFalse(UpdateValidation.signersMatch(setOf("a", "b"), setOf("a")))
    }
}
