# 运行中会话胶囊 · dsh-running-sessions

<div align="center">

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![DSH](https://img.shields.io/badge/DSH-0.2.2--rc.2%2B-4d6bfe)](https://github.com/deepseek-ai/deepseek-harness)
[![platform](https://img.shields.io/badge/platform-DSH%20Web%20%2F%20Desktop-8A2BE2)](#安装)
[![GitHub stars](https://img.shields.io/github/stars/ERroooooR/dsh-running-sessions?style=social)](https://github.com/ERroooooR/dsh-running-sessions/stargazers)

<img src="./preview.png" alt="胶囊显示在会话标题栏左侧，展开后是运行中会话清单与最近完成" width="560" />

</div>

DeepSeek Harness 的界面插件：在会话标题栏左侧放一枚常驻胶囊 `● 运行中 3 个 ▾`，点开就是**正在运行的会话清单**，再点一下直接切过去 —— 不用再去侧边栏里翻找。下拉底部还会列出**最近完成的会话**。

标准 DSH bundle 插件，纯客户端实现，不新增 Host 服务、不依赖第三方库。

## 特性

- **常驻标题栏**：注册在 `conversation.header.leading`（会话标题左侧的全局导航位），不挤占任何页面空间，新建会话页也在。
- **一键切换**：点行 → `uiWorkspace.openSession(id)`，和点击侧栏会话走完全同一条路径。
- **最近完成**：运行中会话下面跟一组灰点会话（默认 3 条），刚结束的那些不用回头去工作区里找。
- **待处理标记**：等待授权 / 等待确认计划 / 等待回答的会话，行尾直接标出来。
- **自动隐藏**：没有会话在跑时整枚胶囊消失，标题栏保持干净（可在设置里改成常显）。
- **五项设置**：下拉右上角齿轮，改完立刻生效，不必重载应用。
- **轻**：只用 `react` / `react-dom` 和官方主题 token `--dsw-alias-*`，随界面浅色/深色自动适配。

## 安装

**桌面应用（Electron 版）** —— 桌面端的 profile 由应用托管，CLI 的 `--profile desktop` 会被拒绝，所以在应用里让 DSH 自己装：

```powershell
plugin_manager install_bundle(target="<本仓库的绝对路径>")
```

**dsh web** —— 直接从 GitHub 装（需要已安装 `pnpm`）：

```sh
dsh plugin --profile web add github:ERroooooR/dsh-running-sessions
```

装完按 `Ctrl+R`（web 端硬刷新 `Ctrl+Shift+R`）重载界面即可看到胶囊。install 走的是 symlink，所以以后改 `client.js` 也是重载一下就行，不用重装。

卸载：

```powershell
plugin_manager remove_bundle(target="@local/running-sessions")   # 桌面应用内
dsh plugin --profile web remove @local/running-sessions           # dsh web
```

> 没有发布到 npm —— 包名是私有的 `@local/running-sessions`，安装请走上面的本地目录 / `github:` 两种方式。

## 使用

| 想做什么 | 怎么做 |
| --- | --- |
| 切到某个运行中的会话 | 点胶囊 → 点那一行 |
| 切到刚结束的会话 | 点胶囊 → 「最近完成」里点一行 |
| 关掉下拉 | 再点胶囊 / `Esc` / 点空白处 |
| 键盘操作 | 打开后首行自动聚焦，`Tab` 或方向键移动，回车切换 |
| 改设置 | 下拉右上角齿轮 |

胶囊上的绿点会轻微呼吸，扫一眼就知道有没有会话在跑；数字跟着会话状态实时变化。

## 设置

| 设置 | 说明 | 默认 |
| --- | --- | --- |
| 没有运行中会话时也显示胶囊 | 让胶囊常驻，方便随时进「最近完成」 | 关 |
| 最近完成 | 显示几条，可选 `0 / 1 / 3 / 5`，`0` = 不显示这组 | 3 |
| 显示工作区 | 行内是否显示会话所属工作区 | 开 |
| 显示时间 | 行内是否显示最近活动时间 | 开 |
| 显示待处理标记 | 行尾是否标注「等待授权 / 等待确认计划 / 等待回答」 | 开 |

设置存本机 `localStorage["dsh-running-sessions:config"]`，不写任何 profile 文件 —— 所以改设置不会触发插件重装，也不用重载应用。恢复默认：

```js
localStorage.removeItem('dsh-running-sessions:config')
```

## 为什么在标题栏而不是侧边栏

侧边栏「工作区」上方没有可以插内容的空位：那一层只提供品牌位、面板图标列表，以及已被官方工作区浏览器整个占用的 `sidebar.workspaces`。占它就得重写搜索框 + 分组会话列表 + 所有工作区弹窗。

`conversation.header.leading` 是官方预留的全局导航位（`replaceRisk: none`），放这里既不挡内容，也不跟任何插件抢位置。

## 兼容性

- 在 **DSH 0.2.2-rc.2**（Electron 桌面端）实测：胶囊渲染、下拉展开、行点击切换、设置项持久化。
- 只使用稳定接口：`ctx.slots` / `ctx.locale` / `ctx.uiWorkspace.openSession`，以及 `useSessions` / `useSessionStatus` / `useWorkspaces` 三个只读快照钩子。
- 数据全部来自官方的与会话快照，插件不新增 Host 服务、不写会话数据。

## 已知限制

- 只能列出**客户端已经加载**的会话，应用刚启动的几秒内列表可能不全。
- 相对时间每 30 秒刷新一次，最多滞后半分钟。
- 浅色主题已逐像素对照官方 chip / popover，**深色主题只用 token 适配过，没做像素级验证**。
- 没有自动化测试：验收靠实机截图与页面内自检（见「开发」）。

## 开发

| 文件 | 作用 |
| --- | --- |
| `client.js` | 全部逻辑：React 组件 + CSS 字符串 + 中英文词典，无第三方依赖 |
| `index.js` | Host 侧空实现（纯 UI 插件） |
| `cordis.patch.yml` | bundle patch，`insert` 一行插件记录 |
| `locale/zh.json`、`locale/en.json` | 插件市场里的名称与描述 |
| `icon.svg` | 插件图标 |

改 `client.js` 后重载界面即可看到效果。三个容易踩回来的坑：

1. **标题栏是窗口拖动面**：外壳在**捕获阶段**就处理了 `pointerdown`，按钮上的冒泡监听实机收不到 —— 必须用 `window` 捕获阶段的监听接管，并对 `click` 停止冒泡。
2. **切换会话会重建 header 组件**：展开状态放进组件会随重挂载丢失，现在放模块级，且只允许 3 秒内跨挂载恢复，避免以后自弹。
3. **主题没有圆角变量**：`--dsw-alias-*` 全是颜色，圆角必须写字面量；官方同排 chip 实测是 26px 高 / 8px 圆角 / 0.5px 描边 / 透明填充。

性能取舍写在 `client.js` 顶部注释：快照在流式输出时每个 token 都会变，所以收起状态只做一次 O(N) 计数，行数据只在展开时构建，样式只在 `apply()` 里注入一次。

## 许可证

[MIT](./LICENSE)
