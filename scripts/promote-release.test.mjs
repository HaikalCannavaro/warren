import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { verifyUploadedAssets, validateDraft } from './promote-release.mjs';

function fixture() {
  const names = ['Warren-0.3.0-windows-x64-setup.exe', 'Warren-0.3.0-windows-x64-setup.exe.sig', 'latest.json', 'Warren-0.3.0-android.apk', 'android.json'];
  const files = new Map(names.map(name => [name, Buffer.from(`fixture ${name}`)]));
  const hashes = Object.fromEntries([...files].map(([name, bytes]) => [name, createHash('sha256').update(bytes).digest('hex')]));
  return { index: { repository: 'example/warren', version: '0.3.0', files: names, hashes }, files };
}

test('accepts both uploaded platform packages only when their exact hashes match', () => {
  const { index, files } = fixture();
  assert.doesNotThrow(() => verifyUploadedAssets(index, files));
});

test('blocks publication when an upload is missing, truncated, altered, or unexpected', () => {
  for (const alter of [files => files.delete('android.json'), files => files.set('android.json', Buffer.alloc(0)), files => files.set('android.json', Buffer.from('modified')), files => files.set('extra.txt', Buffer.from('unexpected'))]) {
    const { index, files } = fixture();
    alter(files);
    assert.throws(() => verifyUploadedAssets(index, files));
  }
});

test('blocks partial platform releases and duplicate or noncanonical package filenames', () => {
  for (const names of [['android.json', 'Warren-0.3.0-android.apk'], ['../private.key'], Array(5).fill('android.json')]) {
    const { index, files } = fixture();
    index.files = names;
    assert.throws(() => verifyUploadedAssets(index, files));
  }
  const { index, files } = fixture();
  delete index.hashes['latest.json'];
  assert.throws(() => verifyUploadedAssets(index, files));
});

test('refuses to republish stable releases, prereleases, or a different tag', () => {
  const draft = { tagName: 'v0.3.0', isDraft: true, isPrerelease: false };
  assert.doesNotThrow(() => validateDraft(draft, '0.3.0'));
  for (const release of [null, {}, { ...draft, tagName: 'v0.2.3' }, { ...draft, isDraft: false }, { ...draft, isPrerelease: true }]) {
    assert.throws(() => validateDraft(release, '0.3.0'));
  }
});
