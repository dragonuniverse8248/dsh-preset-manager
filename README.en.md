# dsh-preset-manager

> Preset manager for DeepSeek Harness: save plugin on/off combinations as presets and switch the whole set in one click.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
![DSH plugin](https://img.shields.io/badge/DSH-plugin-4d6bfe)
![No build step](https://img.shields.io/badge/build-none-success)

It adds a **Presets** page under **Settings** with three tabs:

- **Modes** — two short tiles per row (same height as the built-in "All plugins on" row). Clicking a tile applies
  that preset immediately. The active preset is highlighted blue, or orange when its saved switches no longer match
  the running tree.
- **Global** — a force-on set. Global plugins stay on in every preset, their per-preset switch renders grey and
  locked, and the stored preset data is never rewritten by the global list.
- **Presets** — an accordion list, one preset per row, click a row to expand its switches. Reorder by dragging
  (saved on drop); switch edits are saved with **Save**. Delete asks for confirmation, rename opens a dialog and
  appends a number when the name is taken.

## One-click install

Plain JavaScript, no build step and no install scripts.

```sh
dsh plugin --profile <profile> add git+https://github.com/dragonuniverse8248/dsh-preset-manager.git
```

That writes the dependency, adds `dsh-preset-manager` to `dsh.profile.bundles`, and inserts the `preset-manager`
row. A running Harness watches its profile and hot-loads the bundle, so a restart is normally unnecessary.

You can also paste the same `git+https://…` spec into the **Plugins** page, ask the agent to install it, install
the npm package `dsh-preset-manager`, or point `dsh plugin` at a local clone.

## Operable-plugin allowlist

The page shows and switches **only the plugins named by its `manage` list**; everything else in the profile is a
lower layer it never touches.

- Default: `dsh-whale-widget`, `dsh-archive-manager`, `dshmarket`.
- A row matches by **package name, loader entry id, or patch row id**.
- Excluded rows never appear in the page, are never switched by an apply or a global-list save, and are collected
  into `excluded-plugins.json` together with their entry id, package name, patch row id, current enablement, and
  read-only flag.
- Entry ids outside the allowlist that arrive from a client draft are dropped server-side.

Override the list from the profile's own `cordis.patch.yml`:

```yaml
- id: preset-manager
  config:
    manage:
      - dsh-whale-widget
      - dsh-archive-manager
      - dshmarket
      - your-plugin
```

## Data

| File | Contents |
|---|---|
| `$DSH_HOME/dsh-preset-manager/config.json` | presets, global set, active preset |
| `$DSH_HOME/dsh-preset-manager/excluded-plugins.json` | the lower-layer plugins that are excluded |

Enablement changes are written into the profile's `cordis.patch.yml` in one batch, then reconciled once by the HMR
watcher, so a whole-set switch needs no restart. The built-in "All plugins on" preset is virtual (`all-on`) and is
never stored.

## Safety

1. **Its own row is always on** — a preset that could disable the manager would remove the only page able to
   re-enable it.
2. **A survival set is always on** — the ten modules carrying the Settings page and the HTTP server.
3. **Unaddressable rows are left alone** — rows the plugin manager marks `management-required` / `unaddressable`
   are neither switched nor counted when comparing state.
4. **Whole-batch rollback** — if applying a set leaves a live row without a service it injects, the batch is
   written back and the conflicting plugins are listed in a non-modal panel (with a copy button), so the profile
   never stays in a state that fails to start.
5. **Server-side allowlist filtering** — out-of-scope ids are dropped by the Host, not by the page.

## Development

```sh
npm test
node tests/live-check.mjs http://127.0.0.1:5544 <token>
```

`tests/smoke.mjs` drives every route on a fake Cordis context; `tests/live-check.mjs` runs the same flow against a
live instance and restores the plugins it touched.

## License

[MIT](LICENSE) © 2026 dragonuniverse8248

[中文说明](README.md)
