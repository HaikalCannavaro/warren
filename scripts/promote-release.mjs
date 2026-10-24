import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validateRepository, versionCode } from './release-lib.mjs';
import { validateReleaseBundle } from './validate-release.mjs';

// Compare the bytes actually uploaded to GitHub with the validated local package.
// A missing, additional, or modified asset must leave the release as a draft.
export function verifyUploadedAssets(index, files) {
  validateRepository(index.repository);
  versionCode(index.version);
  const allowed = new Set([
    `Warren-${index.version}-windows-x64-setup.exe`,
    `Warren-${index.version}-windows-x64-setup.exe.sig`, 'latest.json',
    `Warren-${index.version}-android.apk`, 'android.json',
  ]);
  if (!Array.isArray(index.files) || index.files.length !== allowed.size
    || new Set(index.files).size !== allowed.size || index.files.some(name => !allowed.has(name))) {
    throw new Error('Stable publication requires both complete platform packages.');
  }
  if (!(files instanceof Map) || files.size !== allowed.size || [...files.keys()].some(name => !allowed.has(name))) {
    throw new Error('Uploaded release asset set does not match the package.');
  }
  for (const name of allowed) {
    const bytes = files.get(name);
    if (!Buffer.isBuffer(bytes) || bytes.length === 0
      || !/^[a-f0-9]{64}$/.test(index.hashes?.[name] ?? '')
      || createHash('sha256').update(bytes).digest('hex') !== index.hashes[name]) {
      throw new Error('Uploaded release asset hash does not match the package.');
    }
  }
}

export function validateDraft(release, version) {
  if (release?.tagName !== `v${version}` || release.isDraft !== true || release.isPrerelease !== false) {
    throw new Error('Only the expected stable draft can be promoted. Existing releases are not replaced.');
  }
}

async function main() {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const directory = process.argv[2];
  if (!directory) throw new Error('Usage: node scripts/promote-release.mjs release/vVERSION');
  const out = path.resolve(directory);
  const index = JSON.parse(await fs.readFile(path.join(out, 'release-index.json'), 'utf8'));
  const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
  const overlay = JSON.parse(await fs.readFile(path.join(root, 'src-tauri/tauri.release.conf.json'), 'utf8'));
  validateRepository(index.repository);
  versionCode(index.version);
  if (pkg.version !== index.version) throw new Error('Release package version differs from source.');
  const local = new Map(await Promise.all((index.files ?? []).map(async name => {
    if (path.basename(name) !== name) throw new Error('Invalid release filename.');
    return [name, await fs.readFile(path.join(out, name))];
  })));
  verifyUploadedAssets(index, local);
  const notes = await fs.readFile(path.join(out, 'notes.md'), 'utf8');
  if (createHash('sha256').update(notes).digest('hex') !== index.hashes?.['notes.md']) throw new Error('Release notes changed after packaging.');
  const validate = files => validateReleaseBundle({ repository: index.repository, version: index.version, publicKey: overlay.plugins.updater.pubkey, notes, files });
  validate(local);
  const gh = args => {
    const result = spawnSync('gh', args, { cwd: root, encoding: 'utf8', shell: false, timeout: 300000 });
    if (result.error || result.status !== 0) throw new Error('GitHub release verification/publication failed. The release was not confirmed published.');
    return result.stdout;
  };
  const tag = `v${index.version}`;
  const release = () => JSON.parse(gh(['release', 'view', tag, '--repo', index.repository, '--json', 'tagName,isDraft,isPrerelease']));
  validateDraft(release(), index.version);
  const downloaded = await fs.mkdtemp(path.join(os.tmpdir(), 'warren-release-check-'));
  try {
    gh(['release', 'download', tag, '--repo', index.repository, '--dir', downloaded]);
    const remote = new Map(await Promise.all((await fs.readdir(downloaded)).map(async name => [name, await fs.readFile(path.join(downloaded, name))])));
    verifyUploadedAssets(index, remote);
    validate(remote);
    validateDraft(release(), index.version);
    gh(['release', 'edit', tag, '--repo', index.repository, '--draft=false', '--latest']);
    const published = release();
    if (published.tagName !== tag || published.isDraft || published.isPrerelease) throw new Error('GitHub did not confirm stable publication.');
    console.log(`Published verified stable release: https://github.com/${index.repository}/releases/tag/${tag}`);
  } finally {
    await fs.rm(downloaded, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
