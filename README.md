# dsh-preset-manager

> 给 DeepSeek Harness 的插件预设管理器：把一堆插件开关存成「预设」，一键整套切换。

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
![DSH plugin](https://img.shields.io/badge/DSH-plugin-4d6bfe)
![No build step](https://img.shields.io/badge/build-none-success)

在 **设置 → 预设** 新增一个页面，用三个选项卡管理插件的启用组合：

- 只显示你允许操作的插件，其余插件完全不受影响；
- 想切环境时点一下卡片就换整套开关，不用逐个点；
- 「全局」集合让某些插件在任何预设下都保持开启。

## 特性

### 选项卡「模式」
![预设界面](https://github.com/dragonuniverse8248/dsh-preset-manager/blob/main/images/%E9%A2%84%E8%AE%BE.png）

两列短卡片，一行两个，高度与「全部插件开启」一致。

- 点击卡片**立即应用**该预设，无需二次确认；
- 「全部插件开启」固定置顶、占满整行、不可删除、不可重命名；
- 当前激活预设显示蓝色高亮；若它保存的状态与实际不符（例如全局强制开启造成的冲突），高亮变为**橙色**提醒；
- 每次打开该选项卡都会重新检测一次状态是否一致。

### 选项卡「全局」
![全局界面](https://github.com/dragonuniverse8248/dsh-preset-manager/blob/main/images/%E5%85%A8%E5%B1%80.png)

下拉添加式列表，管理**强制开启**集合。

- 全局插件在**所有预设**中强制开启，预设内的对应开关显示为灰色不可操作；
- 「全局」只强制开启、不强制关闭，也不会改写任何预设里已保存的数据；
- 移除一个全局插件不会改变它的当前状态，只有点「保存」才生效；
- 「添加」列表里已加入的插件显示为灰色不可再点，避免重复添加。

### 选项卡「预设」
![模式界面](https://github.com/dragonuniverse8248/dsh-preset-manager/blob/main/images/%E6%A8%A1%E5%BC%8F.png)

列表下拉式手风琴，一行一个预设，点击整行展开／收起。

- 「全部插件开启」固定在列表第一行，同样是点一下展开，没有单独的展开按钮；
- 「+ 新建预设」：可操纵插件默认关闭，受保护插件显示为开启且灰色；
- 顶部有「一键展开 / 一键折叠」；
- **拖拽行调整顺序，松手立即保存**；
- 开关改动需要点「保存」，点「取消」放弃未保存的改动；
- 删除有二次确认，重命名弹窗编辑，重名时自动追加序号（`新预设 (2)`）。

## 一键安装

插件是纯 JavaScript，没有构建步骤、没有安装脚本，装完即可用。

### 方式一：从 GitHub 安装（推荐）

```sh
dsh plugin --profile <配置档名> add git+https://github.com/dragonuniverse8248/dsh-preset-manager.git
```

例如 Web 配置档：

```sh
dsh plugin --profile web add git+https://github.com/dragonuniverse8248/dsh-preset-manager.git
```

安装会自动：把包写进配置档的 `dependencies`、把 `dsh-preset-manager` 加入 `dsh.profile.bundles`、插入一个 `preset-manager` 行。
运行中的 DSH 会观察配置档变化并热加载，**通常不需要重启**。

### 方式二：在 DSH 界面里点几下

打开 **插件** 页面 → 安装 → 粘贴上面的 `git+https://…` 地址即可。

### 方式三：让智能体帮你装

在 DSH 会话里直接说：

> 安装插件 `git+https://github.com/dragonuniverse8248/dsh-preset-manager.git`

智能体会调用 `plugin_manager` 完成安装并告诉你结果。

### 方式四：本地目录

```sh
git clone https://github.com/dragonuniverse8248/dsh-preset-manager.git
dsh plugin --profile web add "D:\path\to\dsh-preset-manager"
```

### 方式五：npm

包名 `dsh-preset-manager`：

```sh
dsh plugin --profile web add dsh-preset-manager
```

## 可操纵插件白名单

页面**只显示和切换 `manage` 列表里的插件**，配置档里的其它插件作为底层插件被完整排除：

- 默认白名单：`dsh-whale-widget`、`dsh-archive-manager`、`dshmarket`；
- 匹配方式：**包名 / Loader entry id / 补丁行 id** 任一命中即可；
- 白名单之外的插件：
  - 不出现在三个选项卡里；
  - 不会被应用预设、全局保存、批量切换改动；
  - 每次读取状态时连同 `entryId`、包名、补丁行 id、当前开关、是否只读写入 `excluded-plugins.json`，作为排除清单留档；
  - 客户端提交的预设或全局列表里若混入白名单外的 id，服务端一律丢弃。

改白名单：在配置档 `cordis.patch.yml` 里给本插件的行加配置（这一层是用户层，升级插件不会丢）：

```yaml
- id: preset-manager
  config:
    manage:
      - dsh-whale-widget
      - dsh-archive-manager
      - dshmarket
      - 你自己的插件包名
```

## 数据与持久化

| 文件 | 内容 |
|---|---|
| `$DSH_HOME/dsh-preset-manager/config.json` | 预设列表、全局集合、当前激活预设 |
| `$DSH_HOME/dsh-preset-manager/excluded-plugins.json` | 被排除的底层插件清单 |

插件的启用/禁用一次性批量写入配置档的 `cordis.patch.yml`，由 HMR 观察者协调一次后即时生效，无需重启。
内置预设「全部插件开启」是虚拟的（`all-on`），不写入配置文件。

## 安全设计

这个插件会真的改你的插件树，所以做了几层保护：

1. **自身行永远开启** —— 如果某个预设能关掉预设管理器，这个设置页就会消失，用户再也打不开它。
2. **保留集永远开启** —— 承载设置页与 HTTP 服务的 10 个模块（`dsh-web-app`、`dsh-client-ui-renderer`、`dsh-client-ui-settings-general` 等）不会被关闭，否则连页面一起失去。
3. **不可寻址的行不参与** —— 插件管理器标记为 `management-required` / `unaddressable` 的行不切换，也不参与状态一致性判定。
4. **整批回滚** —— 应用后若发现「本应保持激活的行因失去服务而停摆」，整批写回原状，并在页面上用非模态面板列出冲突插件（含「复制报错信息」），不会把配置档留在启动失败的状态。
5. **服务端白名单过滤** —— 越权 id 在服务端就被丢弃，不依赖页面行为。

## 环境要求

- DeepSeek Harness 0.1.7-rc.2 及以上（Web / Desktop 配置档均可）；
- 需要配置档里的 `pluginManager` 服务（配置档启动时会自动带上）。

## 常见问题

**安装时报 `ERR_PNPM_UNEXPECTED_STORE`**
配置档的 `node_modules` 是用另一个大版本的 pnpm 装的。用与配置档一致的那个 pnpm 再执行一次 `dsh plugin` 即可（`pnpm -v` 对一下）。

**应用预设后想回到「全都开」**
点「全部插件开启」卡片即可。

**我不想让它碰某个插件**
把该插件从 `manage` 里去掉，它就变回底层插件，页面完全不显示、也不会切换它。

## 目录结构

```
index.js                 Host 半部：预设文档、插件清单、批量切换、HTTP 路由
client.js                浏览器半部：设置页「预设」三个选项卡
cordis.patch.yml         bundle 补丁，插入 preset-manager 行
locale/{en,zh}.json      插件在插件管理页里的显示名与简介
tests/smoke.mjs          假上下文冒烟测试（不需要运行中的实例）
tests/live-check.mjs     对运行中的实例做端到端校验
```

## 开发与验证

```sh
npm test                                             # 冒烟测试
node tests/live-check.mjs http://127.0.0.1:3080 <token>   # 端到端校验（会自行还原状态）
```

`live-check.mjs` 会新建两个临时预设、应用、再删除，并把可操纵插件恢复到运行前状态；
排除清单路径通过环境变量 `LIVE_EXCLUDED_FILE` 传入。

已实测覆盖：安装即生效、三选项卡渲染、新建预设重名自动编号、开关编辑与保存、应用预设即时生效并记录激活项、
状态不统一检测、全局集合强制开启、白名单过滤、底层插件零改动、整批回滚。

## 许可证

[MIT](LICENSE) © 2026 dragonuniverse8248

[English README](README.en.md)
