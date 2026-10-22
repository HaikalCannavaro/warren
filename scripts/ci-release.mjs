import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createReleaseConfig, validateRepository, versionCode } from './release-lib.mjs';

export function validateReleaseIdentity({ version, tag, head, tagCommit, latestTag, existingRelease }) {
  const code = versionCode(version);
  if (tag !== `v${version}`) throw new Error('Release tag must exactly match the application version.');
  if (!/^[a-f0-9]{40}$/.test(head ?? '') || head !== tagCommit) throw new Error('Release tag and checkout must point to the same commit.');
  if (existingRelease) throw new Error('This release already exists. Prepare a new version instead of replacing assets.');
  if (latestTag !== null) {
    if (typeof latestTag !== 'string' || !latestTag.startsWith('v')) throw new Error('Latest release tag is not a supported version.');
    if (code <= versionCode(latestTag.slice(1))) throw new Error('Release version must be newer than the latest published version.');
  }
  return version;
}

export function parseGitHubResponse(result) {
  if (!result.error && result.status === 0) {
    try { return JSON.parse(result.stdout); } catch { throw new Error('GitHub returned invalid JSON.'); }
  }
  if (!result.error && /\(HTTP 404\)/.test(result.stderr ?? '')) return null;
  throw new Error('GitHub request failed. Check token permissions, connectivity, and rate limits.');
}

async function main() {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const tag = process.env.RELEASE_TAG;
  const repository = validateRepository(process.env.GITHUB_REPOSITORY);
  const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
  const config = JSON.parse(await fs.readFile(path.join(root, 'src-tauri/tauri.conf.json'), 'utf8'));
  const cargo = await fs.readFile(path.join(root, 'src-tauri/Cargo.toml'), 'utf8');
  const overlay = JSON.parse(await fs.readFile(path.join(root, 'src-tauri/tauri.release.conf.json'), 'utf8'));
  versionCode(pkg.version);
  if (tag !== `v${pkg.version}`) throw new Error('Release tag must exactly match package.json. Run prepare-release before creating the tag.');
  if (config.version !== pkg.version || cargo.match(/^version\s*=\s*"([^"]+)"/m)?.[1] !== pkg.version) {
    throw new Error('Application versions differ. Run prepare-release before creating the tag.');
  }
  if (config.identifier !== 'dev.harbor.workspace') throw new Error('Keep the existing application identifier for updates.');
  const expected = createReleaseConfig(repository, overlay.plugins?.updater?.pubkey ?? '', pkg.version);
  if (JSON.stringify(overlay) !== JSON.stringify(expected)) throw new Error('Release configuration does not match this version/repository. Run prepare-release first.');
  const git = (...args) => {
    const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', shell: false });
    if (result.error || result.status !== 0) throw new Error('Unable to resolve the release tag commit.');
    return result.stdout.trim();
  };
  const github = endpoint => parseGitHubResponse(spawnSync('gh', ['api', endpoint], { cwd: root, encoding: 'utf8', shell: false }));
  const head = git('rev-parse', 'HEAD');
  const tagCommit = git('rev-parse', `refs/tags/${tag}^{commit}`);
  const existingRelease = github(`repos/${repository}/releases/tags/${tag}`);
  const latest = github(`repos/${repository}/releases/latest`);
  validateReleaseIdentity({ version: pkg.version, tag, head, tagCommit, latestTag: latest?.tag_name ?? null, existingRelease: existingRelease !== null });
  if (process.env.GITHUB_OUTPUT) {
    await fs.appendFile(process.env.GITHUB_OUTPUT, `version=${pkg.version}\ntag=${tag}\ncommit=${head}\n`);
  }
  console.log(`Validated ${tag} at ${head}. Existing releases will not be overwritten.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
