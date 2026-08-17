# dsh-edit-resend

> 编辑已发送的用户消息并重新发送 —— 从该消息所在回合 fork 出一个新分支，用编辑后的文本重新生成回复。原会话自动归档，可在设置页一键恢复。
>
> Edit a sent user message and resend it: fork a new branch from that message's turn and regenerate the reply with the edited text. The original session is archived automatically and can be restored from the Settings page.

[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

A [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/dsh) plugin for 0.1.0-rc.6 that adds edit-and-resend to any completed turn, built on the cordis plugin system and the Typert Remote protocol.

---

## ✨ 功能特性 / Features

- **回合尾部编辑入口** — 每个已完成回合的尾部出现 `✎ 编辑本轮消息并重发` 按钮（不替换官方 UI，纯增量注入）<br/>*Edit entry on every completed turn tail — an additive ghost button, the official bubble stays untouched.*
- **读取该轮用户原文** — 从 Host 的**全量事件日志**定位该轮的用户消息（客户端投影会截断长会话历史，因此不在客户端查节点）<br/>*Reads the turn's original user text from the Host's **full event log** (the client projection window-truncates long sessions, so nodes are never looked up client-side).*
- **Fork 重发** — 以目标回合起点为界切割事件日志作为种子，创建子会话并发送编辑后的文本；历史不可改写，只 fork 新分支<br/>*Forks a child session seeded with the event-log prefix before the target turn, then delivers the edited text as the first followup; history is immutable, so the reply is regenerated on a new branch.*
- **自动归档原会话** — 重发成功后原会话自动归档（仅视图隐藏，日志与数据绝不删除）<br/>*The source session is archived automatically after a successful resend — view-level hiding only, no data is ever deleted.*
- **设置页恢复** — 设置页新增「编辑重发」分区，列出全部归档会话，一键恢复回侧边栏（官方 rc.6 没有 unarchive API，本插件补齐）<br/>*A new "编辑重发" section in Settings lists every archived session with a one-click restore (official rc.6 has no unarchive API — this plugin fills the gap).*

## 🚀 安装 / Installation

> 以 `web` profile 为例，其他 profile 同理。要求 **DSH ≥ 0.1.0-rc.6**。
> *Example uses the `web` profile; others work the same. Requires DSH ≥ 0.1.0-rc.6.*

```bash
# 1. 安装插件（发布包或本地路径均可）
#    Install the plugin (published package or a local path both work)
dsh plugin --profile web add dsh-edit-resend

# 2. 把 cordis.patch.yml 中的 insert 行并入 profile 的 cordis.patch.yml
#    Merge the insert line from cordis.patch.yml into the profile's cordis.patch.yml
#    - id: edit-resend
#      name: 'dsh-edit-resend'
```

```powershell
# 3. 重启 dsh web（Host 端改动必须重启；之后客户端改动只需刷新页面）
#    Restart dsh web (host-side changes require a restart; client-only changes
#    are picked up by a page refresh, the bundle is served with no-cache)
```

### 手动配置 / Manual configuration

将以下内容加入 profile 的 `package.json` 与 `cordis.patch.yml`：

```jsonc
// profiles/<name>/package.json
{
  "dependencies": {
    "dsh-edit-resend": "link:/absolute/path/to/dsh-edit-resend"
  },
  "bundles": {
    "dsh-edit-resend": "dsh-edit-resend"
  }
}
```

```yaml
# profiles/<name>/cordis.patch.yml
- insert:
    - id: edit-resend
      name: 'dsh-edit-resend'
```

## 📖 使用 / Usage

1. 打开任意有已完成回合的会话 → 回合尾部点击 `✎ 编辑本轮消息并重发`<br/>*Open any session with completed turns → click `✎ 编辑本轮消息并重发` on the turn tail.*
2. 编辑器会预填该轮的用户原文，修改后点击「保存并重发」<br/>*The editor is pre-filled with the turn's original user text; edit it and click 「保存并重发」.*
3. 界面自动切换到新 fork 分支并开始重新生成；原会话从侧边栏消失（已归档）<br/>*The UI jumps to the new fork automatically; the source session disappears from the sidebar (archived).*
4. 需要找回原会话：**设置 → 编辑重发** → 找到对应会话 → 「恢复」<br/>*To bring a session back: **Settings → 编辑重发** → find the session → 「恢复」.*

> 归档绝不删除数据：恢复后原会话回到原位置，日志完整保留。
> *Archiving never deletes data: a restored session returns to its original place with its full log intact.*

## 🧩 工作原理 / How it works

| 层 | 机制 |
|---|---|
| **Host 端** | `EditResendService`（cordis 服务，继承 `TypertRemoteService`）暴露 5 个 Remote 端点：`edit` / `getText` / `archive` / `unarchive` / `listArchived`。`edit` 从**完整事件日志**定位目标回合的 `turn/start`，切割出前缀作为 seed 调用 `agents.create` 创建子会话，attach 到原工作区，再以编辑后的文本触发 followup |
| **Client 端** | UMD bundle 注入两个 slot：`conversation.chat.turnTail`（链式，编辑按钮）与 `settings.section`（归档恢复列表）；通过 `remote.editResend.*` 调用 Host（第三方插件需自行 `$mount` Remote 贡献） |
| **归档竞态** | 归档广播会清空"当前被归档的会话"，因此 client 先同步打开 fork、**再**归档原会话——归档到达时当前会话已是 fork，清空规则永不触发（详见 HANDOFF.md §3.5） |

| Layer | Mechanism |
|---|---|
| **Host** | `EditResendService` (a cordis service extending `TypertRemoteService`) exposes 5 Remote endpoints: `edit` / `getText` / `archive` / `unarchive` / `listArchived`. `edit` locates the target turn's `turn/start` in the **full event log**, seeds a child session with the retained prefix via `agents.create`, attaches it to the source workspace, and delivers the edited text as a followup |
| **Client** | A UMD bundle injects two slots: `conversation.chat.turnTail` (chain slot, edit button) and `settings.section` (archived-session restore list), calling the Host through `remote.editResend.*` (third-party plugins must `$mount` their own Remote contribution) |
| **Archive race** | The archive broadcast clears a *current* session that became archived, so the client opens the fork first and only then archives the source — by the time the broadcast lands, the current session is already the fork (details in HANDOFF.md §3.5) |

## 📁 文件结构 / File layout

```
dsh-edit-resend/
├── lib/
│   ├── index.js          # Host 半：EditResendService（5 个 Remote 端点） / Host half
│   ├── client.js         # Client 半：UMD bundle（按钮 + 设置页） / Client half
│   ├── typert.host.js    # Host Typert 清单（schema + invocation + model）
│   └── typert.remote.js  # Client Remote 描述符 / descriptors
├── cordis.patch.yml      # bundle patch 声明
├── package.json
└── HANDOFF.md            # 开发记录与 root-cause 分析 / dev log & root-cause analyses
```

## 🔧 兼容性 / Compatibility

- DSH `0.1.0-rc.6`（web profile 验证）
- peerDependencies：`@deepseek-ai/cordis ^4.0.1`、`@deepseek-ai/dsh-agent ^0.1.0-rc.6`、`@deepseek-ai/dsh-typert-protocol ^0.1.0-rc.6`
- 官方 rc.6 无 unarchive API/UI：设置页恢复由本插件实现（`workspaceRegistry.setState` + `host/archived-sessions-changed` 广播）

## 📄 License

[MIT](LICENSE) — 请同时参考 [DeepSeek Harness](https://github.com/deepseek-ai/dsh) 的许可条款。
*See also the DeepSeek Harness license terms.*
