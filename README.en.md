# dsh-preset-manager

> A plugin preset manager for DeepSeek Harness: save a bunch of plugin switches as a "preset" and switch the whole set in one click.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
![DSH plugin](https://img.shields.io/badge/DSH-plugin-4d6bfe)
![No build step](https://img.shields.io/badge/build-none-success)

It adds a new page under **Settings → Presets** with three tabs for managing plugin enablement combinations:

- Only the plugins you allow it to touch are shown; every other plugin is left completely untouched;
- When you want to switch environments, one click on a card swaps the entire set of switches — no need to toggle them one by one;
- The **Global** set keeps certain plugins on under every preset.

## Features

### Tab "Modes"
![Presets page](https://github.com/dragonuniverse8248/dsh-preset-manager/blob/main/images/%E9%A2%84%E8%AE%BE.png?raw=true)

Two columns of short cards, two per row, with the same height as the built-in "All plugins on" card.

- Clicking a card **applies that preset immediately**, with no second confirmation;
- "All plugins on" is pinned to the top, spans the full row, and cannot be deleted or renamed;
- The currently active preset is highlighted in blue; if the state it saved no longer matches reality (for example a conflict caused by a global force-on), the highlight turns **orange** as a warning;
- Every time you open this tab, state consistency is checked again.

### Tab "Global"
![Global page](https://github.com/dragonuniverse8248/dsh-preset-manager/blob/main/images/%E5%85%A8%E5%B1%80.png?raw=true)

A dropdown "add" style list that manages the **force-on** set.

- Global plugins are forced on in **all presets**, and their corresponding switches inside a preset render grey and non-interactive;
- "Global" only forces plugins on, never forces them off, and never rewrites data already saved in any preset;
- Removing a global plugin does not change its current state; that only takes effect when you click **Save**;
- In the "Add" list, plugins that have already been added render grey and cannot be clicked again, preventing duplicates.

### Tab "Presets"
![Modes page](https://github.com/dragonuniverse8248/dsh-preset-manager/blob/main/images/%E6%A8%A1%E5%BC%8F.png?raw=true)

A list-style dropdown accordion, one preset per row; click anywhere on the row to expand or collapse it.

- "All plugins on" is pinned to the first row of the list, and is likewise expanded by a click — there is no separate expand button;
- "+ New preset": operable plugins default to off, protected plugins render as on and grey;
- There is an "Expand all / Collapse all" control at the top;
- **Drag rows to reorder; releasing the mouse saves immediately**;
- Switch edits require clicking **Save**; clicking **Cancel** discards unsaved changes;
- Deletion asks for confirmation, renaming opens a dialog for editing, and a duplicate name automatically gets a number appended (`New preset (2)`).

## One-click install

The plugin is plain JavaScript: no build step, no install scripts, ready to use once installed.

### Option 1: Install from GitHub (recommended)

```sh
dsh plugin --profile <profile-name> add git+https://github.com/dragonuniverse8248/dsh-preset-manager.git
```

For example, the Web profile:

```sh
dsh plugin --profile web add git+https://github.com/dragonuniverse8248/dsh-preset-manager.git
```

Installation automatically: writes the package into the profile's `dependencies`, adds `dsh-preset-manager` to `dsh.profile.bundles`, and inserts a `preset-manager` row.
A running DSH watches its profile for changes and hot-loads them, so **a restart is normally unnecessary**.

### Option 2: A few clicks in the DSH interface

Open the **Plugins** page → Install → paste the `git+https://…` address shown above.

### Option 3: Let the agent install it for you

In a DSH session, just say:

> Install the plugin `git+https://github.com/dragonuniverse8248/dsh-preset-manager.git`

The agent will call `plugin_manager` to complete the installation and tell you the result.

### Option 4: Local directory

```sh
git clone https://github.com/dragonuniverse8248/dsh-preset-manager.git
dsh plugin --profile web add "D:\path\to\dsh-preset-manager"
```

### Option 5: npm

Package name `dsh-preset-manager`:

```sh
dsh plugin --profile web add dsh-preset-manager
```

## Operable-plugin allowlist

The page **only shows and switches the plugins in the `manage` list**; every other plugin in the profile is treated as a lower-layer plugin and fully excluded:

- Default allowlist: `dsh-whale-widget`, `dsh-archive-manager`, `dshmarket`;
- Matching: any one of **package name / Loader entry id / patch row id** matching is enough;
- Plugins outside the allowlist:
  - Do not appear in any of the three tabs;
  - Are never changed by applying a preset, saving a global set, or a bulk switch;
  - Are written into `excluded-plugins.json` — together with `entryId`, package name, patch row id, current switch state, and read-only flag — every time state is read, as a record of the exclusion list;
  - Are always discarded server-side if an id outside the allowlist is mixed into a preset or global list submitted by the client.

To change the allowlist: add configuration to this plugin's row in the profile's `cordis.patch.yml` (this layer belongs to the user, so upgrading the plugin will not lose it):

```yaml
- id: preset-manager
  config:
    manage:
      - dsh-whale-widget
      - dsh-archive-manager
      - dshmarket
      - your-own-plugin-package-name
```

## Data and persistence

| File | Contents |
|---|---|
| `$DSH_HOME/dsh-preset-manager/config.json` | preset list, global set, currently active preset |
| `$DSH_HOME/dsh-preset-manager/excluded-plugins.json` | list of excluded lower-layer plugins |

Plugin enablement/disablement is written into the profile's `cordis.patch.yml` in a single batch, then reconciled once by the HMR watcher and takes effect immediately — no restart needed.
The built-in preset "All plugins on" is virtual (`all-on`) and is not written to any configuration file.

## Safety design

This plugin really does modify your plugin tree, so several layers of protection are in place:

1. **Its own row is always on** — if some preset could turn off the preset manager, this settings page would disappear and the user could never open it again.
2. **The survival set is always on** — the 10 modules that carry the settings page and the HTTP service (`dsh-web-app`, `dsh-client-ui-renderer`, `dsh-client-ui-settings-general`, etc.) are never disabled, otherwise the page would be lost along with them.
3. **Unaddressable rows do not participate** — rows that the plugin manager marks `management-required` / `unaddressable` are not switched and do not take part in the state consistency check.
4. **Whole-batch rollback** — if, after applying, a row that should have stayed active is found to be stalled because a service it injects is gone, the whole batch is written back to its original state, and the page lists the conflicting plugins in a non-modal panel (including a "Copy error information" button), so the profile is never left in a state that fails to start.
5. **Server-side allowlist filtering** — out-of-scope ids are discarded on the server and do not rely on page behaviour.

## Requirements

- DeepSeek Harness 0.1.7-rc.2 or above (both the Web and Desktop profiles work);
- The `pluginManager` service in the profile (it is included automatically when the profile starts).

## FAQ

**`ERR_PNPM_UNEXPECTED_STORE` when installing**
The profile's `node_modules` was installed with a different major version of pnpm. Run `dsh plugin` once more with the same pnpm that was used for the profile (compare with `pnpm -v`).

**I applied a preset and want to get back to "everything on"**
Just click the "All plugins on" card.

**I don't want it to touch a certain plugin**
Remove that plugin from `manage`; it goes back to being a lower-layer plugin, is not shown on the page at all, and will not be switched.

## Directory structure

```
index.js                 Host half: preset documents, plugin inventory, bulk switching, HTTP routes
client.js                Browser half: the three tabs of the settings page "Presets"
cordis.patch.yml         bundle patch, inserts the preset-manager row
locale/{en,zh}.json      display name and description of the plugin in the plugin management page
tests/smoke.mjs          fake-context smoke test (no running instance required)
tests/live-check.mjs     end-to-end verification against a running instance
```

## Development and verification

```sh
npm test                                             # smoke test
node tests/live-check.mjs http://127.0.0.1:3080 <token>   # end-to-end check (restores state itself)
```

`live-check.mjs` creates two temporary presets, applies them, then deletes them again, and restores the operable plugins to the state they were in before the run;
the exclusion-list path is passed in through the environment variable `LIVE_EXCLUDED_FILE`.

Already covered by real testing: taking effect immediately upon install, rendering of the three tabs, automatic numbering on duplicate preset names, switch editing and saving, applying a preset taking effect immediately and recording the active item, inconsistent-state detection, force-on from the global set, allowlist filtering, zero changes to lower-layer plugins, and whole-batch rollback.

## License

[MIT](LICENSE) © 2026 dragonuniverse8248

[中文说明](README.md)
