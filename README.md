# Running Sessions Pill

一个 DeepSeek Harness 客户端插件：在会话标题栏左侧常驻一个胶囊，显示**正在运行的会话数量**，点开下拉即可直接切换到任意运行中的会话。没有正在运行的会话时整个胶囊隐藏。

![preview](./preview.png)

## 为什么在标题栏而不是侧边栏

侧边栏（`sidebar`）的子插槽只有品牌位、面板图标列表（`sidebar.panellist`）、`sidebar.workspaces`（单占位，已被官方工作区浏览器整个占用）和底部位，**工作区上方没有可插入内容的空位**；占用 `sidebar.workspaces` 会替换掉搜索 + 分组会话列表 + 所有工作区弹窗。

所以插件注册在 `conversation.header.leading` —— 会话标题左侧的全局导航位（`replaceRisk: none`，不占用任何页面空间，在没有会话的新建页也可见）。

## 行为

- 胶囊显示 `● 运行中 N 个 ▾`，数量随会话状态实时变化。
- 下拉每行：会话标题、所属工作区、最近活动时间；等待授权 / 计划确认 / 待回答的会话会在行尾标注。
- 点击行 → `uiWorkspace.openSession(id)`，与点击侧栏会话走同一条路径。
- 关闭方式：再点胶囊、`Esc`、点击外部。
- `count === 0` 时组件直接不渲染。

## 结构

| 文件 | 作用 |
| --- | --- |
| `client.js` | 全部客户端逻辑（React 组件 + 样式 + 中英文词典），无外部依赖，仅用 `react` / `react-dom` 与主题 token `--dsw-alias-*` |
| `index.js` | Host 侧空实现（纯 UI 插件） |
| `cordis.patch.yml` | bundle patch，`insert` 一行插件记录 |
| `locale/zh.json`、`locale/en.json` | 插件市场显示用的名称与描述 |
| `icon.svg` | 插件图标 |

## 安装

```powershell
plugin_manager install_bundle(target="<本目录的绝对路径>")
```

profile 里以 symlink 方式安装，改完 `client.js` 在应用内按 `Ctrl+R` 重载即生效。

## 数据来源

只读官方快照，不新增 Host 服务：

- `useSessions` → `{ ids, byId }`（`title` / `displayTitle` / `updatedAt` / `running`）
- `useSessionStatus` → `Map<SessionId, { running, pendingInteraction, completionUnread }>`
- `useWorkspaces` → `{ items: [{ title, sessionIds }], archivedSessionIds }`

已归档的会话不显示。
