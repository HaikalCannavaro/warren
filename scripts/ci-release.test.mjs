import test from 'node:test';
import assert from 'node:assert/strict';
import { validateReleaseIdentity, parseGitHubResponse } from './ci-release.mjs';

const identity = () => ({ version: '0.2.1', tag: 'v0.2.1', head: 'a'.repeat(40), tagCommit: 'a'.repeat(40), latestTag: 'v0.2.0', existingRelease: false });

test('accepts a new version on the exact tagged commit', () => {
  assert.equal(validateReleaseIdentity(identity()), '0.2.1');
});

test('rejects republishing an existing release including a draft', () => {
  assert.throws(() => validateReleaseIdentity({ ...identity(), existingRelease: true }), /already exists/);
});

test('rejects the same version and downgrades compared with the latest stable release', () => {
  for (const latestTag of ['v0.2.1', 'v0.3.0', 'v1.0.0']) {
    assert.throws(() => validateReleaseIdentity({ ...identity(), latestTag }), /newer/);
  }
});

test('compares versions numerically instead of lexicographically', () => {
  assert.equal(validateReleaseIdentity({ ...identity(), version: '0.10.0', tag: 'v0.10.0', latestTag: 'v0.9.9' }), '0.10.0');
});

test('rejects mismatched or non-version tags and moved tags', () => {
  for (const tag of ['main', 'v0.2.0', 'v0.2.1-beta', 'v0.2.1;echo nope']) {
    assert.throws(() => validateReleaseIdentity({ ...identity(), tag }), /tag/);
  }
  assert.throws(() => validateReleaseIdentity({ ...identity(), tagCommit: 'b'.repeat(40) }), /commit/);
});

test('permits the first release but rejects unparseable existing release versions', () => {
  assert.equal(validateReleaseIdentity({ ...identity(), latestTag: null }), '0.2.1');
  assert.throws(() => validateReleaseIdentity({ ...identity(), latestTag: 'latest' }), /version|tag/i);
});

test('treats an explicit GitHub 404 as absent while rejecting auth and network failures', () => {
  assert.equal(parseGitHubResponse({ status: 1, stderr: 'gh: Not Found (HTTP 404)', stdout: '{}' }), null);
  for (const stderr of ['gh: Bad credentials (HTTP 401)', 'gh: API rate limit exceeded (HTTP 403)', 'connection timed out']) {
    assert.throws(() => parseGitHubResponse({ status: 1, stderr, stdout: '' }), /GitHub request failed/);
  }
});

test('rejects invalid JSON from GitHub and returns successful data', () => {
  assert.deepEqual(parseGitHubResponse({ status: 0, stdout: '{"tag_name":"v0.2.0"}' }), { tag_name: 'v0.2.0' });
  assert.throws(() => parseGitHubResponse({ status: 0, stdout: '<html>error</html>' }), /JSON/);
});
