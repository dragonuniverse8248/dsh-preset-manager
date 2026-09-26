/**
 * Development smoke test for the Host half: mounts the plugin on a fake Cordis
 * context, drives every route, and asserts the durable document.
 * Run: node plugins-local/dsh-preset-manager/tests/smoke.mjs
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import assert from 'node:assert/strict'

const home = mkdtempSync(join(tmpdir(), 'dsh-preset-manager-'))
process.env.DSH_HOME = home

/**
 * A fake profile whose manifest decides what the page recognizes: everything
 * it names is a plugin the person installed, everything else is DSH's own.
 */
const profileDir = mkdtempSync(join(tmpdir(), 'dsh-preset-profile-'))
writeFileSync(join(profileDir, 'package.json'), JSON.stringify({
  name: 'dsh-profile-test',
  private: true,
  dependencies: {
    alpha: '1.0.0',
    beta: '1.0.0',
    gamma: '1.0.0',
    'dsh-preset-manager': 'link:.',
    locked: '1.0.0',
    delta: '1.0.0',
    zeta: '1.0.0',
    // A survival row a profile installed by accident stays excluded anyway.
    '@deepseek-ai/dsh-web-app/startup': '1.0.0',
  },
}, undefined, 1))

const module = await import('../index.js')

/** Entries this fake profile reports, mutated by setPluginEnabled. */
const entries = [
  { entryId: 'include:alpha', moduleName: 'alpha', meta: { title: { en: 'Alpha', zh: '阿尔法' } }, enabled: true, fiberPhase: 'active', patchId: 'alpha' },
  { entryId: 'include:beta', moduleName: 'beta', meta: { title: 'Beta' }, enabled: true, fiberPhase: 'active', patchId: 'beta' },
  { entryId: 'include:gamma', moduleName: 'gamma', enabled: false, fiberPhase: null, patchId: 'gamma' },
  { entryId: 'include:preset-manager', moduleName: 'dsh-preset-manager', enabled: true, fiberPhase: 'active', patchId: 'preset-manager' },
  { entryId: 'include:web-startup', moduleName: '@deepseek-ai/dsh-web-app/startup', enabled: true, fiberPhase: 'active', patchId: 'web-startup' },
  { entryId: 'include:locked', moduleName: 'locked', enabled: true, fiberPhase: 'active', readOnlyReason: 'management-required' },
  { entryId: 'include:other', moduleName: 'other-plugin', enabled: true, fiberPhase: 'active', patchId: 'other' },
]

/** The recognized packages, in the order the fixture declares them. */
const RECOGNIZED = ['alpha', 'beta', 'gamma', 'dsh-preset-manager', 'locked']

const calls = []
const manager = {
  async listPlugins() {
    return entries.map((entry) => ({ ...entry }))
  },
  async setPluginEnabled(id, enabled) {
    calls.push([id, enabled])
    const entry = entries.find((candidate) => candidate.entryId === id)
    if (entry === undefined) return { changed: false, application: 'failed', stage: 'enable', target: id, error: { code: 'unknown-plugin' } }
    if (entry.readOnlyReason !== undefined) return { changed: false, application: 'failed', stage: 'enable', target: id, error: { code: 'management-required' } }
    if (entry.moduleName === 'zeta') return { changed: false, application: 'failed', stage: 'enable', target: id, error: { code: 'operation-error' } }
    if (entry.moduleName === 'gamma' && enabled === false) return { changed: false, application: 'restart-required', stage: 'enable', target: id, enabled }
    const changed = entry.enabled !== enabled
    entry.enabled = enabled
    return { changed, application: 'applied', stage: 'enable', target: id, enabled }
  },
}

const routes = new Map()
const listeners = []
const ctx = {
  logger: { warn() {}, info() {} },
  webServer: {
    register(route) {
      routes.set(route.path, route.handler)
      return () => routes.delete(route.path)
    },
  },
  get(name) {
    if (name === 'pluginManager') return manager
    if (name === 'profileContext') return { dir: profileDir }
    return undefined
  },
  effect(factory, label) {
    const dispose = factory()
    return typeof dispose === 'function' ? dispose : () => { void label }
  },
  on(name, listener) {
    listeners.push([name, listener])
    return () => {}
  },
}

module.apply(ctx)

assert.equal(routes.size, 9, 'every route is mounted')
assert.deepEqual(listeners.map(([name]) => name), ['plugin-manager/changed'])

/** One request against the mounted routes. */
async function call(action, body) {
  const handler = routes.get(`/api/preset-manager/${action}`)
  assert.ok(handler !== undefined, `route ${action} exists`)
  const payload = body === undefined ? '' : JSON.stringify(body)
  const req = (async function* () {
    if (payload !== '') yield Buffer.from(payload, 'utf8')
  })()
  let text = ''
  const res = {
    statusCode: 0,
    headers: {},
    headersSent: false,
    setHeader(name, value) { this.headers[name] = value },
    end(chunk) {
      this.headersSent = true
      if (chunk !== undefined) text += String(chunk)
    },
  }
  await handler(req, res)
  return JSON.parse(text)
}

// 1. State on an empty document.
let state = await call('state')
assert.equal(state.ok, true)
assert.equal(state.pluginManagerAvailable, true)
// Everything the profile installed is recognized; nothing else is.
assert.deepEqual(state.plugins.map((plugin) => plugin.moduleName), RECOGNIZED)
assert.deepEqual(state.catalog.map((entry) => entry.package), RECOGNIZED)
assert.equal(state.catalog.every((entry) => entry.operable === true), true)
assert.deepEqual(state.whitelist, { exclude: [] })
assert.deepEqual(state.presets, [])
assert.equal(state.activePresetId, null)
assert.equal(state.publicOn.length, 0)
assert.deepEqual(state.plugins[0].title, { en: 'Alpha', zh: '阿尔法' })
// The DSH-supplied rows, and a survival row even when the profile names it, are necessarily excluded.
assert.equal(state.plugins.some((plugin) => plugin.moduleName === 'other-plugin'), false)
assert.equal(state.plugins.some((plugin) => plugin.moduleName.includes('dsh-web-app')), false)
assert.equal(state.systemExcluded, 2)
assert.equal(state.excluded, 2)
const excludedReport = JSON.parse(readFileSync(join(home, 'dsh-preset-manager', 'excluded-plugins.json'), 'utf8'))
assert.equal(excludedReport.count, 2)
assert.equal(excludedReport.systemCount, 2)
assert.deepEqual(excludedReport.plugins.map((entry) => [entry.moduleName, entry.reason]), [
  ['@deepseek-ai/dsh-web-app/startup', 'system'],
  ['other-plugin', 'system'],
])
assert.deepEqual(excludedReport.whitelist, { exclude: [] })

// 1b. The whitelist route leaves a recognized plugin out and restores it.
let whitelisted = await call('whitelist', { exclude: ['beta', 'not-installed'] })
assert.equal(whitelisted.ok, true)
assert.deepEqual(whitelisted.whitelist, { exclude: ['beta'] }, 'a name no recognized row carries is dropped')
assert.equal(whitelisted.plugins.some((plugin) => plugin.moduleName === 'beta'), false)
assert.equal(whitelisted.excluded, 3)
assert.equal(whitelisted.catalog.find((entry) => entry.package === 'beta').operable, false)
state = await call('state')
assert.equal(state.plugins.some((plugin) => plugin.moduleName === 'beta'), false)
whitelisted = await call('whitelist', { exclude: [] })
assert.equal(whitelisted.plugins.some((plugin) => plugin.moduleName === 'beta'), true)

// 2. Create a preset: every plugin starts off.
let created = await call('create', { name: 'Work' })
assert.equal(created.ok, true)
const presetId = created.preset.id
assert.equal(created.preset.pluginStates['include:alpha'], false)
assert.equal(created.preset.pluginStates['include:preset-manager'], true)
assert.equal(created.preset.pluginStates['include:web-startup'], undefined, 'a survival row is never in a preset')

// 3. Two more presets, then save switches on the first.
await call('create', { name: 'Write' })
await call('create', { name: 'Minimal' })
state = await call('state')
assert.equal(state.presets.length, 3)
const draft = state.presets.map((preset) => ({ ...preset }))
draft[0].pluginStates['include:alpha'] = true
draft[0].pluginStates['include:beta'] = false
let saved = await call('presets', { presets: draft })
assert.equal(saved.ok, true)
state = await call('state')
assert.equal(state.presets[0].pluginStates['include:beta'], false)

// 4. Save the global list, which force-enables its members.
let publicResult = await call('public', { publicOn: ['include:gamma'] })
assert.equal(publicResult.ok, true)
assert.equal(entries.find((entry) => entry.moduleName === 'gamma').enabled, true)
state = await call('state')
assert.deepEqual(state.publicOn, ['include:gamma'])
// gamma saved false in every preset while actually on: the active preset is unset, so no drift yet.
assert.equal(state.differences.length, 0)

// 5. Apply the first preset. gamma stays on (global), beta goes off, manager row pinned on.
calls.length = 0
let applied = await call('apply', { presetId })
assert.equal(applied.ok, true)
assert.equal(applied.activePresetId, presetId)
assert.deepEqual(calls, [['include:beta', false]])
assert.equal(entries.find((entry) => entry.moduleName === 'beta').enabled, false)
assert.equal(entries.find((entry) => entry.moduleName === 'dsh-preset-manager').enabled, true)
// The global plugin is saved off but actually on, so this preset now reports drift.
assert.deepEqual(applied.differences.map((entry) => entry.id), ['include:gamma'])
assert.equal(applied.failures.length, 0)

// 6. Apply the virtual all-on preset: every entry on, no drift.
calls.length = 0
applied = await call('apply', { presetId: 'all-on' })
assert.equal(applied.ok, true)
assert.equal(applied.failures.length, 0)
assert.equal(entries.every((entry) => entry.enabled), true)
assert.deepEqual(applied.differences, [])
assert.deepEqual(calls, [['include:beta', true]])

// 7. New-plugin sync: a fresh entry joins every preset with its observed state.
entries.push({ entryId: 'include:delta', moduleName: 'delta', enabled: false, fiberPhase: null, patchId: 'delta' })
state = await call('state')
for (const preset of state.presets) assert.equal(preset.pluginStates['include:delta'], false)
assert.equal(state.presets.length, 3)

// 8. A failing row is reported, not thrown.
entries.push({ entryId: 'include:zeta', moduleName: 'zeta', enabled: true, fiberPhase: 'active', patchId: 'zeta' })
state = await call('state')
const withZeta = state.presets.map((preset) => ({ ...preset, pluginStates: { ...preset.pluginStates, 'include:zeta': false } }))
await call('presets', { presets: withZeta })
applied = await call('apply', { presetId })
assert.deepEqual(applied.failures.map((failure) => failure.id), ['include:zeta'])
assert.equal(applied.failures[0].code, 'not-applied')

// 9. The read-only row is never addressed, and never reported as a failure.
calls.length = 0
await call('public', { publicOn: ['include:locked'] })
assert.equal(entries.find((entry) => entry.moduleName === 'locked').enabled, true)
assert.equal(calls.some(([id]) => id === 'include:locked'), false)
const lockedDraft = (await call('state')).presets.map((preset) => ({
  ...preset, pluginStates: { ...preset.pluginStates, 'include:locked': false },
}))
await call('presets', { presets: lockedDraft })
const lockedApply = await call('apply', { presetId: (await call('state')).presets[0].id })
assert.equal(lockedApply.failures.some((failure) => failure.id === 'include:locked'), false)
assert.equal(entries.find((entry) => entry.moduleName === 'locked').enabled, true)

// 10. Rename, order, delete.
let renamed = await call('rename', { id: presetId, name: 'Renamed' })
assert.equal(renamed.ok, true)
state = await call('state')
assert.equal(state.presets.find((preset) => preset.id === presetId).name, 'Renamed')
const order = state.presets.map((preset) => preset.id).reverse()
let ordered = await call('order', { order })
assert.equal(ordered.ok, true)
state = await call('state')
assert.deepEqual(state.presets.map((preset) => preset.id), order)
let deleted = await call('delete', { id: presetId })
assert.equal(deleted.ok, true)
state = await call('state')
assert.equal(state.presets.some((preset) => preset.id === presetId), false)
assert.equal(state.activePresetId, null)
assert.equal((await call('delete', { id: 'all-on' })).ok, false)
assert.equal((await call('apply', { presetId: 'nope' })).ok, false)

// 11. The durable document matches the reported state.
const document = JSON.parse(readFileSync(join(home, 'dsh-preset-manager', 'config.json'), 'utf8'))
assert.equal(document.version, 1)
assert.deepEqual(document.publicOn, ['include:locked'])
assert.deepEqual(document.presets.map((preset) => preset.name), state.presets.map((preset) => preset.name))

// 12. Malformed input is refused rather than written.
assert.equal((await call('presets', { presets: 'nope' })).ok, false)
assert.equal((await call('public', { publicOn: 'nope' })).ok, false)
assert.equal((await call('order', { order: ['only-one'] })).ok, false)

rmSync(home, { recursive: true, force: true })

// ---- batched profile-patch editor ----

const patchDir = mkdtempSync(join(tmpdir(), 'dsh-preset-patch-'))
const patchFile = join(patchDir, 'cordis.patch.yml')
const original = [
  '# leading comment, kept verbatim',
  '- id: ui-settings-general',
  '  name: "@deepseek-ai/dsh-client-ui-settings-general"',
  '  config:',
  '    welcomeNoticeVersion: 2026-08-13.1',
  '',
  '- insert:',
  '    - id: nested-row',
  '      disabled: true',
  '',
  '- id: llm',
  '  disabled: false',
  '',
].join('\n')
writeFileSync(patchFile, original)

module.writeDisabledRows(patchFile, new Map([['llm', true], ['ui-settings-general', true], ['fresh-row', false]]))
const written = readFileSync(patchFile, 'utf8')
assert.match(written, /# leading comment, kept verbatim/)
assert.match(written, /- id: ui-settings-general\n {2}disabled: true\n {2}name: "@deepseek-ai\/dsh-client-ui-settings-general"/)
assert.match(written, /- id: llm\n {2}disabled: true\n/)
assert.match(written, /- insert:\n {4}- id: nested-row\n {6}disabled: true/)
assert.match(written, /- id: fresh-row\n {2}disabled: false\n$/)
assert.equal((written.match(/^- id: llm$/gm) ?? []).length, 1)
assert.equal((written.match(/^- id: fresh-row$/gm) ?? []).length, 1)

// A second identical pass is a no-op: the editor replaces rather than appends.
module.writeDisabledRows(patchFile, new Map([['llm', true], ['ui-settings-general', true], ['fresh-row', false]]))
assert.equal(readFileSync(patchFile, 'utf8'), written)
assert.equal(module.splitPatchBlocks(written).filter((block) => block.id !== null).map((block) => block.id).join(','), 'ui-settings-general,llm,fresh-row')

// Restoring the original values removes the rows the first pass replaced only
// by rewriting them: no duplicated entry appears for an already-declared id.
module.writeDisabledRows(patchFile, new Map([['llm', false], ['ui-settings-general', false]]))
const restored = readFileSync(patchFile, 'utf8')
assert.equal((restored.match(/^- id: llm$/gm) ?? []).length, 1)
assert.match(restored, /- id: ui-settings-general\n {2}disabled: false\n/)

// A row this editor appended can be deleted again, leaving no trace for a
// revert that promises the caller the document it had.
const removal = module.writeDisabledRows(patchFile, new Map(), new Set(['fresh-row']))
assert.deepEqual([...removal.appended], [])
assert.equal(removal.changed, true)
const pruned = readFileSync(patchFile, 'utf8')
assert.equal(pruned.includes('fresh-row'), false)
assert.equal((pruned.match(/^- id: llm$/gm) ?? []).length, 1)
assert.equal(module.writeDisabledRows(patchFile, new Map(), new Set(['fresh-row'])).changed, false)
rmSync(patchDir, { recursive: true, force: true })

console.log('dsh-preset-manager host smoke: all assertions passed')
