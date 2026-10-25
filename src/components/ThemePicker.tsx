import { Check, Palette } from 'lucide-react';
import { setTheme, useTheme, type Theme } from '../lib/theme';
import { useI18n } from '../lib/i18n';

export function ThemePicker() {
  const { t } = useI18n();
  const theme = useTheme();
  const choices: { id: Theme; name: string; description: string; colors: string[] }[] = [
    { id: 'dark', name: 'Warren Dark', description: t('The original Warren palette.', 'Palet asli Warren.'), colors: ['#0C131F', '#152031', '#6BE2C4', '#DCE4EE'] },
    { id: 'terracotta', name: 'Terracotta', description: t('Cream, coral, deep blue & cocoa.', 'Krem, coral, biru tua & cokelat.'), colors: ['#F5EBDD', '#F2765E', '#315B8C', '#413333'] },
  ];
  return <section className="settings-card panel theme-settings"><div className="settings-card-title"><Palette size={21}/><div><h2>{t('Theme', 'Tema')}</h2><p>{t('Choose the colors for your entire workspace.', 'Pilih warna untuk seluruh ruang kerja Anda.')}</p></div></div><div className="theme-choices" role="group" aria-label={t('App theme', 'Tema aplikasi')}>{choices.map(choice => <button type="button" key={choice.id} className={`theme-choice ${choice.id === theme ? 'selected' : ''}`} aria-pressed={choice.id === theme} onClick={() => setTheme(choice.id)}><span className={`theme-preview theme-preview-${choice.id}`} aria-hidden="true"><span className="theme-preview-sidebar"/><span className="theme-preview-main"><i/><i/><i/></span></span><span className="theme-choice-title"><strong>{choice.name}</strong>{choice.id === theme && <Check size={15}/>}</span><span className="theme-choice-description">{choice.description}</span><span className="theme-swatches" aria-label={choice.colors.join(', ')}>{choice.colors.map(color => <i key={color} style={{ backgroundColor: color }} title={color}/>)}</span></button>)}</div><p className="theme-persistence-note">{t('Saved on this device. Your sessions stay open when switching themes.', 'Disimpan di perangkat ini. Sesi tetap berjalan saat tema diganti.')}</p></section>;
}
