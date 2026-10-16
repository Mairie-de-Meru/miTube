import type { Lang, Theme } from '../lib/settings'
import { useT } from '../i18n'

export function Navbar(p: {
  theme: Theme
  lang: Lang
  onTheme: (t: Theme) => void
  onLang: (l: Lang) => void
  /** Absent en mode public (pas de réglages). */
  onSettings?: () => void
}) {
  const t = useT()
  return (
    <header className="navbar">
      <div className="container navbar-inner">
        <a className="brand" href="./">
          <svg className="brand-logo" viewBox="0 0 32 32" width="28" height="28" aria-hidden="true">
            <rect width="32" height="32" rx="6" fill="#dc3545" />
            <path d="M12 9.5v13l11-6.5z" fill="#fff" />
          </svg>
          <span>miTube</span>
        </a>
        <div className="navbar-tools">
          <label className="visually-hidden" htmlFor="nav-theme">{t('theme')}</label>
          <select id="nav-theme" className="nav-select" value={p.theme} onChange={(e) => p.onTheme(e.target.value as Theme)}>
            <option value="auto">{t('theme.auto')}</option>
            <option value="light">{t('theme.light')}</option>
            <option value="dark">{t('theme.dark')}</option>
          </select>
          <label className="visually-hidden" htmlFor="nav-lang">{t('language')}</label>
          <select id="nav-lang" className="nav-select" value={p.lang} onChange={(e) => p.onLang(e.target.value as Lang)}>
            <option value="en">EN</option>
            <option value="fr">FR</option>
          </select>
          {p.onSettings && <button type="button" className="btn btn-nav" onClick={p.onSettings} aria-label={t('settings')} title={t('settings')}>
            <svg viewBox="0 0 16 16" width="18" height="18" fill="currentColor" aria-hidden="true">
              <path d="M8 4.754a3.246 3.246 0 1 0 0 6.492 3.246 3.246 0 0 0 0-6.492M5.754 8a2.246 2.246 0 1 1 4.492 0 2.246 2.246 0 0 1-4.492 0" />
              <path d="M9.796 1.343c-.527-1.79-3.065-1.79-3.592 0l-.094.319a.873.873 0 0 1-1.255.52l-.292-.16c-1.64-.892-3.433.902-2.54 2.541l.159.292a.873.873 0 0 1-.52 1.255l-.319.094c-1.79.527-1.79 3.065 0 3.592l.319.094a.873.873 0 0 1 .52 1.255l-.16.292c-.892 1.64.901 3.434 2.541 2.54l.292-.159a.873.873 0 0 1 1.255.52l.094.319c.527 1.79 3.065 1.79 3.592 0l.094-.319a.873.873 0 0 1 1.255-.52l.292.16c1.64.893 3.434-.902 2.54-2.541l-.159-.292a.873.873 0 0 1 .52-1.255l.319-.094c1.79-.527 1.79-3.065 0-3.592l-.319-.094a.873.873 0 0 1-.52-1.255l.16-.292c.893-1.64-.902-3.433-2.541-2.54l-.292.159a.873.873 0 0 1-1.255-.52zm-2.633.283c.246-.835 1.428-.835 1.674 0l.094.319a1.873 1.873 0 0 0 2.693 1.115l.291-.16c.764-.415 1.6.42 1.184 1.185l-.159.292a1.873 1.873 0 0 0 1.116 2.692l.318.094c.835.246.835 1.428 0 1.674l-.319.094a1.873 1.873 0 0 0-1.115 2.693l.16.291c.415.764-.42 1.6-1.185 1.184l-.291-.159a1.873 1.873 0 0 0-2.693 1.116l-.094.318c-.246.835-1.428.835-1.674 0l-.094-.319a1.873 1.873 0 0 0-2.692-1.115l-.292.16c-.764.415-1.6-.42-1.184-1.185l.159-.291A1.873 1.873 0 0 0 1.945 8.93l-.319-.094c-.835-.246-.835-1.428 0-1.674l.319-.094A1.873 1.873 0 0 0 3.06 4.377l-.16-.292c-.415-.764.42-1.6 1.185-1.184l.292.159a1.873 1.873 0 0 0 2.692-1.115z" />
            </svg>
          </button>}
        </div>
      </div>
    </header>
  )
}
