/**
 * dsh-edit-resend — Host Typert manifest types.
 *
 * Shape of the default export of `lib/typert.host.js` (the hand-maintained
 * Typert manifest consumed by the DSH Typert toolchain).
 */
export interface TypertSchemaEntry {
	readonly name: string;
	readonly schema: unknown;
}

export interface TypertInvocationParameter {
	readonly name: string;
	readonly wire: string;
	readonly source: string;
	readonly codec: {
		readonly mode: string;
		readonly typeSymbol: string;
		readonly schema: unknown;
	};
}

export interface TypertInvocation {
	readonly id: string;
	readonly service: string;
	readonly namespace: string;
	readonly method: string;
	readonly invocation: { readonly kind: string };
	readonly parameters: readonly TypertInvocationParameter[];
	readonly result: {
		readonly mode: string;
		readonly typeSymbol: string;
		readonly schema: unknown;
	};
	readonly sourceLocation: { readonly file: string; readonly line: number; readonly column: number };
}

export interface TypertModelMember {
	readonly kind: string;
	readonly name: string;
	readonly signature: string;
	readonly summary: string;
	readonly jsDoc: string;
}

export interface TypertModelType {
	readonly name: string;
	readonly declaration: string;
}

export interface TypertModelService {
	readonly description: string;
	readonly summary: string;
	readonly tags: readonly unknown[];
	readonly jsDoc: string;
	readonly key: string;
	readonly exportName: string;
	readonly members: readonly TypertModelMember[];
	readonly types: readonly TypertModelType[];
}

export interface TypertHostManifest {
	readonly package: "dsh-edit-resend";
	readonly face: "host";
	readonly schemas: readonly TypertSchemaEntry[];
	readonly invocations: readonly TypertInvocation[];
	readonly model: {
		readonly services: readonly TypertModelService[];
		readonly events: readonly unknown[];
		readonly objects: readonly unknown[];
	};
}

export declare const TYPERT: TypertHostManifest;
export default TYPERT;
