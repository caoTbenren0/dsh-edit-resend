/**
 * dsh-edit-resend — Client Remote contribution types.
 *
 * Shape of the default export of `lib/typert.remote.js` (the hand-maintained
 * client-side Typert Remote contribution consumed by the DSH Typert
 * toolchain).
 */
export interface TypertRemoteCodec {
	readonly mode: string;
	readonly typeSymbol: string;
	readonly schema: unknown;
}

export interface TypertRemoteParameter {
	readonly name: string;
	readonly wire: string;
	readonly source: string;
	readonly codec: TypertRemoteCodec;
}

export interface TypertRemoteResult {
	readonly mode: string;
	readonly typeSymbol: string;
	readonly schema: unknown;
}

export interface TypertRemoteDescriptor {
	readonly id: string;
	readonly service: string;
	readonly namespace: string;
	readonly method: string;
	readonly invocation: { readonly kind: string };
	readonly parameters: readonly TypertRemoteParameter[];
	readonly result: TypertRemoteResult;
	readonly sourceLocation: { readonly file: string; readonly line: number; readonly column: number };
}

export interface TypertRemoteManifest {
	readonly package: "dsh-edit-resend";
	readonly descriptors: readonly TypertRemoteDescriptor[];
}

export declare const TYPERT_REMOTE: TypertRemoteManifest;
export default TYPERT_REMOTE;
