/**
 * Live check against a running DSH instance: drives the preset routes over
 * HTTP and asserts the operable-plugin allowlist end to end.
 *
 * Usage: node tests/live-check.mjs <origin> <token>
 * Example: node tests/live-check.mjs http://127.0.0.1:5544 abc123
 *
 * It creates one throwaway preset, applies it, and removes it again; the
 * profile's own plugins are restored to their baseline enablement.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const [origin, token] = process.argv.slice(2)
if (origin === undefined || token === undefined) {
  console.error('usage: node tests/live-check.mjs <origin> <token>')
  process.exit(2)
}

/** The browser-session cookie the index request mints from the launch token. */
async function authenticate() {
  const response = await fetch(`${origin}/?token=${encodeURIComponent(token)}`, { redirect: 'manual' })
  const raw = response.headers.getSetCookie?.()[0] ?? response.headers.get('set-cookie')
  assert.ok(raw !== null && raw !== undefined, 'the launch token minted no browser cookie')
  return raw.split(';')[0]
}

const cookie = await authenticate()
const base = `${origin}/api/preset-manager`

/** One JSON call against the plugin's routes. */
async function call(action, body) {
  const init = body === undefined
    ? { headers: { cookie, accept: 'application/json' } }
    : { method: 'POST', headers: { cookie, accept: 'application/json', 'content-type': 'application/json' }, body: JSON.stringify(body) }
  const response = await fetch(`${base}/${action}`, init)
  assert.equal(response.status, 200, `${action} answered ${String(response.status)}`)
  return response.json()
}

/** The exclusion report the Host writes beside the durable document. */
function excludedReport() {
  return JSON.parse(readFileSync(process.env.LIVE_EXCLUDED_FILE ?? '', 'utf8'))
}

let state = await call('state')
assert.equal(state.ok, true)
assert.equal(state.pluginManagerAvailable, true)
console.log(`operable: ${state.plugins.map((plugin) => plugin.moduleName).join(', ')}`)
console.log(`excluded: ${String(state.excluded)} -> ${state.excludedPath}`)
assert.equal(state.manage.length, 3, 'the default operable set names three packages')
for (const plugin of state.plugins) {
  assert.equal(state.manage.includes(plugin.moduleName), true, `${plugin.moduleName} is operable`)
}
assert.ok(state.excluded > 100, 'the lower layer is excluded')

const byName = (name) => state.plugins.find((plugin) => plugin.moduleName === name)
const whale = byName('dsh-whale-widget')
const archive = byName('dsh-archive-manager')
const market = byName('dshmarket')
assert.ok(whale && archive && market, 'the three test plugins are operable')

const baseline = new Map(state.plugins.map((plugin) => [plugin.id, plugin.enabled]))
console.log('baseline:', [...baseline].map(([id, on]) => `${id}=${String(on)}`).join(' '))

// The lower layer must not move for anything this page does.
const beforeExcluded = state.excludedPath === undefined ? undefined : excludedReport()
const beforeStates = new Map(beforeExcluded.plugins.map((plugin) => [plugin.entryId, plugin.enabled]))

// 1. A new preset holds exactly the operable rows, all off.
const created = await call('create', { name: 'live-check' })
assert.equal(created.ok, true)
const presetId = created.preset.id
assert.deepEqual(Object.keys(created.preset.pluginStates).sort(), [archive.id, market.id, whale.id].sort())
assert.equal(Object.values(created.preset.pluginStates).every((value) => value === false), true)

// 2. Save a draft that keeps only the widget on; an unknown row is dropped.
const draft = await call('state')
const saved = await call('presets', {
  presets: draft.presets.map((preset) => preset.id === presetId
    ? { ...preset, name: 'live-check', pluginStates: { ...preset.pluginStates, [whale.id]: true, 'include:session': true } }
    : preset),
})
assert.equal(saved.ok, true)
const stored = saved.presets.find((preset) => preset.id === presetId)
assert.equal(stored.pluginStates[whale.id], true)
assert.equal(stored.pluginStates['include:session'], undefined, 'an unmanaged row never enters a preset')

// 3. Applying it moves exactly the operable rows that differ from the baseline.
const wanted = new Map([[whale.id, true], [archive.id, false], [market.id, false]])
const expectedApplied = [...wanted].filter(([id, desired]) => baseline.get(id) !== desired).length
const applied = await call('apply', { presetId })
assert.equal(applied.ok, true, `apply answer ${JSON.stringify(applied)}`)
assert.equal(applied.activePresetId, presetId)
assert.equal(applied.applied, expectedApplied, 'only the rows that differed moved')
assert.equal(applied.failures.length, 0)
state = await call('state')
assert.equal(state.plugins.find((plugin) => plugin.id === whale.id).enabled, true)
assert.equal(state.plugins.find((plugin) => plugin.id === archive.id).enabled, false)
assert.equal(state.plugins.find((plugin) => plugin.id === market.id).enabled, false)
console.log(`applied: widget on, archive and market off (${String(expectedApplied)} rows moved)`)

// 4. The global list accepts only operable rows.
const globalList = await call('public', { publicOn: [archive.id, 'include:session'] })
assert.equal(globalList.ok, true)
assert.deepEqual(globalList.publicOn, [archive.id], 'an unmanaged row never becomes global')
state = await call('state')
assert.equal(state.plugins.find((plugin) => plugin.id === archive.id).enabled, true)

// 5. The lower layer kept every switch it had.
const afterExcluded = excludedReport()
const moved = afterExcluded.plugins.filter((plugin) => beforeStates.get(plugin.entryId) !== plugin.enabled)
assert.deepEqual(moved, [], 'no excluded plugin changed enablement')

// 6. Restore the baseline through a throwaway preset, then remove both presets.
await call('public', { publicOn: [] })
const states = {}
for (const [id, enabled] of baseline) states[id] = enabled
const restore = await call('create', { name: 'live-check-restore' })
await call('presets', {
  presets: (await call('state')).presets.map((preset) => preset.id === restore.preset.id
    ? { ...preset, pluginStates: states }
    : preset),
})
await call('apply', { presetId: restore.preset.id })
assert.equal((await call('delete', { id: presetId })).ok, true)
assert.equal((await call('delete', { id: restore.preset.id })).ok, true)
const final = await call('state')
assert.equal(final.presets.some((preset) => preset.id === presetId), false)
assert.equal(final.presets.some((preset) => preset.id === restore.preset.id), false)
assert.equal(final.activePresetId, null, 'removing the active preset clears the record')
for (const [id, wanted] of baseline) {
  assert.equal(final.plugins.find((plugin) => plugin.id === id).enabled, wanted, `${id} is back to its baseline`)
}
console.log(`excluded report: ${String(afterExcluded.count)} lower-layer plugins`)
console.log('dsh-preset-manager live check: all assertions passed')
