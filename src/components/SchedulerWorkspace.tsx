import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { CalendarClock, Clock3, LoaderCircle, Pencil, Plus, PlugZap, Power, RefreshCw, Search, Server, Trash2 } from 'lucide-react';
import type { TerminalSession, VpsProfile } from '../types';
import { useI18n } from '../lib/i18n';
import { validateCronDraft, type CronJob, type CronJobDraft, type SchedulerRequest, type SchedulerSnapshot } from '../lib/scheduler';
import { schedulerCommand } from '../lib/schedulerClient';
import { Dialog, ConfirmDialog } from './Dialog';
import { SelectMenu } from './SelectMenu';
import '../scheduler.css';

type Editor = { source: string; revision: string; draft: CronJobDraft; preset: string };
const errorText = (cause: unknown) => cause instanceof Error ? cause.message : String(cause);

export function SchedulerWorkspace({ profiles, sessions, onConnect }: {
  profiles: VpsProfile[]; sessions: TerminalSession[]; onConnect: (profileId: string) => Promise<void>;
}) {
  const { t, locale } = useI18n();
  const [profileId, setProfileId] = useState(() => profiles.find(profile => sessions.some(session => session.profileId === profile.id && session.status === 'connected'))?.id ?? profiles[0]?.id ?? '');
  const profile = profiles.find(item => item.id === profileId);
  const endpoint = profile ? `${profile.username}@${profile.host}:${profile.port}` : '';
  // A profile can be edited while an older SSH session remains open. Never
  // present that old connection as the newly configured host or account.
  const session = sessions.find(item => item.profileId === profileId && item.host === endpoint && item.status === 'connected');
  const connecting = sessions.some(item => item.profileId === profileId && item.host === endpoint && item.status === 'connecting');
  const source = `${profileId}:${session?.id ?? 'offline'}`;
  const sourceRef = useRef(source); sourceRef.current = source;
  const mounted = useRef(true); const requestVersion = useRef(0); const mutationLock = useRef(false);
  const [snapshot, setSnapshot] = useState<SchedulerSnapshot | null>(null);
  const [loading, setLoading] = useState(false); const [mutating, setMutating] = useState(false);
  const [needsRefresh, setNeedsRefresh] = useState(false); const [error, setError] = useState('');
  const [notice, setNotice] = useState(''); const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null); const [editorError, setEditorError] = useState('');
  const [deleting, setDeleting] = useState<{ source: string; revision: string; job: CronJob } | null>(null);
  const [query, setQuery] = useState(''); const [connectingNow, setConnectingNow] = useState(false);
  const nameId = useId(); const scheduleId = useId(); const commandId = useId(); const helpId = useId();
  const presets = [
    { value: '*/5 * * * *', label: t('Every 5 minutes', 'Setiap 5 menit') },
    { value: '0 * * * *', label: t('Every hour', 'Setiap jam') },
    { value: '0 0 * * *', label: t('Daily at midnight', 'Setiap hari pukul 00.00') },
    { value: '0 0 * * 0', label: t('Weekly on Sunday', 'Setiap Minggu pukul 00.00') },
    { value: '@reboot', label: t('When the server boots', 'Saat server dinyalakan') },
    { value: 'custom', label: t('Custom schedule', 'Jadwal khusus') },
  ];
  const canWrite = !!session && !!snapshot && !loading && !mutating && !needsRefresh;

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; requestVersion.current++; }; }, []);
  useEffect(() => { if (!profile && profiles.length) setProfileId(profiles[0].id); }, [profile, profiles]);

  const refresh = useCallback(async () => {
    if (!session) return;
    const version = ++requestVersion.current; const readingSource = source;
    setLoading(true);setError('');setNotice('');
    try {
      const result = await schedulerCommand(session.id, { action: 'list' });
      if (!mounted.current || sourceRef.current !== readingSource || requestVersion.current !== version) return;
      setSnapshot(result);setNeedsRefresh(false);setUpdatedAt(Date.now());
    } catch (cause) {
      if (mounted.current && sourceRef.current === readingSource && requestVersion.current === version) {
        setError(errorText(cause));setNeedsRefresh(true);
      }
    } finally {
      if (mounted.current && sourceRef.current === readingSource && requestVersion.current === version) setLoading(false);
    }
  }, [session?.id, source]);

  useEffect(() => {
    requestVersion.current++;setSnapshot(null);setNeedsRefresh(false);setError('');setNotice('');setUpdatedAt(null);setLoading(false);
    setEditor(null);setEditorError('');setDeleting(null);setQuery('');
    if (session) void refresh();
    return () => { requestVersion.current++; };
  }, [source, refresh]);

  const mutate = async (request: SchedulerRequest, expectedSource: string) => {
    if (mutationLock.current || !session || !snapshot || needsRefresh || loading || sourceRef.current !== expectedSource) {
      throw new Error(t('Refresh this host before changing its schedules.', 'Muat ulang host ini sebelum mengubah jadwalnya.'));
    }
    mutationLock.current = true;setMutating(true);setError('');setNotice('');
    const version = ++requestVersion.current; const mutationSource = expectedSource;
    try {
      // Mutations are sent once. Navigating away must not close their SSH channel.
      const result = await schedulerCommand(session.id, request);
      if (mounted.current && sourceRef.current === mutationSource && requestVersion.current === version) {
        setSnapshot(result);setNeedsRefresh(false);setUpdatedAt(Date.now());setEditor(null);setDeleting(null);
        setNotice(t('The server crontab has been updated.', 'Crontab server telah diperbarui.'));
      }
    } catch (cause) {
      const message = `${errorText(cause)} ${t('The change was not confirmed. Close this dialog and refresh this host before trying again.', 'Perubahan belum terkonfirmasi. Tutup dialog ini dan muat ulang host sebelum mencoba kembali.')}`;
      if (mounted.current && sourceRef.current === mutationSource && requestVersion.current === version) {
        setError(message);setNeedsRefresh(true);
      }
      throw new Error(message);
    } finally {
      mutationLock.current = false;
      if (mounted.current) setMutating(false);
    }
  };

  const openEditor = (job?: CronJob) => {
    if (!canWrite || !snapshot) return;
    const draft: CronJobDraft = job ? { ...job } : { name: '', schedule: '0 0 * * *', command: '', enabled: true };
    setEditor({ source, revision: snapshot.revision, draft, preset: presets.some(preset => preset.value === draft.schedule) ? draft.schedule : 'custom' });
    setEditorError('');
  };
  const save = async (event: FormEvent) => {
    event.preventDefault();if (!editor || mutating) return;
    try {
      if (!snapshot || editor.source !== source || editor.revision !== snapshot.revision || needsRefresh) throw new Error(t('Close this dialog and refresh this host before saving.', 'Tutup dialog ini dan muat ulang host sebelum menyimpan.'));
      validateCronDraft(editor.draft);
      await mutate({ action: 'save', revision: editor.revision, job: { ...editor.draft, name: editor.draft.name.trim(), schedule: editor.draft.schedule.trim() } }, editor.source);
    } catch (cause) { if (mounted.current && sourceRef.current === editor.source) setEditorError(errorText(cause)); }
  };
  const updateDraft = (patch: Partial<CronJobDraft>) => setEditor(current => current ? { ...current, draft: { ...current.draft, ...patch } } : null);
  const toggle = async (job: CronJob) => {
    if (!canWrite || !snapshot) return;
    try { await mutate({ action: 'toggle', revision: snapshot.revision, id: job.id, enabled: !job.enabled }, source); } catch { /* Refresh notice remains visible. */ }
  };
  const connect = async () => {
    if (!profile || connectingNow) return;
    setConnectingNow(true);setError('');
    const connectingSource = source;
    try { await onConnect(profile.id); } catch (cause) { if (mounted.current && sourceRef.current === connectingSource) setError(errorText(cause)); }
    finally { if (mounted.current) setConnectingNow(false); }
  };
  const jobs = snapshot?.jobs ?? [];
  const needle = query.trim().toLocaleLowerCase();
  const filtered = jobs.filter(job => `${job.name} ${job.schedule} ${job.command}`.toLocaleLowerCase().includes(needle));

  return <>
    <section className="scheduler-workspace" aria-label="Scheduler" inert={!!editor || !!deleting}>
      <div className="scheduler-source panel">
        <div className="scheduler-identity"><span className="scheduler-icon"><CalendarClock size={23}/></span><div><h2>{t('Server schedules', 'Jadwal server')}</h2><p>{t('Schedule commands on your VPS. Jobs continue when Warren is closed.', 'Jadwalkan perintah di VPS. Jadwal tetap berjalan saat Warren ditutup.')}</p></div></div>
        <label className="scheduler-host"><span>{t('Target host', 'Host tujuan')}</span><SelectMenu label={t('Scheduler target host', 'Host tujuan Scheduler')} value={profileId} options={profiles.map(item => ({ value: item.id, label: item.name, detail: `${item.username}@${item.host}` }))} onValueChange={setProfileId} disabled={!profiles.length || mutating} placeholder={t('Choose a host', 'Pilih host')} minMenuWidth={300}/></label>
      </div>

      <div className="scheduler-toolbar"><div className="scheduler-context"><span className={`scheduler-connection ${session ? 'is-connected' : ''}`}><span/>{session ? t('SSH connected', 'SSH terhubung') : connecting ? t('Connecting', 'Menghubungkan') : t('SSH offline', 'SSH terputus')}</span>{snapshot && <><span><Server size={14}/>{snapshot.username}</span><span><Clock3 size={14}/>{t('Server time', 'Waktu server')}: {snapshot.timezone}</span></>}</div><div className="scheduler-actions"><button className="button secondary" disabled={!session || loading || mutating || !!editor} onClick={() => void refresh()}><RefreshCw size={14} className={loading ? 'scheduler-spin' : ''}/>{t('Refresh', 'Muat ulang')}</button><button className="button primary" disabled={!canWrite} onClick={() => openEditor()}><Plus size={15}/>{t('Add schedule', 'Tambah jadwal')}</button></div></div>

      {error && <div className="scheduler-error" role="alert">{error}</div>}
      {notice && <p className="scheduler-notice" role="status">{notice}</p>}
      {snapshot?.warning && <p className="scheduler-warning">{snapshot.warning}</p>}
      {needsRefresh && <p className="scheduler-refresh-note">{t('Schedule changes are paused until Refresh succeeds.', 'Perubahan jadwal dijeda sampai Muat ulang berhasil.')}</p>}

      {!profile ? <div className="scheduler-empty panel"><Server size={32}/><h3>{t('Choose a server for your schedules', 'Pilih server untuk jadwal Anda')}</h3><p>{t('Add a VPS in Connections, then select it here. Scheduler manages the connected SSH user’s Linux crontab.', 'Tambahkan VPS di Koneksi, lalu pilih di sini. Scheduler mengelola crontab Linux milik pengguna SSH yang terhubung.')}</p></div>
        : !session ? <div className="scheduler-empty panel"><PlugZap size={32}/><h3>{t('Connect to this host', 'Hubungkan ke host ini')}</h3><p>{t('Connect through SSH to read and manage this account’s cron jobs.', 'Hubungkan SSH untuk membaca dan mengelola cron milik akun ini.')} <strong>{profile.name}</strong></p><button className="button primary" disabled={connecting || connectingNow || mutating} onClick={() => void connect()}>{(connecting || connectingNow) && <LoaderCircle size={15} className="scheduler-spin"/>}{t('Connect SSH', 'Hubungkan SSH')}</button></div>
          : loading && !snapshot ? <div className="scheduler-loading panel" role="status"><LoaderCircle size={20} className="scheduler-spin"/><span>{t('Reading the server crontab…', 'Membaca crontab server…')}</span><div/><div/><div/></div>
            : snapshot ? <div className="scheduler-ledger panel" aria-busy={loading || mutating}>
              <div className="scheduler-ledger-heading"><div><h3>{t('Cron jobs', 'Cron jobs')}<span>{jobs.length}</span></h3><p>{t('Current SSH user only. Linux, Python 3 and crontab are required.', 'Hanya pengguna SSH saat ini. Memerlukan Linux, Python 3, dan crontab.')}</p></div><label className="scheduler-search"><Search size={15}/><input aria-label={t('Search schedules', 'Cari jadwal')} placeholder={t('Search schedules…', 'Cari jadwal…')} value={query} onChange={event => setQuery(event.target.value)}/></label></div>
              {!jobs.length ? <div className="scheduler-empty scheduler-empty-inline"><CalendarClock size={29}/><h3>{t('No cron jobs yet', 'Belum ada cron job')}</h3><p>{t('Add a schedule to run a command on this server automatically.', 'Tambahkan jadwal untuk menjalankan perintah secara otomatis di server ini.')}</p></div>
                : !filtered.length ? <p className="scheduler-no-results">{t('No schedules match your search.', 'Tidak ada jadwal yang cocok dengan pencarian.')}</p>
                  : <div className="scheduler-jobs">{filtered.map(job => <article className={`scheduler-job ${job.enabled ? '' : 'is-paused'}`} key={job.id}>
                    <div className="scheduler-job-top"><div className="scheduler-job-title"><h4>{job.name || t('Untitled schedule', 'Jadwal tanpa nama')}</h4><span className={`scheduler-state ${job.enabled ? 'is-active' : ''}`}>{job.enabled ? t('ACTIVE', 'AKTIF') : t('PAUSED', 'NONAKTIF')}</span></div><div className="scheduler-job-actions"><button className="button secondary" role="switch" aria-checked={job.enabled} aria-label={`${t('Enable schedule', 'Aktifkan jadwal')}: ${job.name}`} disabled={!canWrite} onClick={() => void toggle(job)}><Power size={14}/>{job.enabled ? t('Disable', 'Nonaktifkan') : t('Enable', 'Aktifkan')}</button><button className="icon-button" aria-label={`${t('Edit schedule', 'Edit jadwal')}: ${job.name}`} disabled={!canWrite} onClick={() => openEditor(job)}><Pencil size={16}/></button><button className="icon-button" aria-label={`${t('Delete schedule', 'Hapus jadwal')}: ${job.name}`} disabled={!canWrite} onClick={() => snapshot && setDeleting({ source, revision: snapshot.revision, job })}><Trash2 size={16}/></button></div></div>
                    <div className="scheduler-expression"><Clock3 size={14}/><code>{job.schedule}</code><span>{t('Server time', 'Waktu server')}: {snapshot.timezone}</span></div><pre className="scheduler-command"><code>{job.command}</code></pre>
                  </article>)}</div>}
              <footer className="scheduler-footer"><span>{t('Schedules run in the server’s cron environment.', 'Jadwal berjalan dalam lingkungan cron server.')}</span>{updatedAt && <time dateTime={new Date(updatedAt).toISOString()}>{t('Updated', 'Diperbarui')} {new Date(updatedAt).toLocaleTimeString(locale, {hour:'2-digit',minute:'2-digit'})}</time>}</footer>
            </div> : !error ? <p className="scheduler-refresh-note">{t('Refresh to read the server schedules.', 'Muat ulang untuk membaca jadwal server.')}</p> : null}
    </section>

    {editor && <Dialog title={editor.draft.id ? t('Edit schedule', 'Edit jadwal') : t('Add schedule', 'Tambah jadwal')} description={`${t('Changes apply to', 'Perubahan berlaku pada')} ${profile?.name ?? ''} · ${snapshot?.username ?? ''}`} onClose={() => { if (!mutating) { setEditor(null);setEditorError(''); } }} wide>
      <form className="scheduler-form" onSubmit={event => void save(event)}>
        <label htmlFor={nameId}>{t('Schedule name', 'Nama jadwal')}<input id={nameId} required maxLength={120} value={editor.draft.name} disabled={mutating} onChange={event => updateDraft({name:event.target.value})} placeholder={t('Daily log report', 'Laporan log harian')}/></label>
        <label><span>{t('Schedule preset', 'Pilihan jadwal')}</span><SelectMenu label={t('Schedule preset', 'Pilihan jadwal')} value={editor.preset} options={presets} disabled={mutating} onValueChange={value => setEditor(current => current ? {...current,preset:value,draft:{...current.draft,...(value !== 'custom' ? {schedule:value} : {})}} : null)}/></label>
        <label htmlFor={scheduleId}>{t('Cron expression', 'Ekspresi cron')}<input id={scheduleId} required value={editor.draft.schedule} disabled={mutating} onChange={event => setEditor(current => current ? {...current,preset:'custom',draft:{...current.draft,schedule:event.target.value}} : null)} aria-describedby={helpId} spellCheck={false} autoComplete="off"/></label>
        <p id={helpId} className="scheduler-form-note"><code>{t('minute hour day month weekday', 'menit jam tanggal bulan hari')}</code><span>{t('Schedules use the server’s timezone and crontab environment.', 'Jadwal mengikuti zona waktu server dan lingkungan crontab.')} {snapshot?.timezone}</span></p>
        <label htmlFor={commandId}>{t('Command', 'Perintah')}<textarea id={commandId} required rows={4} value={editor.draft.command} disabled={mutating} onChange={event => updateDraft({command:event.target.value})} placeholder="/usr/bin/systemctl status hermes.service" spellCheck={false}/></label>
        <p className="scheduler-form-note"><span>{t('Enter one shell command on one line. Use absolute paths; cron does not use your terminal’s working directory.', 'Masukkan satu perintah shell dalam satu baris. Gunakan path absolut; cron tidak memakai direktori kerja terminal Anda.')}</span><span>{t('Escape a literal percent sign as \\%; cron gives unescaped % a special meaning.', 'Tulis persen literal sebagai \\%; karakter % tanpa escape memiliki arti khusus di cron.')}</span></p>
        <label className="scheduler-enabled"><input type="checkbox" checked={editor.draft.enabled} disabled={mutating} onChange={event => updateDraft({enabled:event.target.checked})}/><span>{t('Enable this schedule', 'Aktifkan jadwal ini')}</span></label>
        {editorError && <p className="inline-error" role="alert">{editorError}</p>}
        <div className="dialog-actions"><button type="button" className="button secondary" disabled={mutating} onClick={() => setEditor(null)}>{t('Cancel', 'Batal')}</button><button type="submit" className="button primary" disabled={mutating || needsRefresh || !snapshot || editor.source !== source}>{mutating && <LoaderCircle size={15} className="scheduler-spin"/>}{t('Save schedule', 'Simpan jadwal')}</button></div>
      </form>
    </Dialog>}
    {deleting && <ConfirmDialog title={t('Delete schedule?', 'Hapus jadwal?')} description={`${deleting.job.name} · ${profile?.name ?? ''}. ${t('This removes the entry from this SSH user’s server crontab.', 'Jadwal ini akan dihapus dari crontab pengguna SSH di server.')}`} confirmLabel={t('Delete schedule', 'Hapus jadwal')} onClose={() => { if (!mutating) setDeleting(null); }} onConfirm={async () => {
      if (!snapshot || deleting.source !== source || deleting.revision !== snapshot.revision || needsRefresh) throw new Error(t('Close this dialog and refresh this host before deleting.', 'Tutup dialog ini dan muat ulang host sebelum menghapus.'));
      await mutate({action:'delete',revision:deleting.revision,id:deleting.job.id},deleting.source);
    }}/>}
  </>;
}
