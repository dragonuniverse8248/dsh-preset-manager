# AGENTS.md — dsh-preset-manager 维护指南

给下一位接手这个插件的 agent。读完这一份就能改代码、跑验证、发版本，不必先去读 DSH 源码。

面向使用者的说明在 [README.md](README.md) / [README.en.md](README.en.md)；本文件只讲**怎么维护**。

---

## 0. TL;DR

```sh
# 装到某个配置档（本地开发用 link，改完源码即生效）
dsh plugin --profile web add "D:\DeepSeek_Harness\dsh-preset-manager"

# 单元级验证：假 Cordis 上下文，不需要运行中的 DSH
cd D:\DeepSeek_Harness\dsh-preset-manager && node tests/smoke.mjs

# 端到端验证：需要运行中的实例 + 它的 token
node tests/live-check.mjs http://127.0.0.1:5544 <token>
```

改代码后如何生效：

| 改了谁 | 生效方式 |
|---|---|
| `client.js`（浏览器半部） | 刷新页面即可。客户端 bundle 按内容算 rev，服务端每次请求现读文件 |
| `index.js`（Host 半部） | **必须重启 DSH 实例**（模块级代码在启动时加载，配置热重载不会重新 import） |
| `cordis.patch.yml` / `locale/*.json` | 重启实例（它们在启动时被读取） |

---

## 1. 这是什么

一个 **DSH bundle 插件**（不是 DSH 仓库内的 package）：给 Harness 的「设置」加一个**预设**页，把一批插件开关存成预设、一键整套切换。

- 形态：Host 半部（Node，插件行）+ 浏览器半部（设置页），通过**同源 HTTP 路由**通信，不碰 DSH 的 Remote/Typert 机制。
- 安装目标：任意 profile（`$DSH_HOME/profiles/<name>`），本机开发用 `web`。
- 没有构建步骤：`index.js` / `client.js` 是手写的、直接可执行的 ESM / 浏览器模块。**不要**引入打包器或 TypeScript——保持「clone 下来就能装」。
- 数据目录：`$DSH_HOME/dsh-preset-manager/`。

---

## 2. 文件地图

| 文件 | 作用 | 改动注意 |
|---|---|---|
| `index.js` | Host 半部：文档持久化、插件清单、批量切换、全部路由 | 唯一会真的动用户插件树的地方，见第 3、5 节 |
| `client.js` | 浏览器半部：设置页三个选项卡 + 两个对话框 | 懒执行工厂格式；字典中英必须成对；只用主题 token |
| `cordis.patch.yml` | bundle 补丁：插入 `preset-manager` 行 | 只插入，不留配置；用户层覆盖在 profile 的 `cordis.patch.yml` |
| `locale/{en,zh}.json` | 插件管理页里的显示名/简介 | 由 DSH 的 `readPluginMeta` 读取，改完要重启 |
| `package.json` | 包清单 + `dsh.bundle` / `dsh.client` 声明 | `files` 决定发布内容；**不要**加 `prepare`/`prepack` 脚本（git 安装会执行它们） |
| `tests/smoke.mjs` | 假上下文驱动全部路由 | 行为变了必须同步改，见第 7 节 |
| `tests/live-check.mjs` | 对运行中实例做端到端校验 | 会短暂改动插件开关，结束时还原并删除自己的预设 |
| `images/*.png` | README 截图 | 改界面文案后截图会过期，需要重拍 |

---

## 3. Host 半部（`index.js`）

### 3.1 插件形态

```js
export const inject = ['webServer']   // 只硬依赖浏览器 HTTP carrier
export const name = PACKAGE_NAME
export function apply(ctx) { ... }    // 函数式插件：不能再有默认导出
```

- 路由用 `ctx.effect(() => ctx.webServer.register(route), label)` 注册，卸载即注销。
- 其余服务一律 `ctx.get('pluginManager')` / `ctx.get('profileContext')` / `ctx.get('hmr')` **可选读取**：拿不到就降级，绝不抛。
- `ctx.on('plugin-manager/changed', …)` 里做新插件同步（安装完成后把新插件的当前状态并入所有预设）。

### 3.2 路由表

前缀 `/api/preset-manager`，全部 `kind: 'exact'`，全部返回 JSON：

| 路由 | 请求体 | 说明 |
|---|---|---|
| `GET /state` | — | 页面唯一的读入口：可操纵插件、白名单目录、预设、全局集合、激活项、状态差异、两个文件路径 |
| `POST /whitelist` | `{exclude: string[]}` | 只记录「识别到但被排除」的包名；不认识的名字一律丢弃 |
| `POST /apply` | `{presetId}` | 批量切换；`presetId` 可以是虚拟的 `all-on` |
| `POST /public` | `{publicOn: string[]}` | 保存全局强制开启集合，并立即强制开启 |
| `POST /presets` | `{presets: [...]}` | 保存预设内的开关草稿（`id`/`name`/`pluginStates`），数量必须与已存一致 |
| `POST /create` `/rename` `/delete` `/order` | 见代码 | 结构性操作，**立即持久化**（与「保存」无关） |

约定：**结构性操作立即生效，开关改动按「保存」提交**。这是产品语义，别改。

### 3.3 插件分类：什么能操作（`partition`）

判据是**安装来源**，不是名字：

```js
packageRootOf('@scope/name/sub')  // → '@scope/name'
packageRootOf('cordis:include')   // → undefined（内置）
installedPackages(ctx)            // profile 的 package.json 依赖集合
```

`partition(config, rows)` 把清单切成三份：

- `system`：**必然排除** —— 非 profile 依赖的行，外加 `SURVIVAL_MODULES` 里的 10 个模块（即使 profile 装了它们也一样排除）。
- `catalog`：识别到的插件（profile 装的、且不是保留集），每项带 `operable` —— 白名单编辑器的数据源。
- `operable`：`catalog` 里没被 `config.manage.exclude` 点名的那些 = 页面真正显示和切换的集合。

`writeExcluded()` 把非 `operable` 的行写进 `excluded-plugins.json`，带 `reason`（`system` / `whitelist`）。

> 为什么系统插件「必然排除」：实测过应用一个「全关」预设会关掉 `web-startup`，而 `webserver` 注入它 —— HTTP 服务当场消失，设置页也随之打不开。保留集就是那次事故的产物。

### 3.4 文档模型（`$DSH_HOME/dsh-preset-manager/config.json`）

```json
{
  "version": 1,
  "publicOn": ["include:..."],
  "presets": [{ "id": "p-…", "name": "…", "createdAt": 0, "pluginStates": { "include:…": true } }],
  "activePresetId": "p-…",
  "manage": { "exclude": ["dshmarket"] }
}
```

- `normalizeConfig()` 是唯一的读入口：未知字段丢弃、非法行忽略、缺失字段补默认。**新增字段必须同时改它**，否则重启后被静默抹掉。
- `pluginStates` 的键是 **entryId**（`include:xxx`），`manage.exclude` 存的是**包名**——两者不同，别混。
- 写入一律走 `writeConfig()`（临时文件 + rename 原子替换）。

### 3.5 批量切换引擎（最容易踩坑的部分）

`switchRows(ctx, targets)` 是**唯一**改动插件开关的地方，`targets` 形如 `{id, name, patchId, desired}`：

1. **一次写补丁**：`writeDisabledRows()` 把整批 `disabled` 覆盖写进 profile 的 `cordis.patch.yml`，保留注释与无关条目。
   - 逐行调用 `pluginManager.setPluginEnabled()` 每行都要整体协调一次（实测 ≈1s/行），130 行要几分钟——所以不用它做批量。
   - 该函数按行解析 YAML：顶层条目必须写成 `- id: <rowId>`（列 0），`disabled:` 必须缩进 2 空格；它只替换/插入这一行键，**不动 `config:` 子树**。改它之前先读 `splitPatchBlocks()`。
2. **观察结果而不是假设**：`waitForEnablement()` 轮询 `listPlugins()` 直到每个目标达到期望值（上限 `SETTLE_TIMEOUT_MS = 90s`）。
   - 不要用 `app-boot/config-reload` 事件等待：HMR 观察者会**合并事件**，第二次写入可能被整个丢掉（实测：文件已还原、运行时仍是旧状态）。
3. **整批回滚**：如果发现「本应保持激活的行丢了服务」（`waitForEnablement` 前后的 `fiberPhase` 对比），把整批写回原状——本批新增的条目直接删除，原有条目恢复旧值——再返回 `{code: 'preset-reverted', stranded}`，页面用非模态面板提示。**绝不能**把配置档留在启动失败的状态。
4. **兜底**：回滚后若运行树仍落后于文件，`resumeEnablement()` 用 `pluginManager.setPluginEnabled()` 逐行驱动回来（慢，但只在异常路径发生）。
5. 没有 `profileContext`/`hmr` 时（非 profile 启动）退化为逐行 `setPluginEnabled()`。

### 3.6 保护与跳过规则

| 规则 | 位置 | 说明 |
|---|---|---|
| 本插件自身永远开启 | `isSelfRow()` + `isPinned()` | 否则某个预设能关掉预设管理器，页面再也打不开 |
| 保留集永远开启 | `SURVIVAL_MODULES` | 承载设置页与 HTTP 服务的 10 个模块 |
| 全局集合强制开启 | `isPinned()` 看 `publicOn` | 全局列表只强制开，不强制关 |
| 不可寻址的行跳过 | `plugin.readOnly` | `management-required` / `unaddressable` 的行既不下发切换，也不参与状态一致性判定和预设默认值 |
| 预设里只存可操纵行 | `handlePresets` / `handleCreate` | 服务端过滤，客户端草稿里混进来的越权 id 一律丢弃 |

---

## 4. Client 半部（`client.js`）

### 4.1 模块格式与注册

```js
window.__ModuleLoader__.load({
  id: 'dsh-preset-manager',          // 必须等于包名
  factory: (require) => { const React = require('react'); … return { inject, apply } },
})
```

- 工厂只**注册**，不产生副作用；真正的注册在 `apply(ctx)` 里，用 `ctx.effect` / `ctx.slots.inject` 承担生命周期。
- `inject = ['slots', 'locale']`；字典用 `locale.register(NS, { zh, en })`，注册项声明 `locale: NS` 让渲染器把 `t` 座位注入进来。
- 注册进 `settings.section`：`id: 'presets'`、`order: 45`、`label: () => t('nav')`。**不要**从 `inject` 里传 `t`——那会遮蔽渲染器的语言座位。

### 4.2 字典（改文案必看）

- `const zh = {…}` 与 `const en = {…}` 必须**键完全一致**；`tests/smoke.mjs` 里有断言在守这条。
- 参数用 `t('key', { n: 1 })`，模板写成 `{n}`。缺键时 `t` 返回键名本身（不会抛），所以漏改双语不容易被发现——靠测试。
- 语言切换时渲染器换掉 `t` 的引用并重渲染，因此组件里可以直接调用 `t`，不要缓存。

### 4.3 组件与状态

| 组件 | 职责 |
|---|---|
| `PresetManagerPage` | 页面根：`view` 状态、草稿、对话框、所有 mutate 流程 |
| `SwitchTab` | 「模式」：两列短卡片，点击卡片即应用 |
| `PublicTab` | 「全局」：添加式列表 + 保存/取消 |
| `PresetsTab` | 「预设」：手风琴列表、拖拽换序、新建/重命名/删除、保存/取消 |
| `WhitelistDialog` | 白名单编辑器（识别到的插件逐个开关） |
| `RenameDialog` | 重命名弹窗（`Modal` 承担 Esc/遮罩关闭） |
| `Toggle` / `Modal` | 自绘控件，尺寸与配色抄自 DSH 的 `Switch` / `Button` 基元 |

状态约定：

- `view` 是服务端快照；`publicDraft` / `presetDraft` / `whitelistDraft` 是**草稿**，进选项卡时重建，切走即丢弃（语义就是「取消」）。
- 结构性操作（新建/重命名/删除/排序）**立即打服务端**并就地更新本地，不重新拉全量（否则会冲掉未保存的开关草稿）。
- 应用预设后要紧跟 `reload(false)` + 刷新 `drift`，否则卡片高亮会停留在旧判断。

### 4.4 样式规则

- 只用宿主主题 token：`--dsw-alias-*`、`--dsw-radius-*`，**每个都写死一个可读的字面量回退**（`var(--dsw-alias-bg-layer-1, #ffffff)`）。token 改名只会降级观感，不会把页面画没。
- 禁止 import 任何 DSH 客户端包（`@deepseek-ai/dsh-client-*`）：它们是内部实现，随版本变，而且本插件没有类型检查。需要控件就照抄尺寸与配色（见 `Toggle`）。
- 深浅色都要能看：不要用写死的深色/浅色前景色。`--dsw-alias-brand-primary` 是「反色」（浅色主题下接近黑），**不能**当高亮蓝用；强调色用 `--dsw-alias-button-info-fill`。

---

## 5. 不变量（改代码必须守住）

1. 一台机器上**只有一个写者**：`config.json` 只由 `writeConfig()` 写，profile 补丁只由 `writeDisabledRows()` 写（或 `pluginManager` 自己写）。不要新增第二个写路径。
2. 预设里只能出现**可操纵行**的 id；服务端三处（`create`/`presets`/`public`）都要过滤。
3. 任何情况下都不能让预设关掉：本插件自身、`SURVIVAL_MODULES`、全局集合成员。
4. 批量切换要么整体生效，要么整体回滚；不允许「写了一半」的配置档留在磁盘上。
5. `package.json` 里不要加 `prepare`/`prepack`/`postinstall`：git 安装会执行它们，用户那边可能直接被 pnpm 的构建审批拦住，一键安装就废了。
6. 字典中英成对；README 中英成对。
7. Host 侧新增字段 → 同步 `normalizeConfig()`；新增路由 → 同步第 3.2 节与本文件的路由表。

---

## 6. 常见改动怎么做

**加一条界面文案**：两个字典各加一个键（同名）→ 组件里 `t('key')` → `node tests/smoke.mjs`（字典配对断言会兜住漏改）。

**加一个路由**：写 `handleXxx(ctx, req, res)` → 在 `apply()` 里 `handle('xxx', …)` → `tests/smoke.mjs` 的 `routes.size` 期望值 +1 → 本文件路由表 +1。请求体一律走 `readJson`，响应一律 `sendJson`。

**改白名单规则**：只动 `partition()`（可选 `packageRootOf` / `installedPackages`）。改完必须同时更新 `tests/smoke.mjs` 里的假 profile 清单与断言——那里就是规则的规格说明。

**改卡片/列表布局**：只动 `client.js` 的 `S` 样式表与对应组件；不要引入新的颜色常量，优先复用已有 token。改完刷新页面看深浅两色。

**动补丁写入逻辑**（危险）：先读 `splitPatchBlocks()` / `writeDisabledRows()` 的注释，再补 `tests/smoke.mjs` 末尾那组补丁编辑器断言（注释保留、嵌套 `insert` 不动、重复 id 不追加、可删除自己追加的行）。

**发版本**：`package.json` 的 `version` → `npm.cmd pack --dry-run` 检查发布文件集（应为 9 个文件、不含 tests/images）→ 提交（中文 + 约定前缀）→ `git push`。

---

## 7. 测试

### `tests/smoke.mjs`（必跑，秒级）

在假 Cordis 上下文上挂载 Host 半部并驱动每个路由。三个夹具，行为变更时都要跟着改：

- `entries`：假的插件清单（entryId / moduleName / enabled / fiberPhase / patchId / readOnlyReason）。
- `profileDir/package.json`：假的配置档清单，决定哪些行「被识别」。
- `manager`：假的 `pluginManager`，`setPluginEnabled` 会记录调用并返回预设的 `application` 结果。

覆盖：分类与白名单、路由全部成功/失败分支、预设增删改查、补丁编辑器、回滚路径、字典配对。断言写的是**行为**，不是实现细节。

### `tests/live-check.mjs`（联调，需要实例）

```sh
# 起一个测试实例（token 每次启动都会变，从 stdout 的 "dsh web: <url>" 里取）
node --import tsx/esm apps/cli/src/bin.ts web --no-open --port 5544

# 排除清单路径通过环境变量传入
LIVE_EXCLUDED_FILE="$DSH_HOME/dsh-preset-manager/excluded-plugins.json" \
  node tests/live-check.mjs http://127.0.0.1:5544 <token>
```

它会：校验识别规则 → 白名单往返（排除再恢复）→ 新建临时预设、应用、比对底层插件零改动 → 还原开关、删除自己的预设。**每次开头会先按名字清掉上次中断留下的 `live-check` 预设**，所以失败也不会在别人配置档里留残留。

浏览器内的交互（拖拽换序、弹窗、开关点选）**目前没有自动化**：本会话没有浏览器工具。改动这几处后请人工点一遍，或补 Playwright 用例。

### 手工验收清单（改 UI 后跑）

模式页：卡片是否一行两个、高度是否与「全部插件开启」一致、激活/橙色高亮是否正确、点击卡片是否立即生效。
全局页：添加下拉里已加入项是否置灰、移除后保存是否立即生效。
预设页：点行展开、拖拽换序立即保存、保存/取消语义、删除二次确认、重命名重名追加序号。
工具栏：白名单弹窗逐个开关并保存、刷新按钮重新拉取（新装插件后应出现）。

---

## 8. 本机环境坑（Windows）

- **pnpm 版本必须与配置档一致**。本机 profile 由 pnpm 11.7.0 构建（store `D:\.pnpm-store\v11`），用 pnpm 10 执行 `dsh plugin` 会报 `ERR_PNPM_UNEXPECTED_STORE`，且会把 `node_modules` 改成另一种布局。现成的转发脚本：`D:\DeepSeek_Harness\.pnpm11\pnpm.cmd`，把它放在 `PATH` 最前再执行。
- **PowerShell 执行策略**禁用了 `.ps1`：用 `npm.cmd`（不要用 `npm`），或 `node <pnpm.mjs 路径>`。
- **沙箱**：本机 `pwsh` 在 `workspace-write` 模式下会以 `SetNamedSecurityInfoW failed (Win32 5)` 直接失败；需要 `danger-full-access` 才能执行命令。用 `read`/`write`/`edit` 工具读写工作区外的文件也需要一次升级授权。
- **token 每次启动都变**：实例重启后旧 URL 立刻 401，从新进程 stdout 里取新的。`GET /?token=…` 只用来换 cookie，后续 `fetch` 靠同源 cookie。
- **API 需要 cookie**：直接 `Invoke-WebRequest /api/...` 会 401，先带 token 请求一次 index。

---

## 9. 发布与版本

- 仓库：`https://github.com/dragonuniverse8248/dsh-preset-manager`（MIT）。
- 一键安装的三种实测路径：`git+https://…`、npm 包名、本地目录。改动 `package.json` 的 `exports`/`files` 后必须重跑 `npm.cmd pack --dry-run` 确认发布文件集。
- 提交信息用中文、带约定前缀（`feat:` / `fix:` / `docs:` / `test:`），一次改动一个提交。

---

## 10. 已知限制（不要当成 bug 去修）

1. **系统插件永远不可操作**：这是刻意的安全边界，不是缺功能。确实需要时只能在代码里改 `partition()`，并自行承担「关掉基础插件后页面消失」的后果。
2. **「全部插件开启」会打开所有可操纵行**，包括互相冲突的组合（本机曾出现 `pwsh-sandbox` 与 `pwsh-local` 同时开启导致 `shell` 服务重复注册）。预设语义如此，插件不负责判断互斥。
3. **批量切换很慢**：一次协调 100+ 行需要几十秒，页面会一直转圈（`busy`）。这受 DSH 的协调成本限制。
4. **浏览器交互无自动化测试**（见第 7 节）。
5. **截图会随文案过期**：改界面文字后 `images/*.png` 需要重拍。
