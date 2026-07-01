export const PERSISTED_SETTING_KEYS = [
  'claude_api_key',
  'hf_client_id',
  'hf_client_redirect_uri',
  'hf_access_token',
  'hf_refresh_token',
  'hf_token_expires_at',
  'hf_referral_fired',
]

function allowedSettings(settings) {
  const allowed = new Set(PERSISTED_SETTING_KEYS)
  return Object.fromEntries(
    Object.entries(settings || {}).filter(([key, value]) => allowed.has(key) && value != null)
  )
}

export async function loadPersistedSettings() {
  try {
    const res = await fetch('/api/local/settings')
    if (!res.ok) throw new Error(`settings load failed (${res.status})`)
    const payload = await res.json()
    const settings = allowedSettings(payload.settings)
    for (const [key, value] of Object.entries(settings)) {
      localStorage.setItem(key, value)
    }
    return settings
  } catch (e) {
    console.warn('[sqlite] settings load skipped:', e.message)
    return {}
  }
}

export async function savePersistedSettings(settings) {
  const clean = allowedSettings(settings)
  for (const [key, value] of Object.entries(clean)) {
    try { localStorage.setItem(key, value) } catch {}
  }
  if (!Object.keys(clean).length) return
  try {
    await fetch('/api/local/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings: clean }),
    })
  } catch (e) {
    console.warn('[sqlite] settings save skipped:', e.message)
  }
}

export async function savePersistedSetting(key, value) {
  await savePersistedSettings({ [key]: value })
}

export async function removePersistedSettings(keys) {
  for (const key of keys || []) {
    try { localStorage.removeItem(key) } catch {}
  }
  try {
    await fetch('/api/local/settings', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keys }),
    })
  } catch (e) {
    console.warn('[sqlite] settings removal skipped:', e.message)
  }
}
