import { useT } from '../i18n'

export function Welcome({ onStart }: { onStart: () => void }) {
  const t = useT()
  return (
    <section className="card welcome">
      <div className="card-body">
        <h1>{t('welcome.title')}</h1>
        <p>{t('welcome.intro')}</p>
        <ol className="steps">
          <li>{t('welcome.step1')}</li>
          <li>{t('welcome.step2')}</li>
          <li>{t('welcome.step3')}</li>
        </ol>
        <p className="muted">{t('privacy')}</p>
        <button type="button" className="btn btn-primary btn-lg" onClick={onStart}>
          {t('welcome.start')}
        </button>
      </div>
    </section>
  )
}
