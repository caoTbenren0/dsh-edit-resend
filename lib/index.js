import { Service } from "@deepseek-ai/cordis";
import { Remote, TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";

/**
 * dsh-edit-resend — host half.
 *
 * Exposes one Remote method `editResend/edit` that re-sends an edited user
 * message: it reads the source session's event log, cuts everything from the
 * target turn's start onwards, creates a child agent/session seeded with the
 * retained prefix, attaches it to the source's workspace, and delivers the
 * edited text as the child's first followup.
 *
 * The client half (`./client.js`) adds an edit-and-resend button to completed
 * turn tails and invokes this Remote through `ctx.remote.editResend.edit`.
 */

class EditResendService extends TypertRemoteService {
	static inject = ["sessions", "sessionQuery", "agents", "workspaceRegistry", "agentDefaultModel", "agentPresets"];

	constructor(ctx) {
		super(ctx, "editResend");
		// Run decorator initializers manually: pure JS has no decorator syntax,
		// so `Remote("edit")` was applied below and its initializer marks the
		// prototype with the invocation descriptor.
		for (const initializer of _instanceInitializers) initializer.call(this);
	}

	/**
	 * Read the user input text of a completed turn (for pre-filling the editor).
	 * @param request - `{ sessionId, turn }`.
	 * @returns `{ ok: true, text }` or `{ ok: false, error }`.
	 */
	async getText(request) {
		if (typeof request !== "object" || request === null) return { ok: false, error: "invalid-args" };
		const { sessionId, turn } = request;
		if (typeof sessionId !== "string" || sessionId === "" || !Number.isSafeInteger(turn) || turn < 0) {
			return { ok: false, error: "invalid-args" };
		}
		const sessions = this.ctx.sessions;
		const sessionQuery = this.ctx.sessionQuery;
		let source;
		if (sessions !== undefined) {
			const live = sessions.get(sessionId);
			if (live !== undefined) source = { events: [...live.events] };
		}
		if (source === undefined && sessionQuery !== undefined) {
			try {
				const snap = await sessionQuery.readSession(sessionId);
				source = { events: snap.events };
			} catch (e) {
				return { ok: false, error: "session-not-found", message: String(e) };
			}
		}
		if (source === undefined) return { ok: false, error: "session-not-found" };
		const events = source.events;
		if (!Array.isArray(events)) return { ok: false, error: "no-events" };

		let inTurn = false;
		for (const e of events) {
			if (!e) continue;
			if (e.type === "turn/start" && e.data && e.data.turn === turn) { inTurn = true; continue; }
			if (e.type === "turn/end" && e.data && e.data.turn === turn) break;
			if (!inTurn) continue;
			if (e.type === "user/message" && e.data && e.data.source && e.data.source.kind === "user") {
				const text = extractPlainText(e.data.content);
				if (text !== "") return { ok: true, text };
			}
		}
		return { ok: false, error: "no-user-message-in-turn" };
	}

	/**
	 * Edit-and-resend implementation.
	 * @param request - `{ sessionId, turn, text }` where `turn` is the target
	 * turn id (the completed turn whose user input to edit).
	 * @returns `{ ok: true, sessionId }` or `{ ok: false, error }`.
	 */
	async edit(request) {
		const sessions = this.ctx.sessions;
		const sessionQuery = this.ctx.sessionQuery;
		const agents = this.ctx.agents;
		if (typeof request !== "object" || request === null) return { ok: false, error: "invalid-args" };
		const { sessionId, turn, text } = request;
		if (typeof sessionId !== "string" || sessionId === "" || !Number.isSafeInteger(turn) || turn < 0 || typeof text !== "string") {
			return { ok: false, error: "invalid-args" };
		}
		if (text.trim() === "") return { ok: false, error: "empty-text" };

		// 1. read source events (live session preferred, then persisted)
		let source;
		if (sessions !== undefined) {
			const live = sessions.get(sessionId);
			if (live !== undefined) source = { id: live.id, header: live.header, events: [...live.events] };
		}
		if (source === undefined && sessionQuery !== undefined) {
			try {
				const snap = await sessionQuery.readSession(sessionId);
				source = { id: snap.meta.id, header: snap.meta, events: snap.events };
			} catch (e) {
				return { ok: false, error: "session-not-found", message: String(e) };
			}
		}
		if (source === undefined) return { ok: false, error: "session-not-found" };
		const events = source.events;
		if (!Array.isArray(events)) return { ok: false, error: "no-events" };

		// 2. locate the target turn's start (the whole turn is discarded on fork)
		let turnStart = -1;
		for (let i = 0; i < events.length; i++) {
			const e = events[i];
			if (e && e.type === "turn/start" && e.data && e.data.turn === turn) {
				turnStart = i;
				break;
			}
		}
		if (turnStart < 0) return { ok: false, error: "turn-not-found" };

		// 3. find the turn's user input: the first src=user message inside the
		//    turn (before its turn/end). Event sourcing: the client projection
		//    may window-truncate history, so we never rely on client-side nodes.
		let messageSeq = -1;
		for (let i = turnStart + 1; i < events.length; i++) {
			const e = events[i];
			if (e && e.type === "turn/end" && e.data && e.data.turn === turn) break;
			if (e && e.type === "user/message" && e.data && e.data.source && e.data.source.kind === "user") {
				messageSeq = e.seq;
				break;
			}
		}
		if (messageSeq < 0) return { ok: false, error: "no-user-message-in-turn" };

		// 4. cut before the turn/start (discard the whole turn: message + replies)
		const seed = events.slice(0, turnStart);

		// 5. default model for the child agent
		let agentOptions = {};
		const agentDefaultModel = this.ctx.agentDefaultModel;
		if (agentDefaultModel !== undefined) {
			try {
				const sel = agentDefaultModel.currentSelection();
				if (sel && typeof sel.provider === "string" && typeof sel.model === "string") agentOptions = { provider: sel.provider, model: sel.model };
			} catch (e) { /* keep empty */ }
		}

		// 5. preset + setup, meta lineage
		const meta = { parentSession: source.id, seedLength: seed.length };
		if (source.header && typeof source.header.cwd === "string") meta.cwd = source.header.cwd;
		let setup;
		const presetId = resolvePresetId(source);
		if (presetId !== undefined) meta.agentPreset = presetId;
		const agentPresets = this.ctx.agentPresets;
		if (agentPresets !== undefined && presetId !== undefined) {
			setup = async (agentCtx) => {
				await agentPresets.mount(agentCtx, presetId);
			};
		}

		// 6. create the child agent (session with cut seed)
		const childId = makeSessionId();
		let handle;
		try {
			handle = await agents.create({ sessionId: childId, seed, meta, agentOptions, setup });
		} catch (e) {
			return { ok: false, error: "create-failed", message: String(e) };
		}

		// 7. attach to the same workspace as the source
		const workspaceRegistry = this.ctx.workspaceRegistry;
		if (workspaceRegistry !== undefined) {
			try {
				const ws = workspaceRegistry.list().find((w) => w.sessionIds.includes(source.id));
				if (ws !== undefined) await ws.attachSession(childId);
			} catch (e) {
				console.error("[dsh-edit-resend] workspace attach failed", e);
			}
		}

		// 8. send the edited text into the child agent (followup = next turn)
		const message = {
			id: makeMessageId(),
			role: "user",
			content: [{ type: "text", text }],
			source: { kind: "user", rpcId: "edit-resend" }
		};
		try {
			handle.agent.followup(message);
		} catch (e) {
			return { ok: false, error: "send-failed", message: String(e), sessionId: childId };
		}

		// 9. archive the source session (view-level only: the event log and its
		//    grouping slot are untouched, so unarchiving restores it later).
		//    Best-effort: a failure must never fail the resend itself.
		if (workspaceRegistry !== undefined) {
			try {
				await workspaceRegistry.archiveSession(source.id);
			} catch (e) {
				console.error("[dsh-edit-resend] archive source session failed", e);
			}
		}

		return { ok: true, sessionId: childId };
	}
}

/** The preset a session actually runs: newest `agent-preset/selected` wins. */
function resolvePresetId(source) {
	const events = source.events;
	for (let i = events.length - 1; i >= 0; i--) {
		const e = events[i];
		if (e && e.type === "agent-preset/selected" && e.data && typeof e.data.agentPreset === "string") return e.data.agentPreset;
	}
	const hp = source.header && source.header.agentPreset;
	return typeof hp === "string" ? hp : undefined;
}

/** Extract plain text from a user/message content block list. */
function extractPlainText(content) {
	if (!Array.isArray(content)) return "";
	return content.filter((b) => b && b.type === "text" && typeof b.text === "string").map((b) => b.text).join("");
}

function makeMessageId() {
	return `msg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function makeSessionId() {
	return `session-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

// Apply the Remote decorator manually (pure JS equivalent of `@Remote("edit")`).
// The decorator's initializer runs per-instance and marks the prototype, so the
// gateway discovers `edit` as the `editResend/edit` endpoint.
const _instanceInitializers = [];
for (const [methodName, endpointName] of [["edit", "edit"], ["getText", "getText"]]) {
	Remote(endpointName)(EditResendService.prototype[methodName], {
		kind: "method",
		name: methodName,
		static: false,
		private: false,
		access: {
			has: (obj) => methodName in obj,
			get: (obj) => obj[methodName]
		},
		addInitializer(fn) {
			_instanceInitializers.push(fn);
		}
	});
}

export { EditResendService };
export default EditResendService;
