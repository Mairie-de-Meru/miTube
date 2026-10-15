import { useT } from '../i18n'

export interface Toast {
  id: number
  kind: 'error' | 'success' | 'info'
  text: string
}

export function Toasts({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  const t = useT()
  return (
    <div className="toasts" aria-live="polite" aria-atomic="false">
      {toasts.map((x) => (
        <div key={x.id} className={`toast toast-${x.kind}`} role={x.kind === 'error' ? 'alert' : 'status'}>
          <span className="toast-text">{x.text}</span>
          <button type="button" className="btn-close" aria-label={t('close')} onClick={() => onDismiss(x.id)}>
            ×
          </button>
        </div>
      ))}
    </div>
  )
}
