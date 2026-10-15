import { useId } from 'react'
import {
  AUDIO_FORMATS, AUDIO_TAGS, CAPTION_MODES, CODECS, DOWNLOAD_TYPES, SUBTITLE_LANGUAGES, type DownloadType, type Option,
} from '../lib/catalog'
import { audioHasTags, formatsFor, normalizeForm, qualitiesFor, switchType, type FormValues } from '../lib/form'
import { useT } from '../i18n'

function Select(p: { label: string; value: string; options: Option[]; onChange: (v: string) => void }) {
  const id = useId()
  return (
    <div className="field">
      <label htmlFor={id}>{p.label}</label>
      <select id={id} className="control" value={p.value} onChange={(e) => p.onChange(e.target.value)}>
        {p.options.map((o) => (
          <option key={o.id} value={o.id}>{o.text}</option>
        ))}
      </select>
    </div>
  )
}

/** Champs Type + options dépendant du type, comme MeTube. Réutilisé pour les valeurs par défaut des réglages. */
export function OptionFields<T extends FormValues>(p: { form: T; defaults: FormValues; onChange: (f: T) => void }) {
  const t = useT()
  const langListId = useId()
  const langId = useId()
  const { form } = p
  const set = (patch: Partial<FormValues>) => p.onChange(normalizeForm({ ...form, ...patch }))
  const formats = formatsFor(form.type)
  const qualities = qualitiesFor(form.type, form.format)
  return (
    <div className="option-grid">
      <Select
        label={t('type')}
        value={form.type}
        options={DOWNLOAD_TYPES}
        onChange={(v) => p.onChange(switchType(form, v as DownloadType, p.defaults))}
      />
      {form.type === 'video' && (
        <>
          <Select label={t('format')} value={form.format} options={formats} onChange={(v) => set({ format: v })} />
          <Select label={t('quality')} value={form.quality} options={qualities} onChange={(v) => set({ quality: v })} />
          <Select label={t('codec')} value={form.codec} options={CODECS} onChange={(v) => set({ codec: v })} />
        </>
      )}
      {form.type === 'audio' && (
        <>
          <Select label={t('format')} value={form.format} options={AUDIO_FORMATS} onChange={(v) => set({ format: v })} />
          <Select label={t('quality')} value={form.quality} options={qualities} onChange={(v) => set({ quality: v })} />
          {audioHasTags(form.format) && (
            <Select label={t('tags')} value={form.audioTags} options={AUDIO_TAGS} onChange={(v) => set({ audioTags: v })} />
          )}
        </>
      )}
      {form.type === 'captions' && (
        <>
          <Select label={t('format')} value={form.format} options={formats} onChange={(v) => set({ format: v })} />
          <Select label={t('mode')} value={form.subtitleMode} options={CAPTION_MODES} onChange={(v) => set({ subtitleMode: v })} />
          <div className="field">
            <label htmlFor={langId}>{t('language')}</label>
            <input
              id={langId}
              className="control"
              list={langListId}
              value={form.subtitleLanguage}
              maxLength={35}
              autoCapitalize="off"
              spellCheck={false}
              onChange={(e) => set({ subtitleLanguage: e.target.value.trim() })}
            />
            <datalist id={langListId}>
              {SUBTITLE_LANGUAGES.map((o) => (
                <option key={o.id} value={o.id}>{o.text}</option>
              ))}
            </datalist>
          </div>
        </>
      )}
    </div>
  )
}
