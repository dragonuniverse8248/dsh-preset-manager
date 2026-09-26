// Client half of the dsh-preset-manager plugin.
//
// Hand-written browser bundle in the lazy-CJS format the client module loader
// expects: it only REGISTERS the factory; the body runs at materialization.
// It registers one settings.section entry ("预设") with three tabs — 模式
// (modes), 全局 (global force-on), 预设 (edit) — and drives every mutation
// through the same-origin routes the Host half registers.
window.__ModuleLoader__.load({
  id: 'dsh-preset-manager',
  factory: (require) => {
    const React = require('react')
    const h = React.createElement

    /** Client locale namespace owned by this plugin. */
    const NS = 'settings.presetManager'
    /** Route prefix registered by the Host half. */
    const ROUTE = '/api/preset-manager'
    /** The virtual, never-stored "every plugin on" preset. */
    const ALL_ON = 'all-on'

    const zh = {
      nav: '预设',
      title: '插件预设',
      subtitle: '按组合批量切换插件启用状态；全局插件在所有预设中强制开启。',
      tabSwitch: '模式',
      tabPublic: '全局',
      tabPresets: '预设',
      allOn: '全部插件开启',
      allOnHint: '内置预设：所有插件开启，不可删除、不可重命名。',
      switchHint: '点击卡片即应用该预设，无需二次确认。',
      publicHint: '全局插件在所有预设中强制开启；全局只管理开启，不管理关闭。移除后不改变插件当前状态。',
      presetsHint: '点击一行即可展开该预设内的插件开关；拖拽行可调整顺序（立即保存）。',
      detectOk: '已激活',
      detectDrift: '状态不统一',
      driftNote: '当前激活预设保存的状态与实际插件状态不一致。',
      delete: '删除',
      rename: '重命名',
      add: '添加',
      remove: '移除',
      save: '保存',
      cancel: '取消',
      close: '关闭',
      expandAll: '一键展开',
      collapseAll: '一键折叠',
      newPreset: '新预设',
      protectedPublic: '受全局预设保护',
      protectedSelf: '预设管理器自身，始终开启',
      protectedSystem: '系统必需，始终开启',
      readOnlyRow: '该插件行无法通过配置修改',
      noPlugins: '没有可管理的插件。',
      emptyPublic: '全局列表为空：点击“添加”选择插件。',
      emptyPresets: '还没有预设：点击下方“+”新建。',
      pickerTitle: '选择要加入全局列表的插件',
      pickerEmpty: '所有插件都已在全局列表中。',
      added: '已添加',
      enabledCount: '{on} / {total} 个插件开启',
      confirmDeleteTitle: '删除预设',
      confirmDeleteBody: '确定要删除预设“{name}”吗？此操作不可撤销。',
      renameTitle: '重命名预设',
      renameLabel: '预设名称',
      createTitle: '新建预设',
      confirm: '确定',
      appliedOk: '已应用预设，成功切换 {n} 个插件。',
      applyFailed: '应用预设失败。',
      revertedTitle: '预设已还原',
      revertedBody: '该预设会停用其他插件依赖的插件，组合无法启动，已自动还原为切换前的状态。冲突插件：{names}',
      saveOk: '已保存。',
      saveFailed: '保存失败：{code}',
      stateError: '读取预设数据失败。',
      retry: '重试',
      failuresTitle: '以下插件未能切换',
      failuresHint: '已成功操作的插件保留变更。',
      copyFailures: '复制报错信息',
      copied: '已复制',
      configFile: '配置文件',
      excludedNote: '可操纵插件 {n} 个 ｜ 系统插件 {system} 个必然排除 ｜ 白名单排除 {left} 个 ｜ 清单：{path}',
      whitelist: '白名单',
      refresh: '刷新',
      refreshHint: '重新读取当前插件列表',
      whitelistTitle: '白名单',
      whitelistHint: '系统插件（{system} 个）必然排除，不在此列。下面是你安装的 {n} 个插件，默认可操纵；关掉某个开关即可把它排除在页面之外。',
      whitelistEmpty: '当前配置档没有安装任何第三方插件。',
      whitelistOperable: '可操纵',
      whitelistLeftOut: '已排除',
      whitelistSaved: '白名单已保存。',
      managerUnavailable: '当前配置档没有启用插件管理器，无法切换插件。',
      dragHint: '拖拽调整顺序',
      presetName: '预设名称',
    }

    const en = {
      nav: 'Presets',
      title: 'Plugin presets',
      subtitle: 'Switch plugin enablement in combinations; global plugins stay on in every preset.',
      tabSwitch: 'Modes',
      tabPublic: 'Global',
      tabPresets: 'Presets',
      allOn: 'All plugins on',
      allOnHint: 'Built-in preset: every plugin on, neither deletable nor renamable.',
      switchHint: 'Clicking a card applies that preset immediately, with no confirmation.',
      publicHint: 'Global plugins are forced on in every preset; the global list only manages on, never off. Removing one leaves its current state unchanged.',
      presetsHint: 'Click a row to expand that preset\u2019s switches; drag rows to reorder (saved immediately).',
      detectOk: 'Active',
      detectDrift: 'State differs',
      driftNote: 'The active preset\u2019s saved state differs from the plugins\u2019 actual state.',
      delete: 'Delete',
      rename: 'Rename',
      add: 'Add',
      remove: 'Remove',
      save: 'Save',
      cancel: 'Cancel',
      close: 'Close',
      expandAll: 'Expand all',
      collapseAll: 'Collapse all',
      newPreset: 'New preset',
      protectedPublic: 'Protected by the global list',
      protectedSelf: 'The preset manager itself, always on',
      protectedSystem: 'Required by the app, always on',
      readOnlyRow: 'This plugin row cannot be changed through configuration',
      noPlugins: 'No plugins to manage.',
      emptyPublic: 'The global list is empty: choose plugins with \u201cAdd\u201d.',
      emptyPresets: 'No presets yet: create one with \u201c+\u201d below.',
      pickerTitle: 'Choose plugins to add to the global list',
      pickerEmpty: 'Every plugin is already in the global list.',
      added: 'Added',
      enabledCount: '{on} / {total} on',
      confirmDeleteTitle: 'Delete preset',
      confirmDeleteBody: 'Delete the preset \u201c{name}\u201d? This cannot be undone.',
      renameTitle: 'Rename preset',
      renameLabel: 'Preset name',
      createTitle: 'New preset',
      confirm: 'Confirm',
      appliedOk: 'Preset applied; {n} plugins switched.',
      applyFailed: 'Applying the preset failed.',
      revertedTitle: 'Preset reverted',
      revertedBody: 'This preset would disable plugins the rest of the composition depends on, so the switch was reverted. Conflicting plugins: {names}',
      saveOk: 'Saved.',
      saveFailed: 'Save failed: {code}',
      stateError: 'Reading the preset data failed.',
      retry: 'Retry',
      failuresTitle: 'These plugins could not be switched',
      failuresHint: 'Plugins that did succeed keep their change.',
      copyFailures: 'Copy the report',
      copied: 'Copied',
      configFile: 'Config file',
      excludedNote: '{n} operable ｜ {system} system plugins necessarily excluded ｜ {left} left out by the whitelist ｜ list: {path}',
      whitelist: 'Whitelist',
      refresh: 'Refresh',
      refreshHint: 'Re-read the current plugin list',
      whitelistTitle: 'Whitelist',
      whitelistHint: 'The {system} system plugins are necessarily excluded and are not listed here. These are the {n} plugins you installed; each is operable by default, and turning one off leaves it out of the page.',
      whitelistEmpty: 'This profile has no third-party plugins installed.',
      whitelistOperable: 'Operable',
      whitelistLeftOut: 'Left out',
      whitelistSaved: 'Whitelist saved.',
      managerUnavailable: 'This profile has no plugin manager, so plugins cannot be switched.',
      dragHint: 'Drag to reorder',
      presetName: 'Preset name',
    }

    // Theme tokens only, so both light and dark themes follow the host. Each
    // keeps a readable literal fallback: a renamed token degrades, never breaks.
    const T = {
      layer1: 'var(--dsw-alias-bg-layer-1, #ffffff)',
      layer2: 'var(--dsw-alias-bg-layer-2, #f5f6f7)',
      layer3: 'var(--dsw-alias-bg-layer-3, #ffffff)',
      overlay: 'var(--dsw-alias-bg-overlay, #ffffff)',
      border1: 'var(--dsw-alias-border-l1, rgba(15, 17, 21, 0.08))',
      border2: 'var(--dsw-alias-border-l2, rgba(15, 17, 21, 0.16))',
      border3: 'var(--dsw-alias-border-l3, rgba(15, 17, 21, 0.12))',
      label1: 'var(--dsw-alias-label-primary, #0f1115)',
      label2: 'var(--dsw-alias-label-secondary, #61666b)',
      label3: 'var(--dsw-alias-label-tertiary, #8a8f96)',
      onForeground: 'var(--dsw-alias-label-primary-foreground, #ffffff)',
      primaryFill: 'var(--dsw-alias-button-primary-fill, #0f1115)',
      accent: 'var(--dsw-alias-button-info-fill, #3b6fe0)',
      accentTint: 'var(--dsw-alias-interactive-bg-hover-accent, rgba(59, 111, 224, 0.08))',
      hover: 'var(--dsw-alias-interactive-bg-hover, rgba(38, 49, 72, 0.06))',
      active: 'var(--dsw-alias-interactive-bg-active, rgba(38, 49, 72, 0.1))',
      danger: 'var(--dsw-alias-state-error-primary, #d93025)',
      warn: 'var(--dsw-alias-state-warn-primary, #e08b00)',
      radiusSm: 'var(--dsw-radius-sm, 6px)',
      radiusMd: 'var(--dsw-radius-md, 8px)',
    }

    const S = {
      wrap: { maxWidth: 760, margin: '0 auto', padding: '16px 20px 48px', color: T.label1 },
      title: { margin: '0 0 4px', fontSize: 20, fontWeight: 600 },
      subtitle: { margin: '0 0 14px', fontSize: 13, lineHeight: 1.6, color: T.label2 },
      tabs: { display: 'flex', gap: 4, padding: 3, marginBottom: 14, borderRadius: T.radiusMd, background: T.layer2, border: `1px solid ${T.border1}` },
      tab: { flex: 1, height: 30, fontSize: 13, borderRadius: T.radiusSm, border: '1px solid transparent', background: 'transparent', color: T.label2, cursor: 'pointer' },
      tabActive: { background: T.layer1, borderColor: T.border1, color: T.label1, fontWeight: 600 },
      toolbar: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' },
      hint: { fontSize: 12, lineHeight: 1.6, color: T.label2, margin: '0 0 10px' },
      grid: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 },
      // A short tile, the same height as the pinned "all on" row, so two fit
      // side by side without the empty space a square leaves.
      card: {
        position: 'relative', display: 'flex', flexDirection: 'column', gap: 6, padding: '10px 12px',
        minHeight: 64, justifyContent: 'center',
        borderRadius: T.radiusMd, border: `1px solid ${T.border2}`, background: T.layer1, color: T.label1,
        cursor: 'pointer', overflow: 'hidden',
      },
      cardAllOn: { gridColumn: '1 / -1' },
      cardActive: { borderColor: T.accent, background: T.accentTint },
      cardDrift: { borderColor: T.warn },
      cardHead: { display: 'flex', alignItems: 'center', gap: 8 },
      cardName: { flex: 1, minWidth: 0, fontSize: 14, fontWeight: 600, overflowWrap: 'anywhere' },
      cardBody: { display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: T.label2, textAlign: 'center' },
      cardBodyLeft: { justifyContent: 'flex-start', textAlign: 'left' },
      cardActions: { display: 'flex', gap: 6, flexShrink: 0 },
      badge: {
        alignSelf: 'flex-start', fontSize: 11, lineHeight: '16px', padding: '0 7px', borderRadius: 999,
        border: `1px solid ${T.accent}`, color: T.accent,
      },
      badgeDrift: { borderColor: T.warn, color: T.warn },
      button: {
        fontSize: 12, lineHeight: '18px', height: 28, padding: '0 10px', borderRadius: T.radiusSm,
        cursor: 'pointer', border: `0.5px solid ${T.border3}`, background: 'transparent', color: T.label1,
      },
      buttonPrimary: { background: T.primaryFill, borderColor: 'transparent', color: T.onForeground },
      buttonDanger: { borderColor: T.danger, color: T.danger },
      smallButton: {
        fontSize: 11, lineHeight: '16px', height: 22, padding: '0 8px', borderRadius: T.radiusSm,
        cursor: 'pointer', border: `0.5px solid ${T.border3}`, background: 'transparent', color: T.label2,
      },
      row: { display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', borderRadius: T.radiusSm, border: `1px solid ${T.border1}`, background: T.layer1, marginBottom: 6 },
      rowTitle: { flex: 1, minWidth: 0, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
      rowMeta: { fontSize: 11, color: T.label3, whiteSpace: 'nowrap' },
      list: { maxHeight: 320, overflow: 'auto', marginBottom: 10 },
      picker: { border: `1px solid ${T.border2}`, borderRadius: T.radiusMd, background: T.layer3, padding: 10, marginBottom: 12 },
      pickerRow: { display: 'flex', alignItems: 'center', gap: 10, padding: '7px 9px', borderRadius: T.radiusSm, cursor: 'pointer', fontSize: 13 },
      pickerRowDisabled: { opacity: 0.45, cursor: 'default' },
      footer: { display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 },
      // The edit tab lists one accordion row per preset: a full-width header
      // that expands in place, with no active or drifted styling of its own.
      presetList: { display: 'flex', flexDirection: 'column', gap: 8 },
      presetCard: { display: 'flex', flexDirection: 'column', borderRadius: T.radiusMd, border: `1px solid ${T.border2}`, background: T.layer1, overflow: 'hidden' },
      presetHead: { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', minHeight: 52, cursor: 'pointer' },
      presetChevron: { flexShrink: 0, width: 14, fontSize: 11, color: T.label3, textAlign: 'center' },
      presetMeta: { flexShrink: 0, fontSize: 12, color: T.label3, whiteSpace: 'nowrap' },
      presetSwitches: { borderTop: `1px solid ${T.border1}`, background: T.layer2, padding: 8, maxHeight: 280, overflow: 'auto' },
      switchRow: { display: 'flex', alignItems: 'center', gap: 8, padding: '4px 6px', borderRadius: T.radiusSm },
      switchLabel: { flex: 1, minWidth: 0, fontSize: 12, color: T.label1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
      switchNote: { fontSize: 10, color: T.label3, whiteSpace: 'nowrap' },
      // Sizes and fills copied from the host Switch primitive so the control is
      // indistinguishable from a shipped one in either theme.
      toggleTrack: {
        boxSizing: 'border-box', position: 'relative', flex: '0 0 auto', width: 36, height: 20, padding: 2,
        border: 0, borderRadius: 999, background: T.border3, cursor: 'pointer', transition: 'background 120ms ease',
      },
      toggleTrackOn: { background: T.primaryFill },
      toggleTrackDisabled: { cursor: 'default', opacity: 0.5 },
      toggleKnob: {
        position: 'absolute', top: 2, left: 2, display: 'block', width: 16, height: 16, borderRadius: '50%',
        background: T.onForeground, transition: 'transform 120ms ease',
      },
      toggleKnobOn: { transform: 'translateX(16px)' },
      overlay: { position: 'fixed', inset: 0, zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.35)' },
      dialog: { width: 420, maxWidth: '90vw', borderRadius: T.radiusMd, padding: 20, background: T.layer3, boxShadow: '0 8px 30px rgba(0,0,0,0.18)', color: T.label1 },
      dialogTitle: { margin: '0 0 10px', fontSize: 16, fontWeight: 600 },
      dialogBody: { fontSize: 14, lineHeight: 1.6, color: T.label2, marginBottom: 16, overflowWrap: 'anywhere' },
      dialogActions: { display: 'flex', justifyContent: 'flex-end', gap: 8 },
      input: {
        boxSizing: 'border-box', width: '100%', fontSize: 14, height: 32, padding: '0 10px', borderRadius: T.radiusSm,
        border: `0.5px solid ${T.border3}`, background: T.layer1, color: T.label1, marginBottom: 16,
      },
      notice: { fontSize: 12, color: T.label2, margin: '4px 0 8px' },
      // Non-modal failure summary anchored to the corner so the page stays usable.
      failPanel: {
        position: 'fixed', right: 18, bottom: 18, zIndex: 9000, width: 380, maxWidth: '92vw',
        borderRadius: T.radiusMd, border: `1px solid ${T.warn}`, background: T.layer3,
        boxShadow: '0 8px 30px rgba(0,0,0,0.18)', padding: 14, color: T.label1,
      },
      failTitle: { margin: '0 0 6px', fontSize: 14, fontWeight: 600, color: T.warn },
      failList: { maxHeight: 200, overflow: 'auto', margin: '8px 0', fontSize: 12, lineHeight: 1.7, color: T.label2 },
      failLine: { overflowWrap: 'anywhere' },
      center: { padding: '28px 0', textAlign: 'center', fontSize: 13, color: T.label2 },
    }

    // ---- helpers ----

    /** Resolve a localized text value against the active locale, then English, then the first value. */
    function text(value, lang) {
      if (typeof value === 'string') return value
      if (value === null || typeof value !== 'object') return ''
      if (typeof value[lang] === 'string') return value[lang]
      if (typeof value.en === 'string') return value.en
      for (const candidate of Object.values(value)) {
        if (typeof candidate === 'string') return candidate
      }
      return ''
    }

    /** Append the lowest free numeric suffix so a name stays unique among `taken`. */
    function uniqueName(base, taken) {
      const trimmed = String(base).trim() === '' ? 'Preset' : String(base).trim()
      const match = /^(.*?)\s*\((\d+)\)$/.exec(trimmed)
      const root = match === null ? trimmed : match[1]
      let index = match === null ? 1 : Number(match[2])
      for (;;) {
        const candidate = index === 1 ? root : `${root} (${index})`
        if (!taken.has(candidate)) return candidate
        index += 1
      }
    }

    /** One same-origin call to the Host half; resolves to the parsed JSON body. */
    function api(action, body) {
      const init = body === undefined
        ? { headers: { accept: 'application/json' } }
        : { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(body) }
      return fetch(`${ROUTE}/${action}`, init).then((response) => response.json())
    }

    /** Copy text through the async clipboard API, falling back to a selection copy. */
    function copyText(value) {
      const fallback = () => {
        try {
          const area = document.createElement('textarea')
          area.value = value
          area.setAttribute('readonly', '')
          area.style.position = 'fixed'
          area.style.top = '-1000px'
          document.body.appendChild(area)
          area.select()
          const ok = document.execCommand('copy')
          document.body.removeChild(area)
          return ok
        } catch (error) {
          void error
          return false
        }
      }
      try {
        if (typeof navigator !== 'undefined' && navigator.clipboard !== undefined && typeof navigator.clipboard.writeText === 'function') {
          return navigator.clipboard.writeText(value).then(() => true).catch(() => fallback())
        }
      } catch (error) {
        void error
      }
      return Promise.resolve(fallback())
    }

    /** Deep-copy the stored presets into an editable draft. */
    function clonePresets(presets) {
      return presets.map((preset) => ({
        id: preset.id,
        name: preset.name,
        createdAt: preset.createdAt,
        pluginStates: { ...preset.pluginStates },
      }))
    }

    // ---- controls ----

    function Toggle(props) {
      const { checked, disabled, onChange, label } = props
      return h('button', {
        type: 'button',
        role: 'switch',
        'aria-checked': checked ? 'true' : 'false',
        'aria-label': label,
        disabled: disabled === true,
        title: label,
        onClick: (event) => {
          event.stopPropagation()
          if (disabled === true || typeof onChange !== 'function') return
          onChange(!checked)
        },
        style: {
          ...S.toggleTrack,
          ...(checked ? S.toggleTrackOn : {}),
          ...(disabled === true ? S.toggleTrackDisabled : {}),
        },
      }, h('span', { style: { ...S.toggleKnob, ...(checked ? S.toggleKnobOn : {}) } }))
    }

    function Modal(props) {
      const { title, children, onCancel, actions } = props
      React.useEffect(() => {
        const onKey = (event) => {
          if (event.key === 'Escape') onCancel()
        }
        document.addEventListener('keydown', onKey, true)
        return () => document.removeEventListener('keydown', onKey, true)
      }, [onCancel])
      return h('div', {
        style: S.overlay,
        onClick: onCancel,
      }, h('div', {
        style: S.dialog,
        role: 'dialog',
        'aria-modal': 'true',
        'aria-label': title,
        onClick: (event) => event.stopPropagation(),
      },
      h('h3', { style: S.dialogTitle }, title),
      children,
      h('div', { style: S.dialogActions }, actions)))
    }

    // ---- tabs ----

    function SwitchTab(props) {
      const { t, plugins, presets, activePresetId, differences, busy, onApply, onRename, onDelete } = props
      const drift = differences.length > 0
      const allOnCard = h('div', {
        key: ALL_ON,
        style: { ...S.card, ...S.cardAllOn, ...(activePresetId === ALL_ON ? (drift ? S.cardDrift : S.cardActive) : {}) },
        onClick: () => onApply(ALL_ON),
      },
      h('div', { style: S.cardHead },
        h('div', { style: S.cardName }, t('allOn')),
        activePresetId === ALL_ON
          ? h('span', { style: { ...S.badge, ...(drift ? S.badgeDrift : {}) } }, drift ? t('detectDrift') : t('detectOk'))
          : null),
      h('div', { style: { ...S.cardBody, ...S.cardBodyLeft } }, t('allOnHint')))

      const cards = presets.map((preset) => {
        const active = activePresetId === preset.id
        const onCount = plugins.filter((plugin) => preset.pluginStates[plugin.id] === true).length
        return h('div', {
          key: preset.id,
          style: { ...S.card, ...(active ? (drift ? S.cardDrift : S.cardActive) : {}) },
          onClick: () => onApply(preset.id),
        },
        h('div', { style: S.cardHead },
          h('div', { style: S.cardName }, preset.name),
          active
            ? h('span', { style: { ...S.badge, ...(drift ? S.badgeDrift : {}) } }, drift ? t('detectDrift') : t('detectOk'))
            : null,
          h('div', { style: S.cardActions },
            h('button', {
              type: 'button', style: S.smallButton, title: t('rename'),
              onClick: (event) => { event.stopPropagation(); onRename(preset) },
            }, t('rename')),
            h('button', {
              type: 'button', style: { ...S.smallButton, ...S.buttonDanger }, title: t('delete'),
              onClick: (event) => { event.stopPropagation(); onDelete(preset) },
            }, t('delete')))),
        h('div', { style: { ...S.cardBody, ...S.cardBodyLeft } }, t('enabledCount', { on: onCount, total: plugins.length })))
      })

      return h('div', null,
        h('p', { style: S.hint }, t('switchHint')),
        drift && activePresetId !== null ? h('p', { style: { ...S.hint, color: T.warn } }, t('driftNote')) : null,
        busy ? h('p', { style: S.notice }, '…') : null,
        h('div', { style: S.grid }, allOnCard, cards))
    }

    function PublicTab(props) {
      const { t, plugins, draft, picker, busy, onTogglePicker, onAdd, onRemove, onSave, onCancel } = props
      const byId = new Map(plugins.map((plugin) => [plugin.id, plugin]))
      const draftSet = new Set(draft)
      const rows = draft.map((id) => {
        const plugin = byId.get(id)
        return h('div', { key: id, style: S.row },
          h('div', { style: S.rowTitle, title: plugin === undefined ? id : text(plugin.title, props.lang) || plugin.moduleName },
            plugin === undefined ? id : text(plugin.title, props.lang) || plugin.moduleName),
          h('div', { style: S.rowMeta }, plugin === undefined ? '' : plugin.moduleName),
          h('button', {
            type: 'button', style: { ...S.smallButton, ...S.buttonDanger }, disabled: busy,
            onClick: () => onRemove(id),
          }, t('remove')))
      })

      const available = plugins.filter((plugin) => !draftSet.has(plugin.id))
      const pickerNode = picker
        ? h('div', { style: S.picker },
          h('div', { style: { ...S.hint, marginBottom: 8 } }, `${t('pickerTitle')} — ${t('added')}: ${draft.length}`),
          available.length === 0
            ? h('div', { style: S.center }, t('pickerEmpty'))
            : h('div', { style: S.list }, plugins.map((plugin) => {
              const already = draftSet.has(plugin.id)
              return h('div', {
                key: plugin.id,
                style: { ...S.pickerRow, ...(already ? S.pickerRowDisabled : {}) },
                onClick: () => { if (!already) onAdd(plugin.id) },
                title: plugin.moduleName,
              },
              h('span', { style: S.rowTitle }, text(plugin.title, props.lang) || plugin.moduleName),
              h('span', { style: S.rowMeta }, already ? t('added') : plugin.moduleName))
            })))
        : null

      return h('div', null,
        h('p', { style: S.hint }, t('publicHint')),
        h('div', { style: S.toolbar },
          h('button', { type: 'button', style: { ...S.button, ...S.buttonPrimary }, onClick: onTogglePicker, disabled: busy }, t('add')),
          h('span', { style: { ...S.rowMeta, marginLeft: 'auto' } }, `${draft.length}`)),
        pickerNode,
        plugins.length === 0
          ? h('div', { style: S.center }, t('noPlugins'))
          : draft.length === 0 ? h('div', { style: S.center }, t('emptyPublic')) : rows,
        h('div', { style: S.footer },
          h('button', { type: 'button', style: S.button, onClick: onCancel, disabled: busy }, t('cancel')),
          h('button', { type: 'button', style: { ...S.button, ...S.buttonPrimary }, onClick: onSave, disabled: busy }, t('save'))))
    }

    function PresetsTab(props) {
      const {
        t, lang, plugins, draft, expanded, busy, dragOver,
        onToggleExpand, onTogglePlugin, onRename, onDelete, onCreate,
        onCollapseAll, onExpandAll, onSave, onCancel,
        onDragStart, onDragOver, onDragLeave, onDrop,
      } = props

      const protectedIds = new Set(props.publicOn)
      for (const plugin of plugins) if (plugin.self || plugin.system) protectedIds.add(plugin.id)
      const protectionNote = (plugin) => {
        if (plugin.system) return t('protectedSystem')
        if (plugin.self) return t('protectedSelf')
        return t('protectedPublic')
      }
      const switchRows = (preset, locked) => plugins.map((plugin) => {
        const isProtected = locked || protectedIds.has(plugin.id)
        const checked = isProtected ? true : preset.pluginStates[plugin.id] === true
        const disabled = isProtected || plugin.readOnly === true || busy
        const note = isProtected
          ? (locked ? t('protectedSystem') : protectionNote(plugin))
          : plugin.readOnly === true ? t('readOnlyRow') : ''
        return h('div', { key: plugin.id, style: S.switchRow },
          h('span', { style: S.switchLabel, title: plugin.moduleName }, text(plugin.title, lang) || plugin.moduleName),
          note === '' ? null : h('span', { style: S.switchNote }, note),
          h(Toggle, {
            checked, disabled, label: text(plugin.title, lang) || plugin.moduleName,
            onChange: (next) => onTogglePlugin(preset.id, plugin.id, next),
          }))
      })

      /** One accordion row's header: chevron, name, count, and its own actions. */
      const accordionHead = (options) => h('div', {
        style: S.presetHead,
        onClick: options.onToggle,
      },
      h('span', { style: S.presetChevron }, options.open ? '▾' : '▸'),
      h('div', { style: S.cardName }, options.name),
      h('span', { style: S.presetMeta }, t('enabledCount', { on: options.onCount, total: plugins.length })),
      options.actions === null
        ? null
        : h('div', { style: S.cardActions },
          h('button', {
            type: 'button', style: S.smallButton,
            onClick: (event) => { event.stopPropagation(); options.actions.rename() },
          }, t('rename')),
          h('button', {
            type: 'button', style: { ...S.smallButton, ...S.buttonDanger },
            onClick: (event) => { event.stopPropagation(); options.actions.remove() },
          }, t('delete'))))

      const allOnRow = h('div', { key: ALL_ON, style: S.presetCard },
        accordionHead({
          open: expanded[ALL_ON] === true,
          name: t('allOn'),
          onCount: plugins.length,
          actions: null,
          onToggle: () => onToggleExpand(ALL_ON),
        }),
        expanded[ALL_ON] === true
          ? h('div', { style: S.presetSwitches }, switchRows({ id: ALL_ON, pluginStates: {} }, true))
          : null)

      const rows = draft.map((preset) => {
        const isOpen = expanded[preset.id] === true
        const onCount = plugins.filter((plugin) => protectedIds.has(plugin.id) || preset.pluginStates[plugin.id] === true).length
        return h('div', {
          key: preset.id,
          style: {
            ...S.presetCard,
            ...(dragOver === preset.id ? { outline: `2px solid ${T.accent}`, outlineOffset: -2 } : {}),
          },
          draggable: busy ? false : true,
          onDragStart: (event) => onDragStart(event, preset.id),
          onDragOver: (event) => onDragOver(event, preset.id),
          onDragLeave: () => onDragLeave(preset.id),
          onDrop: (event) => onDrop(event, preset.id),
        },
        accordionHead({
          open: isOpen,
          name: preset.name,
          onCount,
          actions: { rename: () => onRename(preset), remove: () => onDelete(preset) },
          onToggle: () => onToggleExpand(preset.id),
        }),
        isOpen ? h('div', { style: S.presetSwitches }, switchRows(preset, false)) : null)
      })

      return h('div', null,
        h('p', { style: S.hint }, t('presetsHint')),
        h('div', { style: S.toolbar },
          h('button', { type: 'button', style: S.button, onClick: onExpandAll, disabled: busy }, t('expandAll')),
          h('button', { type: 'button', style: S.button, onClick: onCollapseAll, disabled: busy }, t('collapseAll')),
          h('span', { style: { ...S.rowMeta, marginLeft: 'auto' } }, t('dragHint'))),
        plugins.length === 0 ? h('div', { style: S.center }, t('noPlugins')) : null,
        h('div', { style: S.presetList }, allOnRow, rows),
        h('div', { style: { ...S.footer, justifyContent: 'space-between', marginTop: 14 } },
          h('button', { type: 'button', style: S.button, onClick: onCreate, disabled: busy }, '+ ' + t('newPreset')),
          h('div', { style: { display: 'flex', gap: 8 } },
            h('button', { type: 'button', style: S.button, onClick: onCancel, disabled: busy }, t('cancel')),
            h('button', { type: 'button', style: { ...S.button, ...S.buttonPrimary }, onClick: onSave, disabled: busy }, t('save')))))
    }

    /**
     * Whitelist editor: the recognized plugins and whether each stays operable.
     * System plugins are not listed because no preset may switch them.
     */
    function WhitelistDialog(props) {
      const { t, lang, catalog, systemExcluded, draft, onToggle, onCancel, onSave, busy } = props
      const leftOut = draft.size
      const rows = catalog.map((entry) => {
        const operable = !draft.has(entry.package)
        return h('div', { key: entry.id, style: S.switchRow },
          h('span', { style: S.switchLabel, title: entry.moduleName }, text(entry.title, lang) || entry.moduleName),
          h('span', { style: S.switchNote }, operable ? t('whitelistOperable') : t('whitelistLeftOut')),
          h(Toggle, {
            checked: operable,
            disabled: busy,
            label: text(entry.title, lang) || entry.moduleName,
            onChange: (next) => onToggle(entry.package, next),
          }))
      })
      return h(Modal, {
        title: t('whitelistTitle'),
        onCancel,
        actions: [
          h('button', { key: 'cancel', type: 'button', style: S.button, onClick: onCancel, disabled: busy }, t('cancel')),
          h('button', {
            key: 'ok', type: 'button', style: { ...S.button, ...S.buttonPrimary },
            onClick: onSave, disabled: busy,
          }, t('save')),
        ],
      },
      h('div', { style: { ...S.dialogBody, marginBottom: 10 } },
        t('whitelistHint', { system: systemExcluded, n: catalog.length })),
      catalog.length === 0
        ? h('div', { style: S.center }, t('whitelistEmpty'))
        : h('div', { style: S.list }, rows),
      h('div', { style: S.switchNote }, leftOut === 0 ? '' : `${t('whitelistLeftOut')} ${String(leftOut)}`))
    }

    // ---- page ----

    function PresetManagerPage(props) {
      const t = typeof props.t === 'function'
        ? props.t
        : (key, params) => {
          let value = zh[key] === undefined ? key : zh[key]
          if (params !== undefined) {
            for (const [name, replacement] of Object.entries(params)) value = value.split(`{${name}}`).join(String(replacement))
          }
          return value
        }
      const lang = typeof props.activeLocale === 'function' ? props.activeLocale() : 'en'

      const [view, setView] = React.useState({
        status: 'loading', error: null, plugins: [], publicOn: [], presets: [],
        activePresetId: null, differences: [], configPath: '', excludedPath: '',
        excluded: 0, systemExcluded: 0, catalog: [], whitelist: { exclude: [] }, managerAvailable: true,
      })
      const [tab, setTab] = React.useState('switch')
      const [publicDraft, setPublicDraft] = React.useState(null)
      const [presetDraft, setPresetDraft] = React.useState(null)
      const [expanded, setExpanded] = React.useState({})
      const [picker, setPicker] = React.useState(false)
      const [dialog, setDialog] = React.useState(null)
      const [busy, setBusy] = React.useState(false)
      const [notice, setNotice] = React.useState(null)
      const [failures, setFailures] = React.useState(null)
      const [copied, setCopied] = React.useState(false)
      const [drift, setDrift] = React.useState([])
      const [dragOver, setDragOver] = React.useState(null)
      const [whitelistDraft, setWhitelistDraft] = React.useState(null)
      const [refreshing, setRefreshing] = React.useState(false)
      const dragId = React.useRef(null)

      /** Re-read the Host document; `detect` also refreshes the switch tab's drift comparison. */
      const reload = React.useCallback(async (detect) => {
        try {
          const response = await api('state')
          if (response === null || typeof response !== 'object' || response.ok !== true) {
            throw new Error(response === null || response === undefined ? 'no response' : String(response.code ?? 'state'))
          }
          setView({
            status: 'ready', error: null,
            plugins: response.plugins ?? [], publicOn: response.publicOn ?? [], presets: response.presets ?? [],
            activePresetId: response.activePresetId ?? null, differences: response.differences ?? [],
            configPath: response.configPath ?? '', excludedPath: response.excludedPath ?? '',
            excluded: typeof response.excluded === 'number' ? response.excluded : 0,
            systemExcluded: typeof response.systemExcluded === 'number' ? response.systemExcluded : 0,
            catalog: response.catalog ?? [],
            whitelist: response.whitelist ?? { exclude: [] },
            managerAvailable: response.pluginManagerAvailable !== false,
          })
          if (detect) setDrift(response.differences ?? [])
          return response
        } catch (error) {
          setView((current) => ({ ...current, status: 'error', error: String(error && error.message ? error.message : error) }))
          return null
        }
      }, [])

      React.useEffect(() => { void reload(true) }, [reload])

      /** Open a tab: unsaved edits of the tab being left are discarded silently. */
      const openTab = async (next) => {
        setTab(next)
        setPicker(false)
        setFailures(null)
        setNotice(null)
        setCopied(false)
        const response = await reload(next === 'switch')
        if (next === 'public') setPublicDraft((response?.publicOn ?? []).slice())
        else setPublicDraft(null)
        if (next === 'presets') setPresetDraft(clonePresets(response?.presets ?? []))
        else setPresetDraft(null)
      }

      /** Re-read the plugin list on demand, without leaving the current tab. */
      const refresh = async () => {
        setRefreshing(true)
        setNotice(null)
        try {
          await reload(tab === 'switch')
        } finally {
          setRefreshing(false)
        }
      }

      /** Save the whitelist: only the recognized packages left out are stored. */
      const saveWhitelist = async () => {
        const draft = whitelistDraft ?? new Set()
        setBusy(true)
        setNotice(null)
        try {
          const response = await api('whitelist', { exclude: [...draft] })
          if (response?.ok !== true) {
            setNotice(t('saveFailed', { code: String(response?.code ?? 'unknown') }))
            return
          }
          setWhitelistDraft(null)
          setNotice(t('whitelistSaved'))
          await reload(tab === 'switch')
        } catch (error) {
          setNotice(t('saveFailed', { code: String(error && error.message ? error.message : error) }))
        } finally {
          setBusy(false)
        }
      }

      const applyPreset = async (presetId) => {
        if (busy) return
        setBusy(true)
        setNotice(null)
        setFailures(null)
        try {
          const response = await api('apply', { presetId })
          if (response !== null && typeof response === 'object' && response.code === 'preset-reverted') {
            const names = Array.isArray(response.stranded) ? response.stranded.slice(0, 6).join('、') : ''
            setNotice(`${t('revertedTitle')}：${t('revertedBody', { names })}`)
          } else if (response === null || typeof response !== 'object' || response.ok !== true) {
            setNotice(response?.code === 'plugin-manager-unavailable' ? t('managerUnavailable') : t('applyFailed'))
          } else {
            setNotice(t('appliedOk', { n: response.applied ?? 0 }))
            if (Array.isArray(response.failures) && response.failures.length > 0) setFailures(response.failures)
          }
          const fresh = await reload(false)
          if (fresh !== null) setDrift(fresh.differences ?? [])
        } catch (error) {
          setNotice(t('applyFailed') + ' ' + String(error && error.message ? error.message : error))
        } finally {
          setBusy(false)
        }
      }

      const renamePreset = async (preset, name) => {
        const taken = new Set(view.presets.filter((item) => item.id !== preset.id).map((item) => item.name))
        const finalName = uniqueName(name, taken)
        setDialog(null)
        setBusy(true)
        try {
          const response = await api('rename', { id: preset.id, name: finalName })
          if (response?.ok !== true) {
            setNotice(t('saveFailed', { code: String(response?.code ?? 'unknown') }))
            return
          }
          setView((current) => ({ ...current, presets: current.presets.map((item) => (item.id === preset.id ? { ...item, name: finalName } : item)) }))
          setPresetDraft((current) => current === null ? null : current.map((item) => (item.id === preset.id ? { ...item, name: finalName } : item)))
          setNotice(t('saveOk'))
        } catch (error) {
          setNotice(t('saveFailed', { code: String(error && error.message ? error.message : error) }))
        } finally {
          setBusy(false)
        }
      }

      const deletePreset = async (preset) => {
        setDialog(null)
        setBusy(true)
        try {
          const response = await api('delete', { id: preset.id })
          if (response?.ok !== true) {
            setNotice(t('saveFailed', { code: String(response?.code ?? 'unknown') }))
            return
          }
          setView((current) => ({
            ...current,
            presets: current.presets.filter((item) => item.id !== preset.id),
            activePresetId: current.activePresetId === preset.id ? null : current.activePresetId,
          }))
          setPresetDraft((current) => current === null ? null : current.filter((item) => item.id !== preset.id))
          setNotice(t('saveOk'))
        } catch (error) {
          setNotice(t('saveFailed', { code: String(error && error.message ? error.message : error) }))
        } finally {
          setBusy(false)
        }
      }

      const createPreset = async () => {
        setBusy(true)
        try {
          const taken = new Set(view.presets.map((item) => item.name))
          const response = await api('create', { name: uniqueName(t('newPreset'), taken) })
          if (response?.ok !== true || response.preset === undefined) {
            setNotice(t('saveFailed', { code: String(response?.code ?? 'unknown') }))
            return
          }
          const preset = response.preset
          setView((current) => ({ ...current, presets: [...current.presets, preset] }))
          setPresetDraft((current) => (current === null ? null : [...current, { id: preset.id, name: preset.name, createdAt: preset.createdAt, pluginStates: { ...preset.pluginStates } }]))
          setExpanded((current) => ({ ...current, [preset.id]: true }))
        } catch (error) {
          setNotice(t('saveFailed', { code: String(error && error.message ? error.message : error) }))
        } finally {
          setBusy(false)
        }
      }

      const savePublic = async () => {
        setBusy(true)
        setNotice(null)
        setFailures(null)
        try {
          const response = await api('public', { publicOn: publicDraft ?? [] })
          if (response?.ok !== true) {
            setNotice(t('saveFailed', { code: String(response?.code ?? 'unknown') }))
            return
          }
          if (Array.isArray(response.failures) && response.failures.length > 0) setFailures(response.failures)
          setNotice(t('saveOk'))
          const fresh = await reload(true)
          setPublicDraft((fresh?.publicOn ?? response.publicOn ?? []).slice())
        } catch (error) {
          setNotice(t('saveFailed', { code: String(error && error.message ? error.message : error) }))
        } finally {
          setBusy(false)
        }
      }

      const savePresets = async () => {
        setBusy(true)
        setNotice(null)
        try {
          const response = await api('presets', { presets: presetDraft ?? [] })
          if (response?.ok !== true) {
            setNotice(t('saveFailed', { code: String(response?.code ?? 'unknown') }))
            return
          }
          setNotice(t('saveOk'))
          const fresh = await reload(true)
          setPresetDraft(clonePresets(fresh?.presets ?? response.presets ?? []))
        } catch (error) {
          setNotice(t('saveFailed', { code: String(error && error.message ? error.message : error) }))
        } finally {
          setBusy(false)
        }
      }

      const togglePlugin = (presetId, pluginId, next) => {
        setPresetDraft((current) => current === null ? null : current.map((preset) => {
          if (preset.id !== presetId) return preset
          return { ...preset, pluginStates: { ...preset.pluginStates, [pluginId]: next } }
        }))
      }

      /** Reorder the draft locally, then persist the new order immediately. */
      const dropOn = async (event, targetId) => {
        event.preventDefault()
        setDragOver(null)
        const fromId = dragId.current
        dragId.current = null
        if (fromId === null || fromId === targetId) return
        const current = presetDraft ?? []
        const fromIndex = current.findIndex((preset) => preset.id === fromId)
        const toIndex = current.findIndex((preset) => preset.id === targetId)
        if (fromIndex < 0 || toIndex < 0) return
        const next = current.slice()
        const [moved] = next.splice(fromIndex, 1)
        next.splice(toIndex, 0, moved)
        setPresetDraft(next)
        try {
          const response = await api('order', { order: next.map((preset) => preset.id) })
          if (response?.ok !== true) setNotice(t('saveFailed', { code: String(response?.code ?? 'unknown') }))
        } catch (error) {
          setNotice(t('saveFailed', { code: String(error && error.message ? error.message : error) }))
        }
      }

      const failureReport = failures === null ? '' : failures
        .map((failure) => `${failure.name ?? failure.id}\t${failure.code}${failure.detail ? `\t${failure.detail}` : ''}`)
        .join('\n')

      const dialogNode = dialog === null ? null : dialog.kind === 'delete'
        ? h(Modal, {
          title: t('confirmDeleteTitle'),
          onCancel: () => setDialog(null),
          actions: [
            h('button', { key: 'cancel', type: 'button', style: S.button, onClick: () => setDialog(null) }, t('cancel')),
            h('button', {
              key: 'ok', type: 'button', style: { ...S.button, ...S.buttonDanger },
              onClick: () => { void deletePreset(dialog.preset) },
            }, t('confirm')),
          ],
        }, h('div', { style: S.dialogBody }, t('confirmDeleteBody', { name: dialog.preset.name })))
        : h(RenameDialog, {
          t, preset: dialog.preset, onCancel: () => setDialog(null),
          onConfirm: (name) => { void renamePreset(dialog.preset, name) },
        })

      /** Recognized plugins the whitelist leaves out, for the summary line. */
      const leftOutCount = (view.catalog ?? []).filter((entry) => entry.operable === false).length

      const body = view.status === 'loading'
        ? h('div', { style: S.center }, '…')
        : view.status === 'error'
          ? h('div', { style: S.center },
            t('stateError') + (view.error ? `: ${view.error}` : ''),
            h('div', { style: { marginTop: 8 } },
              h('button', { type: 'button', style: S.button, onClick: () => { void reload(true) } }, t('retry'))))
          : h('div', null,
            h('div', { style: S.tabs },
              [['switch', t('tabSwitch')], ['public', t('tabPublic')], ['presets', t('tabPresets')]].map(([id, label]) =>
                h('button', {
                  key: id, type: 'button',
                  style: { ...S.tab, ...(tab === id ? S.tabActive : {}) },
                  onClick: () => { void openTab(id) },
                }, label))),
            !view.managerAvailable ? h('p', { style: { ...S.hint, color: T.danger } }, t('managerUnavailable')) : null,
            h('div', { style: S.toolbar },
              h('button', {
                type: 'button', style: S.button, disabled: busy || refreshing,
                onClick: () => setWhitelistDraft(new Set(view.whitelist?.exclude ?? [])),
              }, t('whitelist')),
              h('button', {
                type: 'button', style: S.button, disabled: refreshing || busy, title: t('refreshHint'),
                onClick: () => { void refresh() },
              }, refreshing ? '…' : t('refresh')),
              h('span', { style: { ...S.rowMeta, marginLeft: 'auto', whiteSpace: 'normal', textAlign: 'right' } },
                t('excludedNote', {
                  n: view.plugins.length,
                  system: view.systemExcluded,
                  left: leftOutCount,
                  path: view.excludedPath,
                }))),
            notice === null ? null : h('p', { style: S.notice }, notice),
            tab === 'switch'
              ? h(SwitchTab, {
                t, plugins: view.plugins, presets: view.presets, activePresetId: view.activePresetId,
                differences: drift, busy, onApply: (id) => { void applyPreset(id) },
                onRename: (preset) => setDialog({ kind: 'rename', preset }),
                onDelete: (preset) => setDialog({ kind: 'delete', preset }),
              })
              : tab === 'public'
                ? h(PublicTab, {
                  t, lang, plugins: view.plugins, draft: publicDraft ?? [], picker, busy,
                  onTogglePicker: () => setPicker((current) => !current),
                  onAdd: (id) => setPublicDraft((current) => (current ?? []).includes(id) ? current : [...(current ?? []), id]),
                  onRemove: (id) => setPublicDraft((current) => (current ?? []).filter((item) => item !== id)),
                  onSave: () => { void savePublic() },
                  onCancel: () => { setPublicDraft(view.publicOn.slice()); setPicker(false); setNotice(null) },
                })
                : h(PresetsTab, {
                  t, lang, plugins: view.plugins, draft: presetDraft ?? [], expanded, busy, dragOver,
                  publicOn: view.publicOn,
                  onToggleExpand: (id) => setExpanded((current) => ({ ...current, [id]: current[id] !== true })),
                  onTogglePlugin: togglePlugin,
                  onRename: (preset) => setDialog({ kind: 'rename', preset }),
                  onDelete: (preset) => setDialog({ kind: 'delete', preset }),
                  onCreate: () => { void createPreset() },
                  onCollapseAll: () => setExpanded({}),
                  onExpandAll: () => {
                    const next = { [ALL_ON]: true }
                    for (const preset of presetDraft ?? []) next[preset.id] = true
                    setExpanded(next)
                  },
                  onSave: () => { void savePresets() },
                  onCancel: () => { setPresetDraft(clonePresets(view.presets)); setNotice(null) },
                  onDragStart: (event, id) => {
                    dragId.current = id
                    try { event.dataTransfer.effectAllowed = 'move' } catch (error) { void error }
                    try { event.dataTransfer.setData('text/plain', id) } catch (error) { void error }
                  },
                  onDragOver: (event, id) => {
                    event.preventDefault()
                    try { event.dataTransfer.dropEffect = 'move' } catch (error) { void error }
                    if (dragOver !== id) setDragOver(id)
                  },
                  onDragLeave: (id) => { setDragOver((current) => (current === id ? null : current)) },
                  onDrop: (event, id) => { void dropOn(event, id) },
                }))

      const failNode = failures === null ? null : h('div', { style: S.failPanel },
        h('h3', { style: S.failTitle }, t('failuresTitle')),
        h('div', { style: { ...S.hint, marginBottom: 0 } }, t('failuresHint')),
        h('div', { style: S.failList }, failures.map((failure, index) => h('div', {
          key: `${failure.id ?? index}`, style: S.failLine,
        }, `${failure.name ?? failure.id} — ${failure.code}${failure.detail ? ` — ${failure.detail}` : ''}`))),
        h('div', { style: { display: 'flex', gap: 8, justifyContent: 'flex-end' } },
          h('button', {
            type: 'button', style: S.button,
            onClick: () => { void copyText(failureReport).then((ok) => setCopied(ok)) },
          }, copied ? t('copied') : t('copyFailures')),
          h('button', { type: 'button', style: S.button, onClick: () => { setFailures(null); setCopied(false) } }, t('close'))))

      return h('div', { style: S.wrap },
        h('h2', { style: S.title }, t('title')),
        h('p', { style: S.subtitle }, t('subtitle')),
        body,
        view.configPath === '' ? null : h('p', { style: { ...S.rowMeta, marginTop: 14, whiteSpace: 'normal' } }, `${t('configFile')}: ${view.configPath}`),
        failNode,
        dialogNode,
        whitelistDraft === null ? null : h(WhitelistDialog, {
          t, lang,
          catalog: view.catalog ?? [],
          systemExcluded: view.systemExcluded,
          draft: whitelistDraft,
          busy,
          onToggle: (name, operable) => setWhitelistDraft((current) => {
            const next = new Set(current ?? [])
            if (operable) next.delete(name)
            else next.add(name)
            return next
          }),
          onCancel: () => setWhitelistDraft(null),
          onSave: () => { void saveWhitelist() },
        }))
    }

    /** Rename dialog: keeps the input private state and closes on Escape through Modal. */
    function RenameDialog(props) {
      const { t, preset, onCancel, onConfirm } = props
      const [value, setValue] = React.useState(preset.name)
      const inputRef = React.useRef(null)
      React.useEffect(() => {
        if (inputRef.current !== null) {
          inputRef.current.focus()
          try { inputRef.current.select() } catch (error) { void error }
        }
      }, [])
      const submit = () => onConfirm(value)
      return h(Modal, {
        title: t('renameTitle'),
        onCancel,
        actions: [
          h('button', { key: 'cancel', type: 'button', style: S.button, onClick: onCancel }, t('cancel')),
          h('button', { key: 'ok', type: 'button', style: { ...S.button, ...S.buttonPrimary }, onClick: submit }, t('confirm')),
        ],
      },
      h('label', { style: { ...S.dialogBody, display: 'block', marginBottom: 6 } }, t('renameLabel')),
      h('input', {
        ref: inputRef, style: S.input, value, 'aria-label': t('renameLabel'),
        onChange: (event) => setValue(event.target.value),
        onKeyDown: (event) => { if (event.key === 'Enter') submit() },
      }))
    }

    const inject = ['slots', 'locale']

    function apply(ctx) {
      const locale = ctx.get('locale')
      const t = locale !== undefined ? locale.bind(NS) : undefined
      if (locale !== undefined) {
        try {
          ctx.effect(() => locale.register(NS, { zh, en }), 'dsh-preset-manager: dictionaries')
        } catch (error) {
          void error
        }
      }
      const injected = () => ({
        activeLocale: () => {
          try {
            return locale !== undefined ? locale.getLocale().active : 'en'
          } catch (error) {
            void error
            return 'en'
          }
        },
      })
      // `t` must not ride `inject`: the renderer binds the locale seat from the
      // `locale: NS` declaration, and a plain prop would shadow it.
      ctx.slots.inject('settings.section', () => ctx.slots.register({
        name: 'settings.section',
        id: 'presets',
        order: 45,
        label: () => (t === undefined ? 'Presets' : t('nav')),
        locale: NS,
        inject: injected,
      }, PresetManagerPage))
    }

    return { inject, apply }
  },
})
