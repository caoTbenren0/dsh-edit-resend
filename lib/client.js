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
		const listArchivedDescriptor = {
			id: "dsh-edit-resend#editResend/listArchived",
			service: "editResend",
			namespace: "editResend",
			method: "listArchived",
			invocation: { kind: "direct" },
			parameters: [],
			result: {
				mode: "strict",
				typeSymbol: "dsh-edit-resend/types#EditResendListArchivedResult",
				schema: passthrough,
			},
			sourceLocation: { "file": "lib/index.js", "line": 47, "column": 2 },
		};
		const archiveDescriptor = {
			id: "dsh-edit-resend#editResend/archive",
			service: "editResend",
			namespace: "editResend",
			method: "archive",
			invocation: { kind: "direct" },
			parameters: [
				{
					name: "request",
					wire: "request",
					source: "json",
					codec: {
						mode: "strict",
						typeSymbol: "dsh-edit-resend/types#EditResendArchiveRequest",
						schema: passthrough,
					},
				},
			],
			result: {
				mode: "strict",
				typeSymbol: "dsh-edit-resend/types#EditResendArchiveResult",
				schema: passthrough,
			},
			sourceLocation: { "file": "lib/index.js", "line": 47, "column": 2 },
		};
		const contribution = {
			package: "dsh-edit-resend",
			descriptors: [editDescriptor, getTextDescriptor, unarchiveDescriptor, listArchivedDescriptor, archiveDescriptor],
		};

		// ── Styles ─────────────────────────────────────────────────────────
		// Additive turn-tail entry styles only: a small ghost button plus the
		// inline editor panel. The user bubble itself stays the official one.
		const CSS = `
			.er-tail{display:flex;flex-direction:column;align-items:flex-start;gap:6px;margin-left:-4px}
			.er-tailButton{display:inline-flex;align-items:center;gap:4px;border:none;background:transparent;color:var(--dsw-alias-label-tertiary);cursor:pointer;font-size:12px;line-height:20px;padding:2px 8px;border-radius:6px}
			.er-tailButton:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}
			.er-tailButton:disabled{opacity:.6;cursor:default}
			.er-settings{display:flex;flex-direction:column;gap:10px;max-width:640px}
			.er-settingsHint{color:var(--dsw-alias-label-secondary);font-size:13px;line-height:20px;margin:0}
			.er-settingsEmpty{color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:20px;margin:0}
			.er-settingsRow{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-module-platform)}
			.er-settingsMeta{display:flex;flex-direction:column;gap:2px;min-width:0}
			.er-settingsTitle{color:var(--dsw-alias-label-primary);font-size:13px;line-height:20px;word-break:break-all}
			.er-settingsSub{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px;word-break:break-all}
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
				const [editing, setEditing] = react.useState(false);
				const [draft, setDraft] = react.useState("");
				const [busy, setBusy] = react.useState(false);
				const [error, setError] = react.useState(null);

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
							// Open the fork FIRST, then archive the source. If the
							// source were archived while still current, the client
							// projection clears a current session that became
							// archived — the user would be thrown to the new-session
							// page instead of the fork. `sessions.open` is
							// synchronous, so after it returns the current session
							// is already the fork and the archive broadcast can no
							// longer clear anything.
							const sessionsSvc = ctx.get("sessions");
							let opened = false;
							if (sessionsSvc !== undefined) {
								try {
									sessionsSvc.open(outcome.sessionId);
									opened = true;
								} catch (openErr) {
									// The fork may not be in the client's session
									// list yet (its creation broadcast can trail the
									// RPC response). Retry shortly after.
									console.warn("[dsh-edit-resend] open fork failed, will retry", openErr);
								}
							}
							try {
								await editResend.archive({ sessionId });
							} catch (archiveErr) {
								console.warn("[dsh-edit-resend] archive source failed", archiveErr);
							}
							if (!opened) {
								setTimeout(() => {
									try {
										if (sessionsSvc !== undefined) sessionsSvc.open(outcome.sessionId);
									} catch (e) {
										console.warn("[dsh-edit-resend] open fork retry failed", e);
									}
								}, 600);
							}
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
					react.createElement("button", {
						className: "er-tailButton",
						type: "button",
						title: "编辑本轮用户消息并重新发送（fork 新分支）",
						onClick: startEdit,
						disabled: busy
					}, busy ? "读取中…" : "✎ 编辑本轮消息并重发"),
					error !== null && react.createElement("div", { className: "er-error" }, error)
				);
			};
		}

		/**
		 * Settings-page section "编辑重发": lists archived sessions (created by
		 * edit-resend auto-archive) with a one-click restore button each. The
		 * official UI has no unarchive action; the Host `unarchive` Remote
		 * updates the workspace registry state, and the archived-sessions-
		 * changed broadcast refreshes the sidebar automatically.
		 */
		function makeArchivedSessionsSection(ctx) {
			return function ArchivedSessionsSection(props) {
				const archivedIds = props.useWorkspaces((state) => state.archivedSessionIds);
				const [items, setItems] = react.useState(null);
				const [busyId, setBusyId] = react.useState(null);
				const [error, setError] = react.useState(null);

				react.useEffect(() => {
					let cancelled = false;
					(async () => {
						try {
							const er = ctx.get("remote.editResend");
							if (er === undefined) throw new Error("remote.editResend unavailable");
							const result = await er.listArchived();
							const outcome = result && typeof result === "object" && result.value !== void 0 ? result.value : result;
							if (cancelled) return;
							if (outcome && outcome.ok) {
								setItems(outcome.items || []);
								setError(null);
							} else {
								setItems([]);
								setError(outcome && outcome.error ? String(outcome.error) : "读取失败");
							}
						} catch (e) {
							if (!cancelled) setError(String(e));
						}
					})();
					return () => { cancelled = true; };
				}, [archivedIds]);

				const restore = async (sessionId) => {
					if (busyId !== null) return;
					setBusyId(sessionId);
					setError(null);
					try {
						const er = ctx.get("remote.editResend");
						if (er === undefined) throw new Error("remote.editResend unavailable");
						const result = await er.unarchive({ sessionId });
						const outcome = result && typeof result === "object" && result.value !== void 0 ? result.value : result;
						if (!outcome || !outcome.ok) setError(outcome && outcome.error ? String(outcome.error) : "恢复失败");
					} catch (e) {
						setError(String(e));
					} finally {
						setBusyId(null);
					}
				};

				return react.createElement("div", { className: "er-settings" },
					react.createElement("p", { className: "er-settingsHint" },
						"编辑重发会自动归档原会话（事件日志与数据完整保留）。在这里可以恢复被归档的会话，恢复后它会回到原来的侧边栏分组。"),
					items === null
						? react.createElement("p", { className: "er-settingsEmpty" }, "加载中…")
						: items.length === 0
							? react.createElement("p", { className: "er-settingsEmpty" }, "当前没有归档的会话")
							: items.map((it) => react.createElement("div", { className: "er-settingsRow", key: it.sessionId },
								react.createElement("div", { className: "er-settingsMeta" },
									react.createElement("div", { className: "er-settingsTitle" }, it.cwd || "（无工作目录）"),
									react.createElement("div", { className: "er-settingsSub" },
										it.sessionId + (it.createdAt ? " · " + new Date(it.createdAt).toLocaleString() : ""))
								),
								react.createElement("button", {
									className: "er-primary",
									type: "button",
									onClick: () => restore(it.sessionId),
									disabled: busyId !== null
								}, busyId === it.sessionId ? "恢复中…" : "恢复")
							)),
					error !== null && react.createElement("div", { className: "er-error" }, error)
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
			// Additive turn-tail entry: the edit-and-resend button on every
			// completed turn.
			const slots = ctx.get("slots");
			if (slots !== undefined) {
				slots.inject("conversation.chat.turnTail", () => slots.register(
					{ name: "conversation.chat.turnTail", select: () => true },
					makeEditResendTurnTail(ctx)
				));
				// Settings-page section: restore archived sessions (the official
				// UI has no unarchive action).
				slots.inject("settings.section", () => slots.register(
					{
						name: "settings.section",
						id: "edit-resend",
						order: 100,
						label: () => "编辑重发"
					},
					makeArchivedSessionsSection(ctx)
				));
			}
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	},
});
