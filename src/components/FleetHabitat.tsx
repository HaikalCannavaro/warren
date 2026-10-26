import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { CirclePause, CirclePlay, Clock3, ClipboardCheck, Flag, Hourglass, Leaf, Moon, Rabbit, Radio, Sprout } from 'lucide-react';
import { FLEET_AGENTS, type FleetAgent, type FleetState } from '../lib/observer';
import { FLEET_ROLES, FLEET_SPECIALISTS, ORCHESTRATOR } from '../lib/fleet';
import { useI18n } from '../lib/i18n';
import { Dialog } from './Dialog';
import { FleetRabbit, type RabbitPose } from './FleetRabbit';
import { HabitatTunnels } from './HabitatTunnels';
import '../fleet-habitat.css';

export const HABITAT_STALE_MS = 60000;

export function FleetHabitat({ roster, sourceName, connected, updatedAt, error, loading }: {
  roster: FleetState[] | null; sourceName: string | null; connected: boolean;
  updatedAt: number | null; error: boolean; loading: boolean;
}) {
  const { t, locale } = useI18n();
  const root = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<FleetAgent | null>(null);
  const [paused, setPaused] = useState(false);
  const [visible, setVisible] = useState(() => document.visibilityState !== 'hidden');
  const [inView, setInView] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const visibility = () => { setVisible(document.visibilityState !== 'hidden'); setNow(Date.now()); };
    document.addEventListener('visibilitychange', visibility);
    const motion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const changeMotion = () => setReducedMotion(motion?.matches ?? false);
    motion?.addEventListener('change', changeMotion);
    const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(entries => setInView(entries.some(entry => entry.isIntersecting)), { threshold: 0 });
    if (root.current) observer?.observe(root.current);
    return () => { document.removeEventListener('visibilitychange', visibility); motion?.removeEventListener('change', changeMotion); observer?.disconnect(); };
  }, []);
  useEffect(() => {
    setNow(Date.now());
    if (updatedAt === null || !visible) return;
    const timer = window.setInterval(() => setNow(Date.now()), 10000);
    return () => window.clearInterval(timer);
  }, [updatedAt, visible]);
  const stale = roster !== null && (!connected || error || updatedAt === null || now - updatedAt >= HABITAT_STALE_MS);
  const animationPaused = paused || !visible || !inView || reducedMotion || stale || loading || roster === null || selected !== null;
  const poseFor = (agent: FleetAgent): RabbitPose => roster?.find(item => item.agent === agent)?.state ?? 'unknown';
  const statusFor = (pose: RabbitPose) => pose === 'working' ? 'WORKING' : pose === 'review' ? 'IN REVIEW' : pose === 'blocked' ? 'BLOCKED' : pose === 'queued' ? 'QUEUED' : pose === 'idle' ? 'IDLE' : t('AWAITING DATA', 'MENUNGGU DATA');
  const actionFor = (pose: RabbitPose) => pose === 'working' ? t('Carrot break on the job', 'Makan wortel sambil bekerja') : pose === 'idle' ? t('Resting until the next task', 'Tidur sambil menunggu tugas') : pose === 'review' ? t('A little reading before review', 'Membaca sambil menunggu review') : pose === 'blocked' ? t('Waiting for a helping paw', 'Menunggu bantuan untuk lanjut') : pose === 'queued' ? t('Ready and waiting for dispatch', 'Siap dan menunggu giliran dispatch') : t('Waiting for the orchestrator', 'Menunggu data orkestrator');
  const selectedState = roster?.find(item => item.agent === selected);
  const selectedPose = selected ? poseFor(selected) : 'unknown';
  const clock = updatedAt === null ? '—' : new Intl.DateTimeFormat(locale, { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(updatedAt).replace(/\./g, ':');
  return <>
    <div ref={root} className="fleet-habitat" data-motion={animationPaused ? 'paused' : 'running'} data-freshness={stale ? 'stale' : roster === null ? 'unknown' : 'current'} inert={selected !== null}>
      <div className="habitat-intro"><div><span className="habitat-eyebrow"><Sprout size={13}/>{t('INSIDE THE WARREN', 'DI DALAM WARREN')}</span><h3>{t('A home for every agent.', 'Sarang untuk setiap agen.')}</h3><p>{t('Little rabbits. Real work. One connected burrow.', 'Kelinci kecil, pekerjaan nyata, satu sarang bersama.')}</p></div><div className="habitat-controls"><span className={`habitat-data-state ${stale ? 'is-stale' : ''}`}><i/>{stale ? t('STALE DATA', 'DATA KEDALUWARSA') : roster === null ? t('AWAITING DATA', 'MENUNGGU DATA') : loading ? t('REFRESHING', 'MEMPERBARUI') : t('FLEET CONNECTED', 'ARMADA TERHUBUNG')}</span><button type="button" className="habitat-motion-button" aria-pressed={paused} disabled={reducedMotion} onClick={() => setPaused(value => !value)} title={reducedMotion ? t('Reduced motion follows your device preference.', 'Gerakan dikurangi sesuai pengaturan perangkat.') : undefined}>{paused || reducedMotion ? <CirclePlay size={16}/> : <CirclePause size={16}/>}<span>{reducedMotion ? t('Reduced motion', 'Gerakan dikurangi') : paused ? t('Resume motion', 'Lanjutkan animasi') : t('Pause motion', 'Jeda animasi')}</span></button></div></div>
      <div className="habitat-world">
        <div className="habitat-landscape" aria-hidden="true"><span className="habitat-moon"/><span className="habitat-hill hill-back"/><span className="habitat-hill hill-front"/><span className="habitat-tree tree-one"/><span className="habitat-tree tree-two"/><span className="habitat-star star-one"/><span className="habitat-star star-two"/><span className="habitat-surface-label"><Leaf size={12}/> THE WARREN</span></div>
        <div className="habitat-earth">
          <HabitatTunnels/>
          <div className="habitat-residents" role="group" aria-label={t('Fleet rabbits', 'Kelinci armada')}>{FLEET_AGENTS.map((agent, index) => {
            const pose = poseFor(agent);
            const tasks = roster?.find(item => item.agent === agent)?.tasks ?? [];
            return <article key={agent} className={`habitat-resident peer-${agent.toLowerCase()} ${agent === ORCHESTRATOR ? 'is-orchestrator' : 'is-specialist'}`} style={{ '--rabbit-delay': `${index * -.37}s` } as CSSProperties}>
              {agent === ORCHESTRATOR && <span className="habitat-leader-label">{t('1 ORCHESTRATOR', '1 ORKESTRATOR')} · {FLEET_SPECIALISTS.length} {t('SPECIALISTS', 'SPESIALIS')}</span>}
              <button type="button" className="habitat-rabbit-button" aria-label={`${agent.toUpperCase()} · ${statusFor(pose)}${stale ? ` · ${t('last known status', 'status terakhir')}` : ''}`} onClick={() => setSelected(agent)}>
                <FleetRabbit pose={pose} leader={agent === ORCHESTRATOR}/><span className="habitat-nameplate"><strong>{agent.toUpperCase()}</strong><span className={`habitat-resident-status state-${pose}`}><i/>{statusFor(pose)}</span></span>
              </button>
              {agent !== ORCHESTRATOR && <span className="habitat-role">{t(...FLEET_ROLES[agent].label)}{tasks.length > 1 && <span> · {tasks.length} {t('tasks','tugas')}</span>}</span>}
            </article>;
          })}</div>
          <div className="habitat-soil-detail" aria-hidden="true"><span/><span/><span/></div>
        </div>
      </div>
      <div className="habitat-legend"><span><Flag size={14}/>{t('Blocked → asking for help','Blocked → butuh bantuan')}</span><span><Leaf size={14}/>{t('Working → eating', 'Bekerja → makan')}</span><span><ClipboardCheck size={14}/>{t('Review → reading','Review → membaca')}</span><span><Hourglass size={14}/>{t('Queued → waiting','Antre → menunggu')}</span><span><Moon size={14}/>{t('Idle → sleeping', 'Idle → tidur')}</span><span className="habitat-tap-hint"><Rabbit size={14}/>{t('Tap a rabbit to meet the agent', 'Ketuk kelinci untuk melihat agen')}</span></div>
      {stale && <p className="habitat-stale-note" role="status">{t('Showing the last known fleet. Motion is paused until fresh data arrives.', 'Menampilkan status armada terakhir. Animasi dijeda sampai data baru diterima.')}</p>}
    </div>
    {selected && <Dialog title={selected.toUpperCase()} description={t(...FLEET_ROLES[selected].title)} onClose={() => setSelected(null)}>
      <div className={`habitat-agent-detail peer-${selected.toLowerCase()}`}>
        <div className="habitat-detail-portrait" data-motion="paused"><FleetRabbit pose={selectedPose} leader={selected === ORCHESTRATOR}/><div><span className={`habitat-resident-status state-${selectedPose}`}><i/>{statusFor(selectedPose)}</span><p>{actionFor(selectedPose)}</p></div></div>
        <p className="habitat-detail-role">{t(...FLEET_ROLES[selected].scope)}</p>
        {(stale || roster === null) && <p className="habitat-stale-note">{stale ? t('Last known status. Refresh the orchestrator to confirm current work.', 'Status terakhir. Muat ulang orkestrator untuk memastikan pekerjaan saat ini.') : t('Connect the orchestrator to see this agent’s tasks.', 'Hubungkan orkestrator untuk melihat tugas agen ini.')}</p>}
        <div className="habitat-detail-tasks"><h3>{t('Assigned work', 'Pekerjaan agen')} <span>{selectedState?.tasks.length ?? '—'}</span></h3>{selectedState?.tasks.length ? <ul>{selectedState.tasks.map((task, index) => <li key={`${task.title}-${index}`}><span className={`habitat-resident-status state-${task.status === 'running' ? 'working' : ['ready','todo','scheduled'].includes(task.status) ? 'queued' : task.status}`}><i/>{task.status.toUpperCase()}</span><p>{task.title}</p></li>)}</ul> : <p>{selectedState ? t('Ready for dispatch. A quiet moment in the burrow.', 'Siap menerima tugas. Saatnya beristirahat di sarang.') : t('No confirmed task data yet.', 'Belum ada data tugas yang terkonfirmasi.')}</p>}</div>
        <div className="habitat-detail-source"><span><Radio size={13}/>{sourceName ?? t('No orchestrator selected', 'Belum memilih orkestrator')}</span><span><Clock3 size={13}/>{clock} WIB</span></div>
      </div>
    </Dialog>}
  </>;
}
