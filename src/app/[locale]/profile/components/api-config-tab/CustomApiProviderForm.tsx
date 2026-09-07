'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { CUSTOM_API_PROTOCOLS, customApiProtocol, normalizeCustomApiBaseUrl } from '@/lib/ai-providers/custom/config'
import type { Provider } from '../api-config'
import { apiFetch } from '@/lib/api-fetch'

export function CustomApiProviderForm(props: { providers: Provider[]; onSave: (provider: Provider) => Promise<boolean> }) {
  const t = useTranslations('apiConfig')
  const [editingId, setEditingId] = useState('')
  const [protocol, setProtocol] = useState<string>(CUSTOM_API_PROTOCOLS[0].id)
  const [name, setName] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const existing = props.providers.find((provider) => provider.id === editingId)
  const configured = props.providers.filter((provider) => customApiProtocol(provider.id) && provider.id.includes(':'))
  function choose(value: string) {
    const provider = configured.find((item) => item.id === value)
    setEditingId(value); setApiKey(''); setNotice('')
    setName(provider?.name ?? ''); setBaseUrl(provider?.baseUrl ?? '')
    if (provider) setProtocol(provider.id.split(':', 1)[0])
  }
  const keyRequired = !existing?.hasApiKey || baseUrl.replace(/\/+$/, '') !== existing?.baseUrl
  async function save(event: React.FormEvent) {
    event.preventDefault(); setNotice('')
    const config = customApiProtocol(protocol)
    if (!config) return
    let normalized: string
    try { normalized = normalizeCustomApiBaseUrl(protocol, baseUrl) }
    catch { setNotice(t('customApi.invalidUrl')); return }
    if (keyRequired && !apiKey.trim()) { setNotice(t('customApi.keyRequired')); return }
    setBusy(true)
    const providerId = editingId || `${protocol}:${crypto.randomUUID()}`
    try {
      const saved = await props.onSave({ id: providerId, name: name.trim(), baseUrl: normalized,
        ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}), hasApiKey: Boolean(apiKey.trim() || existing?.hasApiKey),
        connectionTest: true, modelTypes: [...config.modelTypes] })
      setApiKey('')
      if (saved) { setEditingId(providerId); setBaseUrl(normalized); setNotice(t('customApi.saved')) }
      else setNotice(t('saveFailed'))
    } finally { setBusy(false) }
  }
  async function check() {
    if (!existing?.hasApiKey) return
    setBusy(true); setNotice('')
    try {
      const response = await apiFetch('/api/user/api-config/test-provider', { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ providerId: existing.id, apiType: existing.id.split(':', 1)[0] }) })
      const report = await response.json() as { success?: boolean }
      setNotice(t(response.ok && report.success ? 'customApi.checkOk' : 'customApi.checkFailed'))
    } catch { setNotice(t('customApi.checkFailed')) }
    finally { setBusy(false) }
  }
  const fieldClass = 'glass-input-base w-full px-3 py-2 text-sm'
  return <section className="glass-surface glass-card-shadow-soft rounded-2xl p-5" aria-label={t('customApi.title')}>
    <h2 className="text-lg font-semibold">{t('customApi.title')}</h2>
    <p className="mt-1 text-sm text-[var(--glass-text-secondary)]">{t('customApi.hint')}</p>
    <form onSubmit={save} className="mt-4 space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-1 text-sm"><span>{t('customApi.connection')}</span>
          <select className={fieldClass} value={editingId} disabled={busy} onChange={(event) => choose(event.target.value)}>
            <option value="">{t('customApi.add')}</option>{configured.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-sm"><span>{t('customApi.protocol')}</span>
          <select className={fieldClass} value={protocol} disabled={busy || Boolean(editingId)} onChange={(event) => setProtocol(event.target.value)}>
            {CUSTOM_API_PROTOCOLS.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-sm"><span>{t('customApi.name')}</span>
          <input className={fieldClass} required maxLength={100} value={name} disabled={busy} onChange={(event) => setName(event.target.value)} />
        </label>
        <label className="space-y-1 text-sm"><span>Base URL</span>
          <input className={fieldClass} type="url" required placeholder="https://api.example.com/v1" value={baseUrl} disabled={busy} onChange={(event) => setBaseUrl(event.target.value)} />
        </label>
      </div>
      <p className="text-xs text-[var(--glass-text-secondary)]">{t('customApi.urlHint')}</p>
      <label className="block space-y-1 text-sm"><span>API Key</span>
        <input className={fieldClass} type="password" autoComplete="off" spellCheck={false} required={keyRequired} value={apiKey} disabled={busy}
          placeholder={existing?.hasApiKey ? t('customApi.keepKey') : t('enterApiKey')} onChange={(event) => setApiKey(event.target.value)} />
      </label>
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={busy} className="glass-btn-base glass-btn-primary px-4 py-2 text-sm">{t(busy ? 'saving' : 'save')}</button>
        {existing?.hasApiKey && <button type="button" disabled={busy} onClick={() => void check()} className="glass-btn-base glass-btn-soft px-4 py-2 text-sm">{t('customApi.check')}</button>}
      </div>
      {notice && <p role="status" className="text-sm text-[var(--glass-text-secondary)]">{notice}</p>}
    </form>
  </section>
}
