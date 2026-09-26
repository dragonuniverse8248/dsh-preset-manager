/**
 * dsh-preset-manager — Host half.
 *
 * Owns the durable preset document at `$DSH_HOME/dsh-preset-manager/config.json`
 * and the HTTP routes behind the Settings "预设" page. Plugin inventory and
 * enable/disable go through the profile's `pluginManager` service, which
 * persists each row's desired enablement into the profile patch and applies it
 * to the running Loader without a restart.
 *
 * The profile's own row for this package is pinned on, as are the rows that
 * carry the Settings page and the HTTP server: a preset that could disable one
 * of those would remove the only page able to re-enable it.
 * @module dsh-preset-manager
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

/** Package name; also the browser module id, the locale namespace, and the durable directory name. */
const PACKAGE_NAME = 'dsh-preset-manager'
/** Loader row id this bundle's patch inserts, matched to pin the manager's own row. */
const ROW_ID = 'preset-manager'
/** Route prefix owned by this plugin. */
const ROUTE_BASE = '/api/preset-manager'
/** Durable document version; a document with another value is read leniently and rewritten. */
const CONFIG_VERSION = 1
/** Upper bound for one request body. */
const MAX_BODY_BYTES = 1024 * 1024
/**
 * Longest wait for a batch of row overrides to reach the running tree. One
 * reconciliation of a whole-install switch takes tens of seconds, and the
 * caller observes the outcome instead of assuming it.
 */
const SETTLE_TIMEOUT_MS = 90_000
/** The always-present, never-stored "every plugin on" preset. */
export const ALL_ON_PRESET_ID = 'all-on'

/**
 * Packages the page may switch, matched against a row's package name, entry id,
 * or patch row id. Every other row in the profile is a lower layer the page
 * neither shows nor touches; the resolved set and the rows it excludes are
 * written beside the durable document. A deployment overrides this default
 * through the row's `config.manage`.
 */
export const DEFAULT_MANAGE = ['dsh-whale-widget', 'dsh-archive-manager', 'dshmarket']

/**
 * Modules whose absence removes the Settings page or the HTTP carrier that
 * serves it, so a preset that disabled one would leave no page able to
 * re-enable anything. They are pinned on exactly like the global list.
 */
const SURVIVAL_MODULES = new Set([
  '@deepseek-ai/dsh-web-app/startup',
  '@deepseek-ai/dsh-web-app',
  '@deepseek-ai/dsh-cordis-client-runner',
  '@deepseek-ai/dsh-client-locale',
  '@deepseek-ai/dsh-client-ui-theme',
  '@deepseek-ai/dsh-client-ui-renderer',
  '@deepseek-ai/dsh-client-ui-layout',
  '@deepseek-ai/dsh-client-ui-sidebar',
  '@deepseek-ai/dsh-client-ui-settings',
  '@deepseek-ai/dsh-client-ui-settings-general',
])

/** Required services: the browser HTTP carrier. */
export const inject = ['webServer']

/** Module name of this plugin's Host half. */
export const name = PACKAGE_NAME

/**
 * The operable set in force. `apply` replaces it from the row's `config.manage`
 * before any route exists, so every read sees one resolved set.
 */
let manageable = new Set(DEFAULT_MANAGE)

/** The last exclusion report written, so an unchanged one is not rewritten. */
let excludedSignature = null

/** Harness home: an explicit non-blank `$DSH_HOME`, else `~/.dsh`. */
function dshHome() {
  const configured = process.env.DSH_HOME
  if (typeof configured === 'string' && configured.trim() !== '') return configured
  return join(homedir(), '.dsh')
}

/** Absolute path of the durable preset document. */
function configPath() {
  return join(dshHome(), PACKAGE_NAME, 'config.json')
}

/** Absolute path of the report naming the rows this page does not manage. */
function excludedPath() {
  return join(dshHome(), PACKAGE_NAME, 'excluded-plugins.json')
}

/**
 * Whether one inventory row is one the page may switch.
 * @param row Inventory row carrying its entry id, package name, and patch row id.
 * @returns true when the operable set names any of them.
 */
function isManageable(row) {
  const moduleName = typeof row.moduleName === 'string' ? row.moduleName : ''
  return manageable.has(moduleName)
    || manageable.has(String(row.entryId))
    || (typeof row.patchId === 'string' && manageable.has(row.patchId))
}

/** Keep only plain boolean entries with a non-empty string key. */
function normalizeStates(value) {
  const states = {}
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return states
  for (const [key, flag] of Object.entries(value)) {
    if (key !== '' && typeof flag === 'boolean') states[key] = flag
  }
  return states
}

/** Read one raw preset into the durable form, or undefined when it names no usable id. */
function normalizePreset(raw) {
  if (raw === null || typeof raw !== 'object') return undefined
  const id = typeof raw.id === 'string' && raw.id !== '' ? raw.id : undefined
  if (id === undefined || id === ALL_ON_PRESET_ID) return undefined
  const name = typeof raw.name === 'string' && raw.name.trim() !== '' ? raw.name : id
  const createdAt = Number.isFinite(raw.createdAt) ? raw.createdAt : Date.now()
  return { id, name, createdAt, pluginStates: normalizeStates(raw.pluginStates) }
}

/** Read a whole document into the durable form; unknown fields are dropped and malformed rows ignored. */
function normalizeConfig(raw) {
  const source = raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  const publicOn = []
  if (Array.isArray(source.publicOn)) {
    for (const id of source.publicOn) {
      if (typeof id === 'string' && id !== '' && !publicOn.includes(id)) publicOn.push(id)
    }
  }
  const presets = []
  const seen = new Set()
  if (Array.isArray(source.presets)) {
    for (const item of source.presets) {
      const preset = normalizePreset(item)
      if (preset === undefined || seen.has(preset.id)) continue
      seen.add(preset.id)
      presets.push(preset)
    }
  }
  const activePresetId = typeof source.activePresetId === 'string' && source.activePresetId !== ''
    ? source.activePresetId
    : null
  return { version: CONFIG_VERSION, publicOn, presets, activePresetId }
}

/** Read the durable document; a missing or unreadable file yields an empty document. */
function readConfig(logger) {
  const file = configPath()
  if (!existsSync(file)) return normalizeConfig(undefined)
  try {
    return normalizeConfig(JSON.parse(readFileSync(file, 'utf8')))
  } catch (error) {
    logger?.warn(`${PACKAGE_NAME}: ignoring unreadable ${file}: ${String(error)}`)
    return normalizeConfig(undefined)
  }
}

/** Replace a file's contents atomically, creating its directory on first write. */
function writeFileAtomically(file, text) {
  mkdirSync(dirname(file), { recursive: true })
  const temporary = `${file}.tmp`
  writeFileSync(temporary, text, 'utf8')
  renameSync(temporary, file)
}

/** Write the durable document atomically. */
function writeConfig(config) {
  writeFileAtomically(configPath(), `${JSON.stringify(config, undefined, 2)}\n`)
}

/**
 * Split a profile patch into its top-level entries, keeping every comment and
 * blank line attached to the entry that follows it.
 * @param text Current patch file.
 * @returns One block per top-level list item, with the row id when it declares one.
 */
function splitPatchBlocks(text) {
  const blocks = []
  let current = { id: null, lines: [] }
  for (const line of text.split('\n')) {
    if (line.startsWith('- ') || line === '-') {
      if (current.lines.length > 0) blocks.push(current)
      const match = /^- id:\s*(\S+)\s*$/.exec(line)
      current = { id: match === null ? null : match[1], lines: [line] }
      continue
    }
    current.lines.push(line)
  }
  blocks.push(current)
  return blocks
}

/**
 * Set the `disabled` override of every named row in one pass over a profile
 * patch, preserving its comments and unrelated entries. `pluginManager`
 * writes and reconciles one row per call, which costs about a second each; a
 * preset switch can change every installed row.
 * @param filename Profile patch file.
 * @param changes Row id to whether the row should be disabled.
 * @param removals Row ids whose top-level entry should be deleted, restoring the inherited default.
 * @returns The row ids this call appended, and whether the file changed.
 */
function writeDisabledRows(filename, changes, removals = new Set()) {
  let text
  try {
    text = readFileSync(filename, 'utf8')
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
    text = '[]\n'
  }
  const pending = new Map(changes)
  const blocks = splitPatchBlocks(text).filter((block) => block.id === null || !removals.has(block.id))
  for (const block of blocks) {
    if (block.id === null || !pending.has(block.id)) continue
    const value = pending.get(block.id) ? 'true' : 'false'
    const index = block.lines.findIndex((line, position) => position > 0 && /^ {2}disabled:/.test(line))
    if (index >= 0) block.lines[index] = `  disabled: ${value}`
    else block.lines.splice(1, 0, `  disabled: ${value}`)
    pending.delete(block.id)
  }
  const appended = new Set()
  for (const [id, disabled] of pending) {
    // An entry the patch does not declare yet: the last matching row wins, so
    // appending is how a row with no override becomes addressable.
    blocks.push({ id, lines: [`- id: ${id}`, `  disabled: ${disabled ? 'true' : 'false'}`] })
    appended.add(id)
  }
  const next = blocks.map((block) => block.lines.join('\n')).join('\n')
  const normalized = next.endsWith('\n') ? next : `${next}\n`
  if (normalized === text) return { appended, changed: false }
  writeFileAtomically(filename, normalized)
  return { appended, changed: true }
}

/**
 * Wait until every expected enablement holds on the running tree.
 *
 * A profile patch write is reconciled by the HMR watcher, which coalesces
 * events: a second write issued while the first reconciliation runs can be
 * missed entirely, so the outcome is observed rather than assumed.
 * @param ctx Plugin context.
 * @param expected Entry id to the enablement it must reach.
 * @param timeoutMs Longest wait before the caller judges what settled.
 * @returns The entries as last observed.
 */
async function waitForEnablement(ctx, expected, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const plugins = await listPlugins(ctx)
    if (plugins === undefined) return undefined
    const byId = new Map(plugins.map((plugin) => [plugin.id, plugin]))
    let settled = true
    for (const [id, wanted] of expected) {
      const row = byId.get(id)
      if (row !== undefined && row.enabled !== wanted) {
        settled = false
        break
      }
    }
    if (settled || Date.now() >= deadline) return plugins
    await new Promise((resolve) => {
      setTimeout(resolve, 750)
    })
  }
}

/** The `pluginManager` service, or undefined when this profile has no profile-backed Host. */
function managerOf(ctx) {
  const manager = ctx.get('pluginManager')
  if (manager === undefined || typeof manager.listPlugins !== 'function' || typeof manager.setPluginEnabled !== 'function') {
    return undefined
  }
  return manager
}

/** Whether one inventory row belongs to this package, which the manager never disables. */
function isSelfRow(row) {
  return row.patchId === ROW_ID || row.moduleName === PACKAGE_NAME
}

/**
 * Project the profile's runtime entries into the page's plugin list.
 * `title` and `description` keep the package's localized form; the browser
 * resolves it against its active locale.
 * @param ctx Plugin context.
 * @returns the current entries, or undefined when no profile manager is mounted.
 */
async function listPlugins(ctx) {
  const manager = managerOf(ctx)
  if (manager === undefined) return undefined
  const rows = await manager.listPlugins()
  return rows.map((row) => {
    const meta = row.meta ?? {}
    return {
      id: String(row.entryId),
      moduleName: String(row.moduleName ?? ''),
      patchId: typeof row.patchId === 'string' ? row.patchId : null,
      title: meta.title ?? String(row.moduleName ?? ''),
      description: meta.description ?? '',
      enabled: row.enabled === true,
      fiberPhase: row.fiberPhase ?? null,
      readOnly: row.readOnlyReason !== undefined,
      readOnlyReason: row.readOnlyReason ?? null,
      self: isSelfRow(row),
      system: SURVIVAL_MODULES.has(String(row.moduleName ?? '')),
      managed: isManageable(row),
    }
  })
}

/** The stored preset by id, or undefined for the virtual "all on" preset and unknown ids. */
function findPreset(config, presetId) {
  return config.presets.find((preset) => preset.id === presetId)
}

/** Saved switch values of one preset; the virtual "all on" preset is every plugin on. */
function savedStates(config, presetId, plugins) {
  if (presetId === ALL_ON_PRESET_ID) {
    const states = {}
    for (const plugin of plugins) states[plugin.id] = true
    return states
  }
  const preset = findPreset(config, presetId)
  return preset === undefined ? undefined : preset.pluginStates
}

/** A plugin the manager must never disable: the global set, a survival row, and this package's own row. */
function isPinned(config, plugin) {
  return plugin.self || plugin.system || config.publicOn.includes(plugin.id)
}

/**
 * Compare one preset's saved switches with the entries' actual enablement.
 * Rows the profile cannot address are skipped: nothing this page does changes them.
 * @param config Durable document.
 * @param plugins Current entries.
 * @param presetId Preset to compare, including the virtual "all on" id.
 * @returns the differing plugins, each with its saved and actual value.
 */
function differences(config, plugins, presetId) {
  const states = savedStates(config, presetId, plugins)
  if (states === undefined) return []
  const found = []
  for (const plugin of plugins) {
    if (plugin.readOnly) continue
    if (!Object.prototype.hasOwnProperty.call(states, plugin.id)) continue
    const saved = states[plugin.id] === true
    if (saved === plugin.enabled) continue
    found.push({ id: plugin.id, saved, actual: plugin.enabled })
  }
  return found
}

/**
 * Add every entry missing from a preset's saved switches, with its current
 * enablement, so a newly installed plugin joins every preset exactly once.
 * @returns whether the document changed.
 */
function syncNewPlugins(config, plugins) {
  let changed = false
  for (const plugin of plugins) {
    for (const preset of config.presets) {
      if (Object.prototype.hasOwnProperty.call(preset.pluginStates, plugin.id)) continue
      preset.pluginStates[plugin.id] = plugin.enabled
      changed = true
    }
  }
  return changed
}

/**
 * Drop stored switches no operable row owns any more, so the document holds
 * only the plugins the page can actually switch.
 * @param config Durable document.
 * @param plugins Current operable entries.
 * @returns whether the document changed.
 */
function pruneUnmanaged(config, plugins) {
  const known = new Set(plugins.map((plugin) => plugin.id))
  let changed = false
  for (const preset of config.presets) {
    for (const id of Object.keys(preset.pluginStates)) {
      if (known.has(id)) continue
      delete preset.pluginStates[id]
      changed = true
    }
  }
  return changed
}

/**
 * Record every entry the page does not manage, so the excluded set is
 * auditable and a later `manage` edit has a list to draw from.
 * @param excluded Entries outside the operable set.
 */
function writeExcluded(excluded) {
  const signature = JSON.stringify(excluded.map((plugin) => [plugin.id, plugin.moduleName, plugin.enabled]))
  if (signature === excludedSignature) return
  excludedSignature = signature
  const document = {
    generatedAt: new Date().toISOString(),
    manage: [...manageable],
    count: excluded.length,
    plugins: excluded.map((plugin) => ({
      entryId: plugin.id,
      moduleName: plugin.moduleName,
      patchId: plugin.patchId,
      enabled: plugin.enabled,
      readOnly: plugin.readOnly,
    })),
  }
  writeFileAtomically(excludedPath(), `${JSON.stringify(document, undefined, 2)}\n`)
}

/**
 * The durable document plus the freshly read inventory, after the new-plugin
 * sync and the unmanaged prune have settled. Only operable rows are returned;
 * the excluded rows are reported to the file beside the document.
 * @param ctx Plugin context.
 * @returns The document, the operable entries, and the excluded count.
 */
async function readState(ctx) {
  const config = readConfig(ctx.logger)
  const rows = await listPlugins(ctx)
  if (rows === undefined) return { config, plugins: [], excluded: 0, managerAvailable: false }
  const managed = rows.filter((plugin) => plugin.managed)
  const excluded = rows.filter((plugin) => !plugin.managed)
  let changed = syncNewPlugins(config, managed)
  changed = pruneUnmanaged(config, managed) || changed
  if (changed) writeConfig(config)
  writeExcluded(excluded)
  return { config, plugins: managed, excluded: excluded.length, managerAvailable: true }
}

/**
 * Move a set of entries to their desired enablement.
 *
 * A profile that reconciles live patches takes one patch write and one
 * reconciliation for the whole set, because the profile patch file is watched
 * and every changed row settles before `app-boot/config-reload`. Without that
 * watcher the manager's per-row path persists just as well and reports its own
 * `restart-required` outcome.
 *
 * A composition only starts when every row another active row injects is
 * active too, so a set that leaves a live row without a service it needs is
 * written, measured, and then reverted: the profile the caller had is the one
 * it keeps.
 * @param ctx Plugin context.
 * @param targets Rows to move, each with its entry id, display name, patch row id, and desired enablement.
 * @returns How many rows reached their desired state, the rows that did not, and whether the whole set was reverted.
 */
async function switchRows(ctx, targets) {
  const manager = managerOf(ctx)
  const failures = []
  let applied = 0
  if (manager === undefined || targets.length === 0) return { applied, failures, reverted: false }
  const profile = ctx.get('profileContext')
  const hmr = ctx.get('hmr')
  if (profile === undefined || typeof profile.patchPath !== 'string' || hmr === undefined) {
    for (const target of targets) {
      try {
        const result = await manager.setPluginEnabled(target.id, target.desired)
        if (result !== null && typeof result === 'object' && result.application === 'applied') applied += 1
        else {
          failures.push({
            id: target.id,
            name: target.name,
            code: 'not-applied',
            detail: String(result?.application ?? 'unknown'),
            enabled: target.desired,
          })
        }
      } catch (error) {
        failures.push({ id: target.id, name: target.name, code: 'operation-error', detail: String(error) })
      }
    }
    return { applied, failures, reverted: false }
  }

  const before = await listPlugins(ctx)
  const phaseBefore = new Map((before ?? []).map((plugin) => [plugin.id, plugin.fiberPhase]))
  const rowIdOf = (target) => target.patchId ?? target.name
  const changes = new Map()
  const expected = new Map()
  for (const target of targets) {
    changes.set(rowIdOf(target), target.desired === false)
    expected.set(target.id, target.desired)
  }
  const { appended } = writeDisabledRows(profile.patchPath, changes)
  /** @type {Awaited<ReturnType<typeof listPlugins>>} */
  const after = await waitForEnablement(ctx, expected, SETTLE_TIMEOUT_MS)
  const byId = new Map((after ?? []).map((plugin) => [plugin.id, plugin]))
  /** A row that kept its enablement but lost its services is the profile breaking, not a switch refusing. */
  const disabled = new Set(targets.filter((target) => target.desired === false).map((target) => target.id))
  const stranded = (after ?? []).filter((plugin) =>
    !disabled.has(plugin.id) && phaseBefore.get(plugin.id) === 'active' && plugin.fiberPhase !== 'active')
  if (stranded.length > 0) {
    // Rows this batch introduced have no earlier value to restore, so they are
    // deleted instead, leaving the profile document as the caller found it.
    const restore = new Map()
    const expectedRestore = new Map()
    for (const target of targets) {
      const previous = (before ?? []).find((plugin) => plugin.id === target.id)
      if (previous === undefined) continue
      expectedRestore.set(target.id, previous.enabled)
      if (appended.has(rowIdOf(target))) continue
      restore.set(rowIdOf(target), previous.enabled === false)
    }
    writeDisabledRows(profile.patchPath, restore, appended)
    const restored = await waitForEnablement(ctx, expectedRestore, SETTLE_TIMEOUT_MS)
    // A reconciliation the watcher missed leaves the tree behind its document;
    // the manager's per-row path then drives the rows that are still wrong.
    await resumeEnablement(ctx, manager, expectedRestore, restored)
    return {
      applied: 0,
      failures: [],
      reverted: true,
      stranded: stranded.map((plugin) => plugin.moduleName),
    }
  }

  for (const target of targets) {
    const row = byId.get(target.id)
    if (row !== undefined && row.enabled === target.desired) applied += 1
    else {
      failures.push({
        id: target.id,
        name: target.name,
        code: 'not-applied',
        detail: row === undefined ? 'row-left-the-tree' : 'restart-required',
        enabled: target.desired,
      })
    }
  }
  return { applied, failures, reverted: false }
}

/**
 * Drive the rows a missed reconciliation left behind through the manager's own
 * per-row path, which reconciles each one itself.
 * @param ctx Plugin context.
 * @param manager The profile's plugin manager.
 * @param expected Entry id to the enablement it must hold.
 * @param observed The entries as the caller last saw them.
 */
async function resumeEnablement(ctx, manager, expected, observed) {
  const byId = new Map((observed ?? []).map((plugin) => [plugin.id, plugin]))
  const behind = []
  for (const [id, wanted] of expected) {
    const row = byId.get(id)
    if (row !== undefined && row.enabled !== wanted) behind.push({ row, wanted })
  }
  if (behind.length === 0) return
  ctx.logger?.warn(`${PACKAGE_NAME}: ${behind.length} rows stayed behind their document; switching them one by one`)
  for (const { row, wanted } of behind) {
    try {
      await manager.setPluginEnabled(row.id, wanted)
    } catch (error) {
      ctx.logger?.warn(`${PACKAGE_NAME}: could not restore ${row.moduleName}: ${String(error)}`)
    }
  }
}

/** Batch-enable or -disable every operable entry so one preset's saved switches hold. */
async function applyPreset(ctx, config, presetId) {
  if (managerOf(ctx) === undefined) return { ok: false, code: 'plugin-manager-unavailable' }
  const rows = await listPlugins(ctx)
  const plugins = (rows ?? []).filter((plugin) => plugin.managed)
  const states = savedStates(config, presetId, plugins)
  if (states === undefined) return { ok: false, code: 'unknown-preset' }

  /** Every row this preset would move, with the enablement it asks for. */
  const targets = []
  for (const plugin of plugins) {
    // A row the profile cannot address is never switched, so it is neither an
    // attempt nor a failure; the preset keeps whatever the row actually does.
    if (plugin.readOnly) continue
    const desired = isPinned(config, plugin)
      ? true
      : Object.prototype.hasOwnProperty.call(states, plugin.id) ? states[plugin.id] === true : plugin.enabled
    if (desired === plugin.enabled) continue
    targets.push({ id: plugin.id, name: plugin.moduleName, patchId: plugin.patchId, desired })
  }

  const { applied, failures, reverted, stranded } = await switchRows(ctx, targets)
  if (reverted === true) {
    // The composition refused the set, so the stored active preset is unchanged.
    return { ok: false, code: 'preset-reverted', stranded: stranded ?? [] }
  }
  let activeId = presetId
  if (presetId !== ALL_ON_PRESET_ID && findPreset(config, presetId) === undefined) activeId = config.activePresetId
  config.activePresetId = activeId
  writeConfig(config)
  const after = (await listPlugins(ctx) ?? []).filter((plugin) => plugin.managed)
  return {
    ok: true,
    activePresetId: activeId,
    applied,
    failures,
    differences: differences(config, after, activeId),
    plugins: after,
  }
}

/** Force-enable every operable plugin the global list names, then persist that list. */
async function savePublic(ctx, config, nextPublicOn) {
  const rows = await listPlugins(ctx)
  const plugins = (rows ?? []).filter((plugin) => plugin.managed)
  const allowed = new Set(plugins.map((plugin) => plugin.id))
  const kept = nextPublicOn.filter((id) => allowed.has(id))
  const targets = []
  for (const plugin of plugins) {
    if (!kept.includes(plugin.id) || plugin.enabled || plugin.readOnly) continue
    targets.push({ id: plugin.id, name: plugin.moduleName, patchId: plugin.patchId, desired: true })
  }
  config.publicOn = kept
  const { applied, failures } = await switchRows(ctx, targets)
  writeConfig(config)
  return { ok: true, applied, failures }
}
/** Serialize one JSON response; every route answers with the same media type. */
function sendJson(res, status, payload) {
  const body = JSON.stringify(payload)
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(body)
}

/** Read a request body as UTF-8 text, refusing anything beyond the size bound. */
async function readBody(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_BODY_BYTES) throw new Error('request body too large')
    chunks.push(chunk)
  }
  return Buffer.concat(chunks).toString('utf8')
}

/** Parse a JSON request body into an object, or throw a diagnostic. */
async function readJson(req) {
  const text = await readBody(req)
  if (text.trim() === '') return {}
  const value = JSON.parse(text)
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('body must be a JSON object')
  return value
}

/** Keep only non-empty string members, in first-seen order. */
function stringList(value) {
  if (!Array.isArray(value)) return undefined
  const list = []
  for (const item of value) {
    if (typeof item !== 'string' || item === '' || list.includes(item)) continue
    list.push(item)
  }
  return list
}

/** Route handler for `GET /state`. */
async function handleState(ctx, res) {
  const { config, plugins, excluded, managerAvailable } = await readState(ctx)
  sendJson(res, 200, {
    ok: true,
    pluginManagerAvailable: managerAvailable,
    configPath: configPath(),
    excludedPath: excludedPath(),
    excluded,
    manage: [...manageable],
    plugins,
    publicOn: config.publicOn,
    presets: config.presets,
    activePresetId: config.activePresetId,
    differences: config.activePresetId === null ? [] : differences(config, plugins, config.activePresetId),
  })
}

/** Route handler for `POST /apply`. */
async function handleApply(ctx, req, res) {
  const body = await readJson(req)
  const presetId = typeof body.presetId === 'string' && body.presetId !== '' ? body.presetId : undefined
  if (presetId === undefined) {
    sendJson(res, 200, { ok: false, code: 'bad-request' })
    return
  }
  const config = readConfig(ctx.logger)
  const result = await applyPreset(ctx, config, presetId)
  sendJson(res, 200, result)
}

/** Route handler for `POST /public`. */
async function handlePublic(ctx, req, res) {
  const body = await readJson(req)
  const publicOn = stringList(body.publicOn)
  if (publicOn === undefined) {
    sendJson(res, 200, { ok: false, code: 'bad-request' })
    return
  }
  const config = readConfig(ctx.logger)
  const result = await savePublic(ctx, config, publicOn)
  const { plugins } = await readState(ctx)
  sendJson(res, 200, {
    ...result,
    publicOn: config.publicOn,
    plugins,
    differences: config.activePresetId === null ? [] : differences(config, plugins, config.activePresetId),
  })
}

/** Route handler for `POST /presets`: replace the stored preset list with the page's draft. */
async function handlePresets(ctx, req, res) {
  const body = await readJson(req)
  if (!Array.isArray(body.presets)) {
    sendJson(res, 200, { ok: false, code: 'bad-request' })
    return
  }
  const config = readConfig(ctx.logger)
  const incoming = normalizeConfig({ presets: body.presets })
  const { plugins } = await readState(ctx)
  const allowed = new Set(plugins.map((plugin) => plugin.id))
  const known = new Set(config.presets.map((preset) => preset.id))
  const next = []
  for (const preset of incoming.presets) {
    const existing = findPreset(config, preset.id)
    if (existing === undefined && !known.has(preset.id)) {
      sendJson(res, 200, { ok: false, code: 'unknown-preset' })
      return
    }
    // Newly created presets are already durable; only switches and names travel
    // here, and only for rows this page manages.
    const pluginStates = {}
    for (const [id, value] of Object.entries(preset.pluginStates)) {
      if (allowed.has(id)) pluginStates[id] = value
    }
    next.push({
      id: preset.id,
      name: preset.name,
      createdAt: existing === undefined ? preset.createdAt : existing.createdAt,
      pluginStates,
    })
  }
  if (next.length !== config.presets.length) {
    sendJson(res, 200, { ok: false, code: 'preset-count-mismatch' })
    return
  }
  config.presets = next
  writeConfig(config)
  sendJson(res, 200, { ok: true, presets: config.presets })
}

/** Route handler for `POST /create`. */
async function handleCreate(ctx, req, res) {
  const body = await readJson(req)
  const name = typeof body.name === 'string' && body.name.trim() !== '' ? body.name.trim() : 'Preset'
  const config = readConfig(ctx.logger)
  const { plugins } = await readState(ctx)
  // Every plugin starts off except the pinned ones, whose stored value agrees
  // with the "on" the page shows for them under a global or self-protected row.
  // An unaddressable row keeps what it actually does, since no preset can move it.
  const pluginStates = {}
  for (const plugin of plugins ?? []) pluginStates[plugin.id] = plugin.readOnly ? plugin.enabled : isPinned(config, plugin)
  const preset = { id: `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`, name, createdAt: Date.now(), pluginStates }
  config.presets.push(preset)
  writeConfig(config)
  sendJson(res, 200, { ok: true, preset })
}

/** Route handler for `POST /rename`. */
async function handleRename(ctx, req, res) {
  const body = await readJson(req)
  const id = typeof body.id === 'string' ? body.id : undefined
  const name = typeof body.name === 'string' && body.name.trim() !== '' ? body.name.trim() : undefined
  if (id === undefined || name === undefined) {
    sendJson(res, 200, { ok: false, code: 'bad-request' })
    return
  }
  const config = readConfig(ctx.logger)
  const preset = findPreset(config, id)
  if (preset === undefined) {
    sendJson(res, 200, { ok: false, code: 'unknown-preset' })
    return
  }
  preset.name = name
  writeConfig(config)
  sendJson(res, 200, { ok: true, preset })
}

/** Route handler for `POST /delete`. */
async function handleDelete(ctx, req, res) {
  const body = await readJson(req)
  const id = typeof body.id === 'string' ? body.id : undefined
  if (id === undefined || id === ALL_ON_PRESET_ID) {
    sendJson(res, 200, { ok: false, code: 'bad-request' })
    return
  }
  const config = readConfig(ctx.logger)
  const next = config.presets.filter((preset) => preset.id !== id)
  if (next.length === config.presets.length) {
    sendJson(res, 200, { ok: false, code: 'unknown-preset' })
    return
  }
  config.presets = next
  if (config.activePresetId === id) config.activePresetId = null
  writeConfig(config)
  sendJson(res, 200, { ok: true, presets: config.presets, activePresetId: config.activePresetId })
}

/** Route handler for `POST /order`: persist the drag order of the stored presets. */
async function handleOrder(ctx, req, res) {
  const body = await readJson(req)
  const order = stringList(body.order)
  if (order === undefined) {
    sendJson(res, 200, { ok: false, code: 'bad-request' })
    return
  }
  const config = readConfig(ctx.logger)
  if (order.length !== config.presets.length) {
    sendJson(res, 200, { ok: false, code: 'order-mismatch' })
    return
  }
  const byId = new Map(config.presets.map((preset) => [preset.id, preset]))
  const next = []
  for (const id of order) {
    const preset = byId.get(id)
    if (preset === undefined) {
      sendJson(res, 200, { ok: false, code: 'order-mismatch' })
      return
    }
    next.push(preset)
  }
  config.presets = next
  writeConfig(config)
  sendJson(res, 200, { ok: true, presets: config.presets })
}

/** Report a failed route without leaking a stack into the page. */
function ctxLogger(res, label, error) {
  if (res.headersSent) {
    res.end()
    return
  }
  sendJson(res, 500, { ok: false, code: 'internal', detail: `${label}: ${String(error)}` })
}

/**
 * Mount the preset-management routes and the new-plugin sync listener.
 * @param ctx Plugin context carrying `webServer`.
 * @param config Row config; `manage` replaces the default operable set.
 */
export function apply(ctx, config) {
  const configured = config === undefined ? undefined : config.manage
  if (Array.isArray(configured) && configured.length > 0 && configured.every((entry) => typeof entry === 'string')) {
    manageable = new Set(configured)
  }
  excludedSignature = null

  const handle = (path, handler, label) => {
    ctx.effect(
      () => ctx.webServer.register({
        kind: 'exact',
        path: `${ROUTE_BASE}/${path}`,
        handler: async (req, res) => {
          try {
            await handler(req, res)
          } catch (error) {
            ctx.logger?.warn(`${PACKAGE_NAME}: ${label} failed`)
            ctx.logger?.warn(error)
            ctxLogger(res, label, error)
          }
        },
      }),
      `${PACKAGE_NAME}: ${label}`,
    )
  }

  handle('state', (req, res) => handleState(ctx, res), 'state route')
  handle('apply', (req, res) => handleApply(ctx, req, res), 'apply route')
  handle('public', (req, res) => handlePublic(ctx, req, res), 'public route')
  handle('presets', (req, res) => handlePresets(ctx, req, res), 'presets route')
  handle('create', (req, res) => handleCreate(ctx, req, res), 'create route')
  handle('rename', (req, res) => handleRename(ctx, req, res), 'rename route')
  handle('delete', (req, res) => handleDelete(ctx, req, res), 'delete route')
  handle('order', (req, res) => handleOrder(ctx, req, res), 'order route')

  // A completed manager operation may have installed or removed an entry; the
  // next read adds every new entry to all presets with its observed state.
  ctx.on('plugin-manager/changed', () => {
    void (async () => {
      try {
        await readState(ctx)
      } catch (error) {
        ctx.logger?.warn(`${PACKAGE_NAME}: new-plugin sync failed`)
        ctx.logger?.warn(error)
      }
    })()
  })
}

export {
  configPath, excludedPath, normalizeConfig, differences, applyPreset,
  writeDisabledRows, splitPatchBlocks, isManageable,
}
