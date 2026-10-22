// Release tooling is separate from runtime updater verification.
export function validateRepository(repository){
  if(typeof repository!=='string'||!/^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9_.-]+$/.test(repository)||['.','..'].includes(repository.split('/')[1]))throw new Error('Isi repository sebagai OWNER/REPO tanpa URL, spasi, atau token.');
  return repository;
}
export function versionCode(version){
  if(!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version))throw new Error('Gunakan versi stabil MAJOR.MINOR.PATCH, tanpa awalan v atau prerelease.');
  const [major,minor,patch]=version.split('.').map(Number);
  const code=major*1000000+minor*1000+patch;
  if(minor>=1000||patch>=1000||!Number.isSafeInteger(code)||code<1||code>2100000000)throw new Error('Versi tidak dapat dipetakan ke versionCode Android yang unik.');
  return code;
}
export function createReleaseConfig(repository,publicKey,version){
  validateRepository(repository);const code=versionCode(version);
  const key=publicKey.trim();const decoded=Buffer.from(key,'base64').toString('utf8');
  const lines=decoded.trim().split(/\r?\n/);const packet=Buffer.from(lines[1]||'','base64');
  if(!/^[A-Za-z0-9+/]+={0,2}$/.test(key)||lines.length!==2||!lines[0].startsWith('untrusted comment:')||/private|secret/i.test(lines[0])||packet.length!==42||packet.subarray(0,2).toString()!=='Ed')throw new Error('Gunakan isi file public key .pub keluaran Tauri signer, bukan private key.');
  const base=`https://github.com/${repository}/releases/latest/download`;
  return {bundle:{createUpdaterArtifacts:true,android:{versionCode:code}},plugins:{updater:{pubkey:key,endpoints:[`${base}/latest.json`],requireSignedVersion:true,allowDowngrades:false,windows:{installMode:'passive'}},'harbor-android-updater':{pubkey:key,endpoint:`${base}/android.json`}}};
}
export function releaseMetadata({repository,version,notes='',publishedAt,windows,android}){
  validateRepository(repository);const code=versionCode(version);
  if(!windows&&!android)throw new Error('Sertakan minimal satu artifact rilis.');
  if(typeof notes!=='string'||Buffer.byteLength(notes)>8000||!Number.isFinite(Date.parse(publishedAt)))throw new Error('Catatan rilis atau tanggal tidak valid.');
  const base=`https://github.com/${repository}/releases/download/v${version}`;
  const result={};
  if(windows){
    if(typeof windows.signature!=='string'||!windows.signature.trim())throw new Error('Signature installer Windows wajib diisi.');
    result.windows={version,notes,pub_date:publishedAt,platforms:{'windows-x86_64':{url:`${base}/Warren-${version}-windows-x64-setup.exe`,signature:windows.signature.trim()}}};
  }
  if(android){
    if(!Number.isSafeInteger(android.size)||android.size<1||android.size>536870912||!/^[a-f0-9]{64}$/.test(android.sha256))throw new Error('Ukuran atau SHA256 APK tidak valid.');
    result.android={schemaVersion:1,packageName:'dev.harbor.workspace',version,versionCode:code,url:`${base}/Warren-${version}-android.apk`,sha256:android.sha256,size:android.size,notes,publishedAt};
  }
  return result;
}
