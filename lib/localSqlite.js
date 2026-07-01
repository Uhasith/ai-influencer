import { spawn } from 'node:child_process'
import { mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'

const DB_DIR = path.resolve(process.cwd(), 'data')
const DB_PATH = path.join(DB_DIR, 'app.sqlite')

function sqlString(value) {
  return `'${String(value ?? '').replaceAll("'", "''")}'`
}

function sqlNumber(value, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) ? String(n) : String(fallback)
}

function runSql(sql, args = ['-batch']) {
  return new Promise((resolve, reject) => {
    const child = spawn('sqlite3', [...args, DB_PATH], { stdio: ['pipe', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', chunk => { stdout += chunk })
    child.stderr.on('data', chunk => { stderr += chunk })
    child.on('error', reject)
    child.on('close', code => {
      if (code === 0) resolve(stdout)
      else reject(new Error(stderr || `sqlite3 exited with code ${code}`))
    })
    child.stdin.end(sql)
  })
}

export async function initLocalDb() {
  await mkdir(DB_DIR, { recursive: true })
  await runSql(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS influencers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL DEFAULT 0,
      order_index INTEGER NOT NULL DEFAULT 0,
      data TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL DEFAULT 0
    );
  `)
}

async function seedIfEmpty() {
  const countRaw = await runSql('SELECT COUNT(*) FROM influencers;')
  if (Number(countRaw.trim()) > 0) return

  try {
    const raw = await readFile(path.resolve(process.cwd(), 'public/seeds.json'), 'utf8')
    const seeds = JSON.parse(raw)
    const list = (seeds.influencer_ids || [])
      .map(id => seeds.influencers?.[id])
      .filter(Boolean)
    if (list.length) await saveInfluencers(list)
  } catch (e) {
    console.warn('[sqlite] seed load failed:', e.message)
  }
}

export async function getInfluencers() {
  await initLocalDb()
  await seedIfEmpty()
  const out = await runSql(`
    SELECT data
    FROM influencers
    ORDER BY order_index ASC, created_at DESC;
  `, ['-batch', '-json'])
  const rows = out.trim() ? JSON.parse(out) : []
  return rows.map(row => JSON.parse(row.data)).filter(Boolean)
}

export async function saveInfluencers(influencers) {
  await initLocalDb()
  const now = Date.now()
  const statements = influencers.map((inf, index) => {
    const data = JSON.stringify(inf)
    return `
      INSERT INTO influencers (id, name, created_at, updated_at, order_index, data)
      VALUES (
        ${sqlString(inf.id)},
        ${sqlString(inf.name || '')},
        ${sqlNumber(inf.createdAt, now)},
        ${now},
        ${index},
        ${sqlString(data)}
      )
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at,
        order_index = excluded.order_index,
        data = excluded.data;
    `
  }).join('\n')
  const ids = influencers.map(inf => sqlString(inf.id)).join(', ')
  const deleteMissing = ids
    ? `DELETE FROM influencers WHERE id NOT IN (${ids});`
    : 'DELETE FROM influencers;'
  await runSql(`BEGIN;\n${statements}\n${deleteMissing}\nCOMMIT;`)
}

export async function mergeInfluencers(influencers) {
  await initLocalDb()
  await seedIfEmpty()
  const current = await getInfluencers()
  const byId = new Map(current.map(inf => [inf.id, inf]))
  const currentIds = new Set(byId.keys())
  for (const inf of influencers || []) {
    // SQLite is the source of truth once a record exists there.
    // Browser localStorage is only a migration/fallback source for missing IDs.
    if (inf?.id && !currentIds.has(inf.id)) byId.set(inf.id, inf)
  }
  const merged = [...byId.values()]
  await saveInfluencers(merged)
  return merged
}

export async function getAppSettings() {
  await initLocalDb()
  const out = await runSql(`
    SELECT key, value
    FROM app_settings
    ORDER BY key ASC;
  `, ['-batch', '-json'])
  const rows = out.trim() ? JSON.parse(out) : []
  return Object.fromEntries(rows.map(row => [row.key, row.value]))
}

export async function saveAppSettings(settings) {
  await initLocalDb()
  const now = Date.now()
  const statements = Object.entries(settings || {})
    .filter(([key, value]) => key && value !== undefined && value !== null)
    .map(([key, value]) => `
      INSERT INTO app_settings (key, value, updated_at)
      VALUES (${sqlString(key)}, ${sqlString(value)}, ${now})
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = excluded.updated_at;
    `)
    .join('\n')
  if (!statements) return
  await runSql(`BEGIN;\n${statements}\nCOMMIT;`)
}

export async function removeAppSettings(keys) {
  await initLocalDb()
  const list = (keys || []).filter(Boolean).map(sqlString)
  if (!list.length) return
  await runSql(`DELETE FROM app_settings WHERE key IN (${list.join(', ')});`)
}
