# 运行中会话胶囊 · dsh-running-sessions

<div align="center">

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/ERroooooR/dsh-running-sessions/blob/main/LICENSE)
[![DSH](https://img.shields.io/badge/DSH-0.2.2--rc.3%2B-4d6bfe)](https://github.com/deepseek-ai/deepseek-harness)
[![platform](https://img.shields.io/badge/platform-DSH%20Web%20%2F%20Desktop-8A2BE2)](#安装)
[![GitHub stars](https://img.shields.io/github/stars/ERroooooR/dsh-running-sessions?style=social)](https://github.com/ERroooooR/dsh-running-sessions/stargazers)

<p>
  <img src="https://raw.githubusercontent.com/ERroooooR/dsh-running-sessions/main/preview.png" alt="真实窗口里的位置：胶囊在会话标题栏左侧，展开是运行中会话清单" width="660" />
</p>
<p>
  <img src="https://raw.githubusercontent.com/ERroooooR/dsh-running-sessions/main/preview-menu.png" alt="运行中会话：每个主会话下面缩进列出它自己的子 agent，子 agent 行只有一行标题、同一颗绿点" width="248" />
  <img src="https://raw.githubusercontent.com/ERroooooR/dsh-running-sessions/main/preview-settings.png" alt="设置面板：七项开关，改完立刻生效，不必重载应用" width="245" />
</p>

</div>

DeepSeek Harness 的界面插件：在会话标题栏左侧放一枚常驻胶囊 `● 运行中 3 个 ▾`，点开就是**正在运行的会话清单**，再点一下直接切过去 —— 不用再去侧边栏里翻找。下拉底部还会列出**最近完成的会话**。

标准 DSH bundle 插件，纯客户端实现，不新增 Host 服务、不依赖第三方库。

## 特性

- **常驻标题栏**：注册在 `conversation.header.leading`（会话标题左侧的全局导航位），不挤占任何页面空间，新建会话页也在。
- **一键切换**：点行 → `uiWorkspace.openSession(id)`，和点击侧栏会话走完全同一条路径。
- **只显示主 agent**：子 agent 各自跑在自己的 DSH 会话里，但它们不再被算成"又一个运行中会话"—— 一个正在用多个子 agent 的主会话仍然只占一行。
- **只算真正的对话**：DSH 里还没发过消息的空会话（"新建会话"那类占位符）不占行 —— 否则它会顶着工作区目录名排在「最近完成」第一行。官方侧栏也这样隐藏它们。
- **子 agent 不会让胶消失**：主 agent 的回合已经结束、但子 agent 还在干活时，所属会话仍算运行中（可关）。
- **子 agent 挂在主会话下面**：正在跑的子 agent 直接缩进在它**所属的那一行**下面，只占一行标题、不重复工作区和所属会话，多级嵌套逐级再缩进；胶囊和行尾都不再有「子 N」计数徽标。子 agent 行可一键关掉。
- **最近完成**：运行中会话下面跟一组灰点会话（默认 3 条），刚结束的那些不用回头去工作区里找。
- **待处理标记**：等待授权 / 等待确认计划 / 等待回答的会话，行尾直接标出来。
- **自动隐藏**：没有会话在跑时整枚胶囊消失，标题栏保持干净（可在设置里改成常显）。
- **七项设置**：下拉右上角推子图标，改完立刻生效，不必重载应用。
- **轻**：只用 `react` / `react-dom` 和官方主题 token `--dsw-alias-*`，随界面浅色/深色自动适配。

## 安装

**从 GitHub 装** —— 这是现在就能用的方式。产物 `client.js` 已经预构建好，安装时不需要跑构建脚本：

```sh
dsh plugin --profile web add github:ERroooooR/dsh-running-sessions
```

**桌面应用（Electron 版）** —— 桌面端的 profile 由应用托管，CLI 的 `--profile desktop` 会被拒绝，所以在应用里让 DSH 自己装。`install_bundle` 接受本地目录、git URL、tarball URL 或 npm 包名：

```powershell
plugin_manager install_bundle(target="<本仓库的绝对路径>")
```

`install_bundle` 走的是链接安装，所以以后改 `client.js` 也是重载一下就行，不用重装。

> npm 包名 `dsh-running-sessions` 已经预留，但**还没有发布**（首次发布走 GitHub Actions 的 Trusted Publishing，见 [RELEASING.md](RELEASING.md)）。发布之后可以改成一条命令：`dsh plugin add dsh-running-sessions`。

装完按 `Ctrl+R`（web 端硬刷新 `Ctrl+Shift+R`）重载界面即可看到胶囊。

卸载：

```powershell
plugin_manager remove_bundle(target="dsh-running-sessions")   # 桌面应用内
dsh plugin --profile web remove dsh-running-sessions           # dsh web
```

> 更名前的本地开发版用的是私有包名 `@local/running-sessions`，它从未发布到 npm。如果你装过那种版本，卸载要用**旧名字**，否则旧依赖会和新条目同时留在 profile 里：
>
> ```powershell
> plugin_manager remove_bundle(target="@local/running-sessions")   # 桌面应用内
> dsh plugin --profile web remove @local/running-sessions           # dsh web
> ```

## 使用

| 想做什么 | 怎么做 |
| --- | --- |
| 切到某个运行中的会话 | 点胶囊 → 点那一行 |
| 切到刚结束的会话 | 点胶囊 → 「最近完成」里点一行 |
| 关掉下拉 | 再点胶囊 / `Esc` / 点空白处 |
| 键盘操作 | 打开后首行自动聚焦，`Tab` 逐行移动，回车切换 |
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
| 子 agent 活动算作会话运行中 | 主 agent 自己空闲、但名下子 agent 在跑时，会话仍算运行中 | 开 |
| 在主会话下面列出子 agent | 每个运行中的主会话下面缩进列出它自己的子 agent（可关，关掉后只剩主会话一行） | 开 |

两个子 agent 开关独立可配：可以只把子 agent 活动折进主会话运行状态却不在下拉里列它们，也可以两者都关，让插件对子 agent 完全不表态。

设置存本机 `localStorage["dsh-running-sessions:config"]`，不写任何 profile 文件 —— 所以改设置不会触发插件重装，也不用重载应用。设置面板底部还有一颗「恢复默认」。

## 布局

标题栏和下拉的视觉细节都是对齐官方同一排的 chip / popover 调的：

- **设置图标是描边，不是实心**。实心齿轮在深色底上会糊成一整块浅色墨点，抢走标题的注意力；换成 1.15px 描边的「推子」图形（14×14 图形，20×20 热区）后，墨量降下来，点击热区不变。
- **「点击即切换」只出现一次**。它是 onboarding 提示，不是常驻文案：首次展开时出现，第一次关掉下拉后写 `localStorage["dsh-running-sessions:hint-seen"]`，之后（包括切会话导致的 header 重挂载）都不再出现。想再看一次：`localStorage.removeItem('dsh-running-sessions:hint-seen')`。
- **行内容内缩，层级靠缩进读出来**。会话行整体从菜单左边框退 `12px`；子 agent 行更窄（`padding: 2px 8px`、单行 16px 高），按嵌套深度退到 `26px / 40px / 54px`。分区标题保留 `8px` 边距，所以视觉上标题基准线略在行左边，形成「标签 → 内容」的缩进关系。子 agent 与其所属主会话是「内容 → 更深一层内容」，不再有单独一栏。
- **子 agent 行用同一颗绿点**。子 agent 行不是另一种状态，只是同一个运行中会话更细的一层，所以它的圆点和主会话行完全一致（`--dsw-alias-state-success-primary` + 呼吸动画），不用另一种颜色把它读成"另一种东西"。
- **子 agent 的标题来自父会话的 catalog**。DSH 会把子会话自己的 `title` 填成任务提示词的开头（比如「你在 DSH 团队里做岗位…」），照它渲染就是一段被截断的正文。插件改用父会话 `subagentCatalog` 里 `label`（创建时的描述，如「有线广播检索 Agent A」），退而取 `name`；两者都没有才回到会话标题。catalog 是实时投影，子 agent 建出来、改名都会跟着更新。
- **菜单宽度按内容定**。`placeMenu` 只给 `200–240px` 的宽度区间：一行标题加一条 meta 就够，太宽会在每行右边留一条空槽。

## 为什么子 agent 不单独算会话

DSH 让每个子 agent 跑在自己的 Session 里，`session.list` 把它们和普通会话平铺在一起 —— 于是 `subagent` 工具一开三五个子 agent，胶囊数字就跳成 6、7，下拉里全是几秒前刚建的空会话。

现在的判定只看**可证的子 agent 血缘**，不靠猜：

| 事实来源 | 用途 |
| --- | --- |
| 行上的 `origin: 'subagent'` | 身份权威判定，普通分叉（只带 `parentId` 没有 `origin`）不算子 agent |
| 行的 `parentId` | 指向所属会话；父会话未加载时该子 agent 仍然不是顶层会话 |
| 父会话的 `subagentCatalog` 投影 | 补充尚未进入 Host 列表的子会话，并给出该子会话的显示名（`label` → `name`） |

判定结果：子 agent 会话一律不进顶层行，而是缩进挂在**它所属的那个运行中主会话**下面 —— 从属关系直接由行的位置表达，不用「属于 XX」这类重复文字；父会话被归档时，名下的子 agent 一起隐藏。计数与列表只统计主 agent 会话，子 agent 活动可以向上折算成"父会话在跑"（可关）。

## 为什么在标题栏而不是侧边栏

侧边栏「工作区」上方没有可以插内容的空位：那一层只提供品牌位、面板图标列表，以及已被官方工作区浏览器整个占用的 `sidebar.workspaces`。占它就得重写搜索框 + 分组会话列表 + 所有工作区弹窗。

`conversation.header.leading` 是官方预留的全局导航位（`replaceRisk: none`），放这里既不挡内容，也不跟任何插件抢位置。

## 兼容性

- 在 **DSH 0.2.2-rc.3**（Electron 桌面端，Windows）实测：胶囊渲染、下拉展开、行点击切换、设置项持久化；rc.2 → rc.3 逐个契约文件比对无差异。
- 只使用稳定接口：`ctx.slots` / `ctx.locale` / `ctx.uiWorkspace.openSession`，以及 `useSessions` / `useSessionStatus` / `useWorkspaces` 三个只读快照钩子。
- 插件对 DSH 的每一处依赖都收在 **`src/contract.js` 一个文件里**（槽位 id、locale 命名空间、标准 props 名、服务名、所有快照字段名）。DSH 改名或改形状时只需要改这一个文件，`test/contract.test.mjs` 会立刻告诉你哪条假设失效了。
- 所有读取器都是防守式：字段缺失退化成"没有数据"，不会抛异常。DSH 升级后最坏的表现是胶囊消失，而不是标题栏崩掉。
- 数据全部来自官方会话快照，插件不新增 Host 服务、不写会话数据。
- 子 agent 判定只依赖会话快照上的 `origin` / `parentId` 与 `subagentCatalog` 投影，都是官方字段；字段缺失时退化为"按普通会话显示"，不会把普通会话错判成子 agent。
- macOS 上菜单需要 `data-window-drag-exclude` 才不会被当成窗口拖动面（DSH 0.2.2-rc.1 起的窗口区域规则），菜单根节点已声明该属性；Windows / 纯 Web 不受影响。

## 已知限制

- 只能列出**客户端已经加载**的会话，应用刚启动的几秒内列表可能不全。
- 相对时间每 30 秒刷新一次，最多滞后半分钟。
- 浅色主题已逐像素对照官方 chip / popover，**深色主题只用 token 适配过，没做像素级验证**。
- 子 agent 行按所属主会话分组，每组最多列出 6 条，多出的在该主会话下面用 `+N` 表示，避免大 fan-out 把下拉撑长；计数不受这个上限影响。

## 开发

源码在 `src/`，按职责拆成 22 个普通 CommonJS 模块；`client.js` 是**生成的**单文件产物（`window.__ModuleLoader__.load` 只能收一个 classic script，所以产物必须是一个文件）。

| 文件 | 作用 |
| --- | --- |
| `build.mjs` | 把 `src/` 打成一个 `client.js`：校验每个 require 都能解析，按码位排序保证产物跨机器逐字节一致，内容没变就不写盘（不改 mtime，避免无谓的插件重载） |
| `src/contract.js` | **唯一**提到 DSH 名字的文件：槽位、locale 命名空间、服务名、标准 props、所有快照字段 + 防守式读取器 |
| `src/platform.js` | **唯一**绑定 `react` / `react-dom` 和页面全局的文件；`configure()` 让无头测试注入 React 替身 |
| `src/main.js` | 入口：绑定平台模块，注册词典与标题栏槽位；`__internals` 是给测试用的唯一接缝 |
| `src/component.js` | 槽位组件：读三个快照、管交互状态、把纯数据交给 view |
| `src/roster.js` | 血缘分类与活动解析（谁是主会话、谁折进谁、谁在跑） |
| `src/rows.js` | 胶囊的两个计数 + 下拉行数据（每个运行中主会话带自己的嵌套子 agent 行） |
| `src/config.js`、`src/hint.js` | 选项持久化与一次性提示标志 |
| `src/press.js` | 按压守卫：一次按压只切一次，且没有按前事件的 `click`（无障碍、脚本触发）仍然生效 |
| `src/view/*.js` | 纯渲染：胶囊、菜单、行、设置面板、图标 |
| `src/style.js` | 样式表与一次性注入 |
| `src/geometry.js`、`src/time.js`、`src/mount-state.js`、`src/nav.js`、`src/i18n.js`、`src/dictionaries.js` | 定位、相对时间、跨挂载状态、导航、翻译、文案 |
| `index.js` | Host 侧空实现（纯 UI 插件） |
| `cordis.patch.yml` | bundle patch，`insert` 一行插件记录 |
| `locale/zh.json`、`locale/en.json` | 插件市场里的名称与描述 |
| `icon.svg` | 插件详情页图标（DSH 插件页用，`exports["./icon"]`） |
| `assets/icon.png` | 插件市场卡片图标（列表的 `icon:` 只收 GitHub 托管的位图，不收 SVG） |
| `screenshots.json` | 市场详情页的截图顺序（1–8 张，路径相对本文件） |
| `test/` | 无头断言（见下） |

改完源码跑 `npm run build` 重新生成 `client.js`，再重载界面。三个容易踩回来的坑：

1. **标题栏是窗口拖动面**：外壳在**捕获阶段**就处理了 `pointerdown`，按钮上的冒泡监听实机收不到 —— 必须用 `window` 捕获阶段的监听接管，并对 `click` 停止冒泡。
2. **切换会话会重建 header 组件**：展开状态放进组件会随重挂载丢失，现在放模块级（`mount-state.js`），且只允许 3 秒内跨挂载恢复，避免以后自弹。
3. **主题没有圆角变量**：`--dsw-alias-*` 全是颜色，圆角必须写字面量；官方同排 chip 实测是 26px 高 / 8px 圆角 / 0.5px 描边 / 透明填充。

三条结构性约束由测试守住，不是靠自觉：

- **只有 `contract.js` 能出现 DSH 的字段名/服务名**，别的模块出现就报错 —— 这样"升级会坏在哪"永远是一个文件的事。
- **只有 `platform.js` 能 `require('react')` / `require('react-dom')`**，别的模块出现就报错。
- **只有 `platform.js` 和 `style.js` 能碰 `window` / `document`**，别的模块出现就报错 —— 组件和视图因此可以在无浏览器环境下用替身渲染。

另外三条"不留垃圾"的检查：每个导出都有人用、每个顶层函数都被调用、每条 CSS 选择器都有代码真的渲染出来。删掉一段逻辑时漏掉的引用会立刻失败，而不是变成几年后才有人发现的死代码。

性能取舍：快照在流式输出时每个 token 都会变，所以收起状态只算一次 O(N) 的主/子两个计数，行数据只在展开时构建，样式只在 `apply()` 里注入一次。

### 测试

`src/` 是普通 CommonJS，测试直接 `require` 它们（跑的是源码，不是产物）；`test/bundle.test.mjs` 再把**生成的 `client.js`** 放进 `node:vm` 的页面沙箱里跑一遍，证明产物真的能注册、能解析模块表、`apply()` 的注册顺序与源码一致。

```sh
node build.mjs --check          # 产物是否与源码同步（npm test 的 pretest）
node test/contract.test.mjs     # 14 项：DSH 字段契约、缺字段降级、catalog 名字、定位与相对时间
node test/roster.test.mjs       # 31 项：血缘判定、嵌套层级、子 agent 命名、折叠、归档、环、归属冲突、配置归一
node test/press.test.mjs        # 10 项：一次按压只切一次、无障碍 click、回声窗口、监听器摘除
node test/render.test.mjs       # 27 项：胶囊文字、子 agent 嵌套与命名、设置面板、一次性提示、图标墨量
node test/integration.test.mjs  # 18 项：词典键集、apply() 注册、分层规则、样式热重载、死代码、产物同步、按压守卫接线
node test/bundle.test.mjs       #  6 项：产物在沙箱里的注册与降级
npm test                        # 上面六个 + pretest 一起跑
```

## 许可证

[MIT](./LICENSE)
