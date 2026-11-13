# Running Sessions Pill · 运行中会话胶囊

一个 DeepSeek Harness 客户端插件：在会话标题栏左侧常驻一枚胶囊，显示**正在运行的会话数量**，点开下拉即可直接切换到任意运行中的会话，下拉底部还会列出**最近完成的 3 个会话**。没有正在运行的会话时整枚胶囊隐藏。

![预览](./preview.png)

## 为什么在标题栏而不是侧边栏

侧边栏（`sidebar`）的子插槽只有品牌位、面板图标列表（`sidebar.panellist`）、`sidebar.workspaces`（单占位，已被官方工作区浏览器整个占用）和底部位 —— **工作区上方没有可插入内容的空位**；占用 `sidebar.workspaces` 会替换掉搜索框 + 分组会话列表 + 所有工作区弹窗。

所以插件注册在 `conversation.header.leading`：会话标题左侧的全局导航位（`replaceRisk: none`），不占页面空间，在新建会话页也可见。

## 功能

- 胶囊 `● 运行中 N 个 ▾`，数量随会话状态实时变化（绿点轻微呼吸，便于扫一眼确认有活在跑）。
- 下拉「正在运行的会话」：每行显示标题、所属工作区、最近活动时间；等待授权 / 计划确认 / 待回答的会话在行尾标出。
- 下拉「最近完成」（默认 3 条，可关）：列出最近结束的会话，灰色圆点，同样一键跳转。
- 点击行 → `uiWorkspace.openSession(id)`，与点击侧栏会话走完全同一条路径。
- 关闭：再点胶囊、`Esc`（焦点回到胶囊）、点击外部、窗口缩放。
- 没有运行中会话时组件直接不渲染（可用 `showWhenIdle` 改成常显，方便随时进"最近完成"）。
- 展开后首行自动获得焦点，方向键 / `Tab` 可在列表里走，回车跳转。

## 配置

点下拉右上角的齿轮进入设置面板，五项开关即时生效：

| 选项 | 键 | 默认 | 说明 |
| --- | --- | --- | --- |
| 没有运行中会话时也显示胶囊 | `showWhenIdle` | `false` | 打开后胶囊常驻，可随时进入"最近完成" |
| 最近完成 | `recentLimit` | `3` | `0 / 1 / 3 / 5`，`0` 关闭该分组 |
| 显示工作区 | `showWorkspace` | `true` | 行内是否显示所属工作区名 |
| 显示时间 | `showTime` | `true` | 行内是否显示最近活动时间 |
| 显示待处理标记 | `showPending` | `true` | 行尾是否显示"等待授权 / 等待确认计划 / 等待回答" |

配置存本机 `localStorage["dsh-running-sessions:config"]`（JSON），**不写 profile 文件**，所以切换选项不会触发插件重装或应用重载。恢复默认：

```js
localStorage.removeItem('dsh-running-sessions:config')
```

## 性能

会话正在流式输出时，roster 快照**每个 token 都会变**，所以这个组件天生会被高频重渲染。为此做了几件事：

- 样式只在 `apply()` 里注入一次（`ctx.styles.insert`，失败回退到 `<head>` 里一个带 `data-dsh-running-sessions` 的 `<style>`），组件不再每次 render 创建一个 2.8KB 的 `<style>` 元素。
- 收起状态只做一次 O(N) 计数（`countRunning`），**不构造行对象、不排序**；行数据（`buildRows`）只在展开时计算。
- 展开时每 30 秒刷新一次相对时间，收起后定时器立刻清除。
- 事件监听分两层：胶囊本身只有一个常驻的 `window` 捕获监听；`document.pointerdown / keydown`、`window.resize` 只在展开期间挂载。
- 定位用的 `useLayoutEffect` 只依赖"可能改变菜单尺寸"的值（展开状态、条目数），不会因为快照更新而重复测量。

## 数据来源

只读官方快照，不新增 Host 服务：

- `useSessions` → `{ ids, byId }`（`title` / `displayTitle` / `updatedAt` / `running`）
- `useSessionStatus` → `Map<SessionId, { running, pendingInteraction, completionUnread }>`
- `useWorkspaces` → `{ items: [{ title, sessionIds }], archivedSessionIds }`

已归档的会话不显示。运行状态以 `useSessionStatus` 为准，缺失时回退到 `session.running`。

## 结构

| 文件 | 作用 |
| --- | --- |
| `client.js` | 全部客户端逻辑（React 组件 + CSS 字符串 + 中英文词典），无第三方依赖，只用 `react` / `react-dom` 与主题 token `--dsw-alias-*` |
| `index.js` | Host 侧空实现（纯 UI 插件） |
| `cordis.patch.yml` | bundle patch，`insert` 一行插件记录 |
| `locale/zh.json`、`locale/en.json` | 插件市场显示用的名称与描述 |
| `icon.svg` | 插件图标 |

## 安装

```powershell
plugin_manager install_bundle(target="<本目录的绝对路径>")
```

或在本应用的插件页安装这个本地包。profile 里以 symlink 方式安装，因此改完 `client.js` 后在应用内按 `Ctrl+R` 重载即生效，不需要重装。卸载用 `remove_bundle`。

## 开发时的三个坑（都已处理，改动时别退回去）

1. **标题栏是窗口拖动面**：外壳在**捕获阶段**就处理了 `pointerdown`，按钮上的冒泡监听在实机上收不到事件。所以胶囊用 `window` 捕获阶段的监听判断命中并接管，并对 `click` 停止冒泡。
2. **会话切换会重建 header 组件**：展开状态存在组件里会随重挂载丢失。现用模块级 `openAcrossMounts`，且只在 3 秒内跨挂载恢复，避免以后莫名自弹。
3. **主题没有圆角 token**：`--dsw-alias-*` 全是颜色，圆角/尺寸必须写字面量；官方同排 chip 的实测几何是 `26px` 高、`8px` 圆角、`0.5px` 描边、透明填充，胶囊按这个对齐。

## 已知限制

- 只能列出**已经被客户端加载**的会话；应用刚启动时 roster 需要几秒才齐。
- 相对时间按 30 秒刷新，最多滞后 30 秒。
- 只用官方主题 token，理论上浅色/深色都适配，但深色主题尚未做逐像素对照。
