window.__ModuleLoader__.load({
	id: "dsh-edit-resend",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");

		// ── Client Remote contribution for `editResend/edit` + `editResend/getText` ──
		// The client gateway only requires `codec.mode === "strict"` and calls
		// `codec.schema.parse(value)`; a passthrough schema keeps this bundle
		// free of a zod dependency (the Host half still validates with real zod).
		const passthrough = { parse: (value) => value };
		const editDescriptor = {
			id: "dsh-edit-resend#editResend/edit",
			service: "editResend",
			namespace: "editResend",
			method: "edit",
			invocation: { kind: "direct" },
			parameters: [
				{
					name: "request",
					wire: "request",
					source: "json",
					codec: {
						mode: "strict",
						typeSymbol: "dsh-edit-resend/types#EditResendRequest",
						schema: passthrough,
					},
				},
			],
			result: {
				mode: "strict",
				typeSymbol: "dsh-edit-resend/types#EditResendResult",
				schema: passthrough,
			},
			sourceLocation: { "file": "lib/index.js", "line": 47, "column": 2 },
		};
		const getTextDescriptor = {
			id: "dsh-edit-resend#editResend/getText",
			service: "editResend",
			namespace: "editResend",
			method: "getText",
			invocation: { kind: "direct" },
			parameters: [
				{
					name: "request",
					wire: "request",
					source: "json",
					codec: {
						mode: "strict",
						typeSymbol: "dsh-edit-resend/types#EditResendGetTextRequest",
						schema: passthrough,
					},
				},
			],
			result: {
				mode: "strict",
				typeSymbol: "dsh-edit-resend/types#EditResendGetTextResult",
				schema: passthrough,
			},
			sourceLocation: { "file": "lib/index.js", "line": 47, "column": 2 },
		};
		const unarchiveDescriptor = {
			id: "dsh-edit-resend#editResend/unarchive",
			service: "editResend",
			namespace: "editResend",
			method: "unarchive",
			invocation: { kind: "direct" },
			parameters: [
				{
					name: "request",
					wire: "request",
					source: "json",
					codec: {
						mode: "strict",
						typeSymbol: "dsh-edit-resend/types#EditResendUnarchiveRequest",
						schema: passthrough,
					},
				},
			],
			result: {
				mode: "strict",
				typeSymbol: "dsh-edit-resend/types#EditResendUnarchiveResult",
				schema: passthrough,
			},
			sourceLocation: { "file": "lib/index.js", "line": 47, "column": 2 },
		};
		const contribution = {
			package: "dsh-edit-resend",
			descriptors: [editDescriptor, getTextDescriptor, unarchiveDescriptor],
		};

		// ── Fork bookkeeping for the "restore original session" entry ──────
		// Every successful edit-resend records childId → parentId in
		// localStorage; the fork's turn tails then offer a one-click restore
		// (the official UI has no unarchive action).
		const FORK_MAP_KEY = "dsh-edit-resend:fork-map";
		function rememberFork(childId, parentId) {
			try {
				let map = {};
				try { map = JSON.parse(localStorage.getItem(FORK_MAP_KEY) || "{}"); } catch (e) {}
				map[childId] = parentId;
				localStorage.setItem(FORK_MAP_KEY, JSON.stringify(map));
			} catch (e) { /* storage unavailable: restore entry simply won't show */ }
		}
		function forkParentOf(sessionId) {
			try {
				const map = JSON.parse(localStorage.getItem(FORK_MAP_KEY) || "{}");
				return map[sessionId] || null;
			} catch (e) { return null; }
		}

		// ── Styles ─────────────────────────────────────────────────────────
		// Additive turn-tail entry styles only: a small ghost button plus the
		// inline editor panel. The user bubble itself stays the official one.
		const CSS = `
			.er-tail{display:flex;flex-direction:column;align-items:flex-start;gap:6px;margin-left:-4px}
			.er-tailRow{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
			.er-tailButton{display:inline-flex;align-items:center;gap:4px;border:none;background:transparent;color:var(--dsw-alias-label-tertiary);cursor:pointer;font-size:12px;line-height:20px;padding:2px 8px;border-radius:6px}
			.er-tailButton:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}
			.er-tailButton:disabled{opacity:.6;cursor:default}
			.er-ok{color:var(--dsw-alias-state-success-primary,var(--dsw-alias-label-tertiary));font-size:12px;line-height:20px}
			.er-tailPanel{box-sizing:border-box;width:min(480px,80vw)}
			.er-editor{box-sizing:border-box;width:100%;min-height:96px;resize:vertical;border-radius:12px;padding:8px 12px;font:inherit;font-size:15px;line-height:22px;color:var(--dsw-alias-label-primary);background:var(--dsw-specific-input-major);border:1px solid var(--dsw-alias-border-l1)}
			.er-editor:focus{outline:none;border-color:var(--dsw-alias-accent-strong,var(--dsw-alias-interactive-accent,#4f8cff))}
			.er-bar{display:flex;gap:8px;margin-top:6px;align-items:center}
			.er-primary{padding:4px 14px;border:none;border-radius:8px;background:var(--dsw-alias-interactive-accent,#4f8cff);color:#fff;cursor:pointer;font-size:13px}
			.er-primary:disabled{opacity:.6;cursor:default}
			.er-ghost{padding:4px 14px;border:none;border-radius:8px;background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary);cursor:pointer;font-size:13px}
			.er-ghost:disabled{opacity:.6;cursor:default}
			.er-error{color:var(--dsw-alias-state-error-primary);font-size:12px;line-height:18px}
		`;

		/**
		 * Additive "编辑本轮消息并重发" entry on the `conversation.chat.turnTail`
		 * chain slot — no shadowing, no renderer replacement, official user
		 * bubble untouched. The turn owner supplies the completed turn's id;
		 * clicking the button asks the Host `editResend/getText` Remote for the
		 * turn's user input text (the Host reads the FULL event log — the client
		 * projection can window-truncate history, so node lookups are unreliable
		 * for long sessions), then saving calls `editResend/edit` (forks a child
		 * session) and opens the fork.
		 */
		function makeEditResendTurnTail(ctx) {
			return function EditResendTurnTail(props) {
				const turn = props.turn;
				const sessionId = props.sessionId;
				const turnId = turn && turn.turn;
				const parentId = sessionId ? forkParentOf(sessionId) : null;
				const [editing, setEditing] = react.useState(false);
				const [draft, setDraft] = react.useState("");
				const [busy, setBusy] = react.useState(false);
				const [error, setError] = react.useState(null);
				const [restoring, setRestoring] = react.useState(false);
				const [restored, setRestored] = react.useState(false);

				const startEdit = async () => {
					if (turnId === undefined || busy) return;
					setBusy(true);
					setError(null);
					try {
						// This plugin mounts its OWN Remote contribution (the official
						// assembly only mounts first-party remotes), so it cannot
						// inject "remote.editResend": the loader would wait for the
						// namespace service that only this plugin's apply() creates
						// (deadlock: "pending, waiting for service remote.editResend").
						// Instead, resolve the namespace dynamically after $mount.
						const editResend = ctx.get("remote.editResend");
						if (editResend === undefined) throw new Error("remote.editResend unavailable");
						const result = await editResend.getText({ sessionId, turn: turnId });
						// The gateway unwraps RPC success into { ok: true, value: <host result> };
						// host failures surface as value.ok === false. Handle both shapes.
						const outcome = result && typeof result === "object" && result.value !== void 0 ? result.value : result;
						if (outcome && outcome.ok && typeof outcome.text === "string") {
							setDraft(outcome.text);
							setEditing(true);
						} else {
							setError(outcome && outcome.error ? String(outcome.error) : "读取消息失败");
						}
					} catch (e) {
						setError(String(e));
					} finally {
						setBusy(false);
					}
				};
				const cancel = () => {
					setEditing(false);
					setError(null);
				};
				const restore = async () => {
					if (parentId === null || restoring || busy) return;
					setRestoring(true);
					setError(null);
					try {
						const editResend = ctx.get("remote.editResend");
						if (editResend === undefined) throw new Error("remote.editResend unavailable");
						const result = await editResend.unarchive({ sessionId: parentId });
						const outcome = result && typeof result === "object" && result.value !== void 0 ? result.value : result;
						if (outcome && outcome.ok) {
							setRestored(true);
						} else {
							setError(outcome && outcome.error ? String(outcome.error) : "恢复失败");
						}
					} catch (e) {
						setError(String(e));
					} finally {
						setRestoring(false);
					}
				};
				const save = async () => {
					if (turnId === undefined || busy) return;
					if (draft.trim() === "") {
						setError("消息不能为空");
						return;
					}
					setBusy(true);
					setError(null);
					try {
						const editResend = ctx.get("remote.editResend");
						if (editResend === undefined) throw new Error("remote.editResend unavailable");
						const result = await editResend.edit({ sessionId, turn: turnId, text: draft });
						const outcome = result && typeof result === "object" && result.value !== void 0 ? result.value : result;
						if (outcome && outcome.ok && typeof outcome.sessionId === "string") {
							rememberFork(outcome.sessionId, sessionId);
							const sessionsSvc = ctx.get("sessions");
							if (sessionsSvc !== undefined) sessionsSvc.open(outcome.sessionId);
							setEditing(false);
						} else {
							setError(outcome && outcome.error ? String(outcome.error) : "重发失败");
						}
					} catch (e) {
						setError(String(e));
					} finally {
						setBusy(false);
					}
				};

				if (turnId === undefined) return null;

				// Forked sessions (created by a previous edit-resend) offer a
				// restore entry for the archived original session.
				const restoreEntry = parentId !== null && !restored
					? react.createElement("button", {
						className: "er-tailButton",
						type: "button",
						title: "恢复被归档的原会话（取消归档）",
						onClick: restore,
						disabled: restoring || busy
					}, restoring ? "恢复中…" : "↩ 恢复原会话")
					: null;

				if (editing) {
					return react.createElement("div", { className: "er-tail" },
						react.createElement("div", { className: "er-tailPanel" },
							react.createElement("textarea", {
								className: "er-editor",
								value: draft,
								onChange: (e) => setDraft(e.target.value),
								autoFocus: true
							}),
							error !== null && react.createElement("div", { className: "er-error" }, error),
							react.createElement("div", { className: "er-bar" },
								react.createElement("button", { className: "er-primary", onClick: save, disabled: busy }, busy ? "发送中…" : "保存并重发"),
								react.createElement("button", { className: "er-ghost", onClick: cancel, disabled: busy }, "取消")
							)
						)
					);
				}

				return react.createElement("div", { className: "er-tail" },
					react.createElement("div", { className: "er-tailRow" },
						react.createElement("button", {
							className: "er-tailButton",
							type: "button",
							title: "编辑本轮用户消息并重新发送（fork 新分支）",
							onClick: startEdit,
							disabled: busy
						}, busy ? "读取中…" : "✎ 编辑本轮消息并重发"),
						restoreEntry,
						restored && react.createElement("span", { className: "er-ok" }, "已恢复原会话（可在侧边栏找到）")
					),
					error !== null && !editing && react.createElement("div", { className: "er-error" }, error)
				);
			};
		}

		const inject = ["slots", "remote", "typert", "sessions"];
		async function apply(ctx) {
			// Inject our stylesheet. Plain UMD client bundles must add their own
			// <style> tag (the shell only auto-injects style tags emitted by the
			// module graph); the tag mirrors the official data-plugin-css pattern
			// so claimStyles/HMR bookkeeping can attribute it to this plugin.
			if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=\"dsh-edit-resend\"]") === null) {
				const tag = document.createElement("style");
				tag.dataset.plugin = "dsh-edit-resend";
				tag.dataset.pluginCss = "dsh-edit-resend";
				tag.textContent = CSS;
				document.head.appendChild(tag);
			}
			// Mount our own Remote contribution (third-party packages must mount
			// themselves; the official assembly only mounts first-party remotes).
			const remote = ctx.get("remote");
			if (remote !== undefined) {
				const disposeMount = await remote.$mount(contribution);
				ctx.effect(() => disposeMount, "edit-resend: remote mount");
			}
			// Additive turn-tail entry. Chain slots never shadow: every entry
			// whose `select` returns non-null renders in sequence, so this is a
			// pure addition beside the official tail actions.
			const slots = ctx.get("slots");
			if (slots !== undefined) {
				slots.inject("conversation.chat.turnTail", () => slots.register(
					{ name: "conversation.chat.turnTail", select: () => true },
					makeEditResendTurnTail(ctx)
				));
			}
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	},
});
