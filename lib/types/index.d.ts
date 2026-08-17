/**
 * dsh-edit-resend — Host entry types.
 *
 * Mirrors `EditResendService` in `lib/index.js` (a TypertRemoteService whose
 * methods are exposed over the Typert Remote protocol) plus the request/result
 * payload shapes defined in the Typert manifest (`lib/typert.host.js`).
 */
import type { TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";

/** `editResend/edit` — re-send an edited user message by forking a child session from its turn. */
export interface EditResendRequest {
	readonly sessionId: string;
	readonly turn: number;
	readonly text: string;
}

export type EditResendResult =
	| { readonly ok: true; readonly sessionId: string }
	| { readonly ok: false; readonly error: string; readonly message?: string; readonly sessionId?: string };

/** `editResend/getText` — read the user input text of a completed turn. */
export interface EditResendGetTextRequest {
	readonly sessionId: string;
	readonly turn: number;
}

export type EditResendGetTextResult =
	| { readonly ok: true; readonly text: string }
	| { readonly ok: false; readonly error: string; readonly message?: string };

/** `editResend/archive` — archive a session (hide it from grouping/search). */
export interface EditResendArchiveRequest {
	readonly sessionId: string;
}

export type EditResendArchiveResult =
	| { readonly ok: true }
	| { readonly ok: false; readonly error: string; readonly message?: string };

/** `editResend/unarchive` — restore an archived session to its grouping surfaces. */
export interface EditResendUnarchiveRequest {
	readonly sessionId: string;
}

export type EditResendUnarchiveResult =
	| { readonly ok: true }
	| { readonly ok: false; readonly error: string; readonly message?: string };

/** `editResend/listArchived` — archived sessions with identifying metadata. */
export interface EditResendArchivedItem {
	readonly sessionId: string;
	readonly cwd: string | null;
	readonly createdAt: number | null;
}

export type EditResendListArchivedResult =
	| { readonly ok: true; readonly items: readonly EditResendArchivedItem[] }
	| { readonly ok: false; readonly error: string; readonly message?: string };

/**
 * Host half of dsh-edit-resend. Exposed over Typert as the `editResend`
 * Remote service (`ctx.remote.editResend.*` on the client side).
 */
export declare class EditResendService extends TypertRemoteService {
	static inject: readonly string[];

	edit(request: EditResendRequest): Promise<EditResendResult>;
	getText(request: EditResendGetTextRequest): Promise<EditResendGetTextResult>;
	archive(request: EditResendArchiveRequest): Promise<EditResendArchiveResult>;
	unarchive(request: EditResendUnarchiveRequest): Promise<EditResendUnarchiveResult>;
	listArchived(): Promise<EditResendListArchivedResult>;
}

export default EditResendService;
