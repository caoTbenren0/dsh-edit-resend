# dsh-edit-resend — 交接文档 (HANDOFF)

> 编辑已发送的用户消息并重新发送（fork 新分支），DeepSeek Harness 插件。
> 最后更新：2026-08-17

---

## 1. 这是什么

一个 DSH 静态插件包，提供「编辑并重发」功能：

- 悬停**已发送的用户消息**，气泡右侧操作行出现 `✎ 编辑并重发` 按钮（与复制按钮平级）
- 点击后气泡变为文本编辑区，修改后点「保存并重发」
- Host 端把目标消息**所在轮次及其之后的所有内容丢弃**，用编辑文本 fork 出一个**新分支会话**（继承原会话 cwd / 默认模型 / agent preset），并自动以编辑文本作为新轮次消息发送
- 页面自动跳转到新分支会话，模型重新回答

**原会话数据保留不动**（事件溯源架构下历史不可改写，只能 fork 新分支——用户已确认此语义）；fork 成功后**自动归档原会话**（仅视图隐藏：日志与 `sessionIds` 席位保留，可随时取消归档恢复，见 §3.5）。

---

## 2. 代码位置

- **插件包**：`E:\caoTfile\code\dsh\back\`（已从 `E:\caoTfile\code\dsh\dsh-edit-resend` 迁移至此）
- **交接文档**：`E:\caoTfile\code\dsh\back\HANDOFF.md`（本文件）
- **备份**：`C:\Users\Acer\.dsh\profiles\web\cordis.patch.yml.bak2`（修改 profile patch 前的备份）

### 包结构

```
dsh-edit-resend/
├── package.json          # dsh.client 声明 + dsh.bundle.patch + exports
├── cordis.patch.yml      # bundle 自带组合 patch（- id: edit-resend）
├── lib/
│   ├── index.js          # Host 半：EditResendService extends TypertRemoteService
│   │                     #   @Remote("edit") → editResend/edit 端点
│   ├── typert.host.js    # Host 侧 TYPERT manifest（typert-loader 自动注册，含 zod schema）
│   ├── typert.remote.js  # Client 侧 TYPERT_REMOTE 描述符（ctx.remote.$mount 用）
│   └── client.js         # Client 半 UMD bundle（替换 user 渲染器 + 编辑按钮）
└── node_modules/         # ⚠️ junction → dsh 全局 node_modules（见 §5）
```

---

## 3. 当前安装状态（web profile）

- `C:\Users\Acer\.dsh\profiles\web\package.json`：
  - `dependencies["dsh-edit-resend"] = "link:E:/caoTfile/code/dsh/back"`
  - `dsh.profile.bundles` 含 `"dsh-edit-resend"`（通过 `dsh plugin add` 自动加入）
- `cordis.patch.yml`：**未**手动添加 edit-resend 行（靠包的 `dsh.bundle.patch` 自动并入，避免双重注册）
- 已验证：
  - `dsh --profile web --dump-config` 组合树含 `- id: edit-resend / name: dsh-edit-resend` ✓
  - 包可解析、`EditResendService` 加载正常（`edit` 方法 + 静态 inject 完整）✓
  - client bundle 子路径 `dsh-edit-resend/client` 可解析 ✓

### 尚未完成

- **重启 dsh web 验证**：静态插件的 client bundle 与组合树只在启动时加载，必须重启后才生效。重启后应看到用户消息气泡上的编辑按钮。

---

## 3.1 修复记录（2026-08-17）：Failed to load plugins

**症状**：`failed to apply loader entry e3fd7a6a (dsh-edit-resend): keyed slot "conversation.chat.node" already has an entry for key "user" at priority 0 (registered by x6)`

**根因**：`lib/client.js` 中 `slots.register({ name: "conversation.chat.node", key: "user" })` 未指定 `priority`，默认 0；与已注册 `user` 键的插件（x6，同为 priority 0）冲突。`SlotCore.register`（`@deepseek-ai/dsh-client-ui-slots`）对 keyed slot 的规则是：同 key **且** 同 priority 才报错；priority 越低越先渲染（shadow）。

**修复**：注册时显式指定 `priority: -100`，低于 0 即可绕开冲突并 shadow 官方 `user` 渲染器（见 `lib/client.js` apply 段注释）。

**配套**：`C:\Users\Acer\.dsh\profiles\web\package.json` 的 `dsh.profile.bundles` 曾缺 `dsh-edit-resend`（导致插件不在启动 roster 中），已重新加入（备份：`package.json.bak-editresend`）。`dsh --profile web --dump-config` 已确认组合树含 `- id: edit-resend / name: dsh-edit-resend`。

**遗留观察**：`package.json` 声明的 `types` 指向 `lib/types/**/*.d.ts`——现已补齐（见 §3.7）。

### 3.2 渲染与功能修复（2026-08-17，实测通过）

问题链（每个都是实测复现后修复）：

1. **气泡无样式（CSS 未注入）**：`lib/client.js` 定义了 `CSS` 常量但从未挂到页面。修复：`apply()` 里按官方 `data-plugin-css` 模式注入 `<style>`（`tag.dataset.plugin` / `tag.dataset.pluginCss`，幂等守卫）。症状是气泡无蓝色背景、左对齐、按钮掉到下方。

2. **保存报 `cannot get property "remote.editResend" without inject`**：`remote.<ns>` 是 cordis 关联服务（`remoteServiceKey` = `remote.<ns>`），正常消费要在 `exports.inject` 声明 `"remote.editResend"`。

3. **注入即死锁**：本插件**自己 $mount** 自己的 Remote 贡献（官方装配 `dsh-api-remotes` 只挂 first-party remotes，第三方必须自挂），若同时注入 `remote.editResend`，loader 会等一个只有本插件 apply() 才能创建的服务 → `pending (waiting for service: remote.editResend)`。修复：`exports.inject` 不含 namespace，`$mount` 之后用 `ctx.get("remote.editResend")` 动态解析。

4. **"重发失败"（结果解包错位）**：gateway RPC 成功返回 `{ok: true, value: <host 结果>}`，host 的 `{ok:false, error}` 在 `value` 里。修复：取 `result.value ?? result` 再判断。

**验证**（headless Edge 实测）：编辑按钮出现 → 编辑框带原文 → 保存 → host 创建 fork 会话（原会话不动）→ `sessions.open` 选中新会话 → 会话列表出现新分支。已确认服务端下发 bundle 含全部修复（`cache-control: no-cache`，刷新页面即生效，无需重启）。

**注意**：验证过程在「为DeepSeek harness添加千问适配 (1)」下创建了一个测试 fork 会话（消息含 `[自动验证-应产生新分支]`），可自行删除。

**包已迁移**：插件包现位于 `E:\caoTfile\code\dsh\back`（profile 依赖已更新为 `link:E:/caoTfile/code/dsh/back`，bundles 含 `dsh-edit-resend`）。

### 3.3 加法改造（2026-08-17）：不再 shadow，改为 turnTail 加法

按官方"插件走扩展点"原则重写 `lib/client.js`：**移除** `conversation.chat.node` 的 `user` 键 shadow（不再替换官方用户气泡渲染器），改为在 **`conversation.chat.turnTail` chain 槽**注册加法条目：

- 每个**已完成回合**的尾部出现 `✎ 编辑本轮消息并重发` 按钮
- 保存逻辑复用 §3.2 的动态 `ctx.get("remote.editResend")` + `result.value` 解包
- 官方用户气泡恢复原样（蓝色气泡由官方渲染），插件只贡献尾部按钮与内联编辑面板的少量 CSS

**关键契约**（查证自 `dsh-client-ui-slots`/`dsh-client-ui-conversation` 源码）：
- chain 条目 `register` 必须带 `select`（纯函数，返回非 null 即选中，结果注入 `matched` prop）；`select: () => true` 表示恒渲染
- ⚠️ **chain 槽只渲染第一个 `select` 返回非 null 的条目（`break`），不是"全部条目依次渲染"**（§3.3 旧理解的勘误；web-react `renderOutletContent` chain 分支）。条目按 priority 排序（同 priority 保持注册顺序），所以与本插件的 `select: () => true` 竞争时，**先注册的条目总是赢**——官方 `dsh-client-ui-deliverables`（产物）注册在前，有产物时显示产物、无产物时 `selectProducedFiles` 返回 null 才轮到本插件
- `conversation.chat.turnTail` owner props：`{ turn: TurnLocation, seq, openFile }`；`TurnLocation.turn` 才是 turn id（`location.turn.turn`）；会话作用域标准 props 含 `sessionId`/`useSession`
- 官方 `user` 渲染器内部硬编码 `MessageIconActions`，**没有用户消息的加法 action 槽位**——"悬停气泡 ✎"只能 shadow；回合尾部/会话头部才是加法路径
- ⚠️ **客户端投影有窗口截断**：长会话的早期事件不生成节点（`snapshot.chat.locations.getTurn` 可能查不到 user 节点，详见 §3.4）——**不要用投影定位消息，一律走 host 事件日志**

**注意（服务器 clientPath 缓存）**：服务端进程在**包移动前**启动时，`client-modules` 的 module table 会把 clientPath 解析为旧路径（如 `E:\caoTfile\code\dsh\dsh-edit-resend`），移动包后该路径消失 → `/plugins/dsh-edit-resend/client.js` 404（表现为 "bundle script failed to load"）。**移动包后必须重启 dsh web**，让 table 按新链接目标重建。

### 3.4 修复（2026-08-17）：按钮不渲染——窗口截断 vs 投影查找

**症状**：CSS 注入成功、apply 完整执行、`slots.register` 成功（ledger 两个条目）、chain 选举模拟正常，但真实浏览器里按钮不出现（turnTail 槽空）。重启无效。

**排查**（CDP 注入 hook 逐层验证 + 用户浏览器诊断日志）：
1. bundle 加载 ✓ / apply 完成 ✓ / register 持久 ✓ / 选举 ✓ → 问题在组件内部
2. 组件诊断日志实锤：`getTurn(4)` 返回 11 个节点全是 assistant-step/tool-call/turn-tail，**没有 user 节点**；全节点扫描发现唯一 user 节点 `locTurn: 5`
3. **根因**：客户端会话投影对长会话**窗口截断历史**——turn 4 的 `user/message` 事件（以及 `turn/start`）在加载窗口外，未生成节点；部分消息还被 inbox 机制归类为 `steering`。组件 `user === null` → 静默返回 null → 按钮不渲染。**"从投影找本回合用户消息"的设计在长会话下必然失效**

**修复**：**host 端从完整事件日志定位消息**（host 持有全量事件，不受窗口影响）：
- `editResend/edit` 参数改为 `{ sessionId, turn, text }`：host 定位 `turn/start` → 找回合内第一条 `src=user` 的 `user/message` → 从 turn/start 切割 seed → fork 子会话 → 重发
- **新增 `editResend/getText`**：`{ sessionId, turn }` → 返回回合用户消息原文（客户端编辑框预填；投影拿不到原文，必须走 host）
- client 组件简化：不再用 `useSession` 查节点，`turn.turn` 直接来自官方 owner props；按钮对每个已完成回合恒渲染，点击时才调 `getText`
- typert schema（host/remote）、client bundle 的 descriptor 同步加了 getText

**验证**：重启 dsh web 后，长会话（如"查看dsh-edit-resend项目"，turn 4 曾无 user 节点）的回合尾部出现按钮 ✓（2026-08-17 用户实测）

**遗留**：编辑语义仍是"丢弃整个回合（含同轮其他消息）并重发"；图片消息显示占位符问题与 §6 已知取舍不变。

### 3.7 补齐 types 声明（2026-08-17）

`lib/types/` 四个声明文件与 `package.json` 的 exports 一一对应，均为手写、与 `typert.host.js` 的 model.declaration 保持一致：

- `lib/types/index.d.ts` — 主入口：`EditResendService` 类（extends `TypertRemoteService`）+ 全部请求/结果判别联合类型（`ok: true | false`）
- `lib/types/client/index.d.ts` — client 是 UMD 副作用 bundle，无导出，声明仅供 TS 解析路径
- `lib/types/typert.host.d.ts` / `typert.remote.d.ts` — `TYPERT` / `TYPERT_REMOTE` 清单结构

**验证**：临时 TS 项目以消费者视角 `paths` 映射四个入口 + `tsc --strict --noEmit` 通过（TYPECHECK OK）。

### 3.5 自动归档原会话（2026-08-17，v2 时序修复 2026-08-17）

编辑重发 fork 成功后，**原会话自动归档**（`workspaceRegistry.archiveSession(source.id)`，best-effort，失败只记日志不影响重发）：

- 归档 = 视图级隐藏：会话日志与工作区 `sessionIds` 席位不动，取消归档即恢复原位置（官方 `dsh-workspace` 语义，归档绝不删数据）
- 幂等：原会话已归档时 `archiveSession` 直接完成不写入
- **v1 位置（已废弃）**：`edit` 方法第 9 步、返回前归档 → **竞态 bug**：归档广播 `host/archived-sessions-changed` 先于/同时于 RPC 响应到达 client，client 投影发现**当前会话被归档**就 `sessions.clear()`（dsh-client-runtime `project()`：`archivedSessionIds.includes(sessions.current)` 时清空），用户被甩回新建会话（hero）页而不是 fork
- **v2 位置（现行）**：`edit` **不再归档**，只 fork + followup + 返回 `{ ok: true, sessionId }`；新增独立 Remote `editResend/archive({ sessionId })`（官方 `archiveSession` 的薄封装）。client `save()` 成功路径**先同步 `sessions.open(forkId)`（`select` 同步置 current）→ 再 `await editResend.archive(sourceId)`**：归档广播到达时 current 已是 fork，清空规则永不触发；`open` 抛 "unknown session"（fork 创建广播偶发晚于 RPC 响应）时 600ms 延迟重试兜底
- 失败路径（fork/send 失败）不归档

### 3.6 恢复被归档的会话（2026-08-17，设置页方案）

**官方现状**：0.1.0-rc.6 **只有 `workspace.archiveSession`，没有 unarchive API，也没有任何恢复 UI**（归档会话从分组视图与搜索结果中全部隐藏）。归档是"单向"的，只能靠未来版本或手动手段。

**插件补齐恢复能力（入口在设置页）**：

1. **host 新增 Remote**：
   - `editResend/archive`：`{ sessionId }` → `workspaceRegistry.archiveSession` 薄封装（供 client 在打开 fork **之后**归档原会话，见 §3.5 竞态修复）
   - `editResend/unarchive`：`{ sessionId }` → 直接调 `workspaceRegistry.setState({ initialized: true, workspaceIds: registry.list().map(w => w.id), archivedSessionIds: 过滤后 })`（`setState` 是公开方法：`global.set` 写 domain + 更新内存）。**关键**：domain `put` 触发 apiProxy 的 `domain/changed` 监听 → 广播 `host/archived-sessions-changed` → **client UI 自动刷新**，恢复后原会话立即回到侧边栏
   - `editResend/listArchived`：返回 `[{ sessionId, cwd, createdAt }]`（`workspaceRegistry.archivedSessionIds` × `sessionQuery.listSessions()` 的 header 元数据；header 无 title 字段，故显示 cwd/创建时间）
2. **client 设置页分区**：注册 `settings.section`（`id: "edit-resend", order: 100, label: "编辑重发"`）→ 设置页左侧出现「编辑重发」导航，内容区列出全部归档会话 + 每行「恢复」按钮；`useWorkspaces` 订阅 `archivedSessionIds`，恢复后列表自动刷新
3. **手动应急恢复**（重启前/无 UI 时）：编辑 `C:\Users\Acer\.dsh\storages\workspace.json`，把 sessionId 从 `archivedSessionIds` 数组移除，重启 dsh web（文件外改不触发广播，必须重启）

**变更记录**：早期版本曾在 fork 会话回合尾部放「恢复原会话」按钮（localStorage fork-map 记录 child→parent），后按用户要求**迁移到设置页集中管理**，回合尾部只保留编辑按钮。

---

## 4. 如何重启验证

1. 关闭 dsh web（桌面图标 / 进程），重新打开（**包移动后必须重启**，见 §3.3 clientPath 缓存说明）
2. 打开任意有已完成回合的会话 → 用户气泡恢复官方蓝色样式，每个回合尾部出现 `✎ 编辑本轮消息并重发`
3. 点 `✎` → 修改文本 → 「保存并重发」→ **停在 fork 分支会话**（不再跳新建会话页）且原会话自动归档、侧边栏消失
4. 设置 → 编辑重发 → 归档列表含原会话 → 点「恢复」→ 原会话回到侧边栏
5. 若报错：把错误信息贴回给 agent，用 `cordis` 插件的诊断修复

---

## 5. ⚠️ 环境依赖（重要）

包通过 `link:` 协议安装到 profile，Node 从包的**物理位置**向上解析依赖。由于包在 `E:\caoTfile\code\dsh\back`，其 `node_modules` 是一个 **junction** 指向 dsh 全局安装：

```
E:\caoTfile\code\dsh\back\node_modules
    → C:\Users\Acer\AppData\Roaming\npm\node_modules\@deepseek-ai\dsh\node_modules
```

**如果移动包目录，必须重建这个 junction**（`mklink /J <pkg>\node_modules <dsh 全局 node_modules>`），否则 `@deepseek-ai/cordis`、`zod` 等依赖解析失败。检查方法：

```powershell
# 应输出 True True
Test-Path "E:\caoTfile\code\dsh\back\node_modules\@deepseek-ai\cordis"
Test-Path "E:\caoTfile\code\dsh\back\node_modules\zod"
```

`node_modules` junction 不应提交到 GitHub（加 `.gitignore`）。

---

## 6. 发布到 GitHub（待办）

包已按可发布结构组织，发布前建议：

1. **补 `README.md`**：功能说明、安装方法（`dsh plugin --profile web add dsh-edit-resend`）、使用截图
2. **补 `LICENSE`**（MIT，与 package.json 一致）
3. **加 `.gitignore`**：忽略 `node_modules/`（junction）
4. **GitHub 仓库加 `dsh-plugin` topic**：这样 `dsh find-plugin` 能搜到
5. **peerDependencies 核对**（当前声明）：
   - `@deepseek-ai/cordis` ^4.0.1
   - `@deepseek-ai/dsh-agent` ^0.1.0-rc.6
   - `@deepseek-ai/dsh-typert-protocol` ^0.1.0-rc.6
   - `zod`（dependencies，^4.4.3）
   - 实际代码还用到 `dsh-agent-presets`、`dsh-session`、`dsh-session-persistence`（通过全局 fallback 解析，未声明）——发布前建议补声明或注明依赖 dsh 安装

### 已知取舍

- Client 半替换了官方 `user` 渲染器（`shadows-shipped-ui` 风险）：图片消息显示 `[图片 ×N]` 占位而非缩略图；编辑重发目前只支持纯文本
- 编辑语义 = 丢弃目标消息所在**整个轮次**（含同轮其他消息）并重发，不是只删单条消息

---

## 7. 相关文件速查

| 路径 | 说明 |
|---|---|
| `E:\caoTfile\code\dsh\back\` | 插件包（当前位置） |
| `E:\caoTfile\code\dsh\back\HANDOFF.md` | 本交接文档 |
| `C:\Users\Acer\.dsh\profiles\web\package.json` | profile 依赖 + bundles 注册 |
| `C:\Users\Acer\.dsh\profiles\web\cordis.patch.yml` | profile 用户补丁层（含 MCP 服务器配置） |
| `C:\Users\Acer\.dsh\profiles\web\cordis.patch.yml.bak2` | 本次改动前备份 |
| `E:\caoTfile\code\dsh-edit-resend` | 旧位置（已迁移，不存在） |
