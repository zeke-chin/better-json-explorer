import * as vscode from 'vscode';
import { Node, parseTree } from 'jsonc-parser';
import { pythonReprToJson } from './inputRepair/pythonRepr';
import { escapeQuotedLineBreaks } from './inputRepair/quotedLineBreaks';

export type SourceKind = 'json' | 'python';

export type JsonFormatResult = {
	formatted: string;
	sourceKind: 'json' | 'json_str' | 'json_repaired' | 'python_str';
};

export type NestedJsonHit = {
	range: vscode.Range;
	parsedText: string;
	keyPath: string;
	sourceKind: SourceKind;
};

export type RawNestedJsonHit = {
	offset: number;
	length: number;
	parsedText: string;
	keyPath: string;
	sourceKind: SourceKind;
};

export type StringValueHit = {
	range: vscode.Range;
	keyPath: string;
	rawValue: string;
	parsedText?: string;
	sourceKind: SourceKind;
};

export type RawStringValueHit = {
	offset: number;
	length: number;
	keyPath: string;
	rawValue: string;
	parsedText?: string;
	sourceKind: SourceKind;
};

export type StructuredUnwrap = {
	value: Record<string, unknown> | unknown[];
	sourceKind: SourceKind;
};

const UNWRAP_DEPTH = 4;

export function isJsonContainer(value: unknown): value is Record<string, unknown> | unknown[] {
	return value !== null && typeof value === 'object';
}

export function tryUnwrapJsonString(raw: string): Record<string, unknown> | unknown[] | undefined {
	let candidate = raw.trim();
	if (candidate.length === 0) {
		return undefined;
	}

	for (let depth = 0; depth < UNWRAP_DEPTH; depth++) {
		let parsed: unknown;
		try {
			parsed = JSON.parse(candidate);
		} catch {
			return undefined;
		}

		if (isJsonContainer(parsed)) {
			return parsed;
		}

		if (typeof parsed !== 'string') {
			return undefined;
		}

		const next = parsed.trim();
		if (next.length === 0 || next === candidate) {
			return undefined;
		}
		candidate = next;
	}

	return undefined;
}

/**
 * Try to unwrap a string as either a JSON container (with up to 4 levels of
 * string-wrapping) or a Python repr literal. Returns the parsed container
 * along with which source form succeeded.
 */
export function tryUnwrapStructured(raw: string): StructuredUnwrap | undefined {
	const jsonValue = tryUnwrapJsonString(raw);
	if (jsonValue) {
		return { value: jsonValue, sourceKind: 'json' };
	}

	const pyResult = pythonReprToJson(raw.trim());
	if (!pyResult) {
		return undefined;
	}

	try {
		const parsed: unknown = JSON.parse(pyResult.json);
		if (isJsonContainer(parsed)) {
			return { value: parsed, sourceKind: 'python' };
		}
	} catch {
		// fall through
	}

	return undefined;
}

export function formatJsonOrJsonString(text: string): JsonFormatResult | undefined {
	const trimmed = text.trim();
	if (trimmed.length === 0) {
		return undefined;
	}

	// Repair input copied from a terminal that broke lines mid-string.
	// Newlines inside a quoted literal become \n escapes; newlines outside
	// strings (valid whitespace) are preserved untouched.
	const repaired = escapeQuotedLineBreaks(trimmed);
	const wasRepaired = repaired !== trimmed;

	let candidate = repaired;
	let parsedFromString = false;

	for (let depth = 0; depth < UNWRAP_DEPTH; depth++) {
		let parsed: unknown;
		try {
			parsed = JSON.parse(candidate);
		} catch {
			// JSON parsing failed — drop out of the loop and try Python below.
			break;
		}

		if (isJsonContainer(parsed)) {
			const baseKind = parsedFromString ? 'json_str' : 'json';
			return {
				formatted: JSON.stringify(parsed, null, '\t'),
				// `wasRepaired` only escalates the kind for top-level JSON.
				// Once a string-unwrap layer is involved (`json_str`), the
				// repair signal is no longer crisp — leave it as `json_str`.
				sourceKind: baseKind === 'json' && wasRepaired ? 'json_repaired' : baseKind,
			};
		}

		if (typeof parsed !== 'string') {
			return undefined;
		}

		const next = parsed.trim();
		if (next.length === 0 || next === candidate) {
			return undefined;
		}
		candidate = next;
		parsedFromString = true;
	}

	// Python repr fallback. We always probe against the repaired input
	// rather than `candidate`, because Python repr only makes sense at the
	// top level — we don't try to unwrap it from string-wrapped layers.
	const pyResult = pythonReprToJson(repaired);
	if (pyResult) {
		try {
			const parsed: unknown = JSON.parse(pyResult.json);
			if (isJsonContainer(parsed)) {
				return {
					formatted: JSON.stringify(parsed, null, '\t'),
					sourceKind: 'python_str',
				};
			}
		} catch {
			// fall through
		}
	}

	return undefined;
}

export function stringifyJsonText(text: string): string | undefined {
	const trimmed = text.trim();
	if (trimmed.length === 0) {
		return undefined;
	}

	try {
		const parsed: unknown = JSON.parse(trimmed);
		if (!isJsonContainer(parsed)) {
			return undefined;
		}
		return JSON.stringify(JSON.stringify(parsed));
	} catch {
		return undefined;
	}
}

export function findNestedJsonStringsRaw(text: string): RawNestedJsonHit[] {
	return findStringValuesRaw(text)
		.filter((hit): hit is RawStringValueHit & { parsedText: string } => hit.parsedText !== undefined)
		.map((hit) => ({
			offset: hit.offset,
			length: hit.length,
			parsedText: hit.parsedText,
			keyPath: hit.keyPath,
			sourceKind: hit.sourceKind,
		}));
}

export function findNestedJsonStrings(document: vscode.TextDocument): NestedJsonHit[] {
	const raw = findNestedJsonStringsRaw(document.getText());
	return raw.map((hit) => ({
		range: new vscode.Range(
			document.positionAt(hit.offset),
			document.positionAt(hit.offset + hit.length)
		),
		parsedText: hit.parsedText,
		keyPath: hit.keyPath,
		sourceKind: hit.sourceKind,
	}));
}

export function findStringValuesRaw(text: string): RawStringValueHit[] {
	const root = parseTree(text);
	if (!root) {
		return [];
	}

	const hits: RawStringValueHit[] = [];
	walkAllStrings(root, [], hits);
	return hits;
}

export function findStringValues(document: vscode.TextDocument): StringValueHit[] {
	const raw = findStringValuesRaw(document.getText());
	return raw.map((hit) => ({
		range: new vscode.Range(
			document.positionAt(hit.offset),
			document.positionAt(hit.offset + hit.length)
		),
		keyPath: hit.keyPath,
		rawValue: hit.rawValue,
		parsedText: hit.parsedText,
		sourceKind: hit.sourceKind,
	}));
}

function walkAllStrings(node: Node, path: Array<string | number>, hits: RawStringValueHit[]): void {
	if (node.type === 'string') {
		const value = node.value;
		if (typeof value !== 'string') {
			return;
		}
		const unwrapped = tryUnwrapStructured(value);
		hits.push({
			offset: node.offset,
			length: node.length,
			keyPath: formatKeyPath(path),
			rawValue: value,
			parsedText: unwrapped ? JSON.stringify(unwrapped.value, null, '\t') : undefined,
			sourceKind: unwrapped?.sourceKind ?? 'json',
		});
		return;
	}

	if (node.type === 'object' && node.children) {
		for (const propertyNode of node.children) {
			if (propertyNode.type !== 'property' || !propertyNode.children) {
				continue;
			}
			const keyNode = propertyNode.children[0];
			const valueNode = propertyNode.children[1];
			if (!keyNode || !valueNode || typeof keyNode.value !== 'string') {
				continue;
			}
			walkAllStrings(valueNode, [...path, keyNode.value], hits);
		}
		return;
	}

	if (node.type === 'array' && node.children) {
		node.children.forEach((child, index) => {
			walkAllStrings(child, [...path, index], hits);
		});
	}
}

export function formatKeyPath(path: Array<string | number>): string {
	if (path.length === 0) {
		return 'root';
	}

	let result = '';
	for (const segment of path) {
		if (typeof segment === 'number') {
			result += `[${segment}]`;
		} else if (result.length === 0) {
			result = segment;
		} else {
			result += `.${segment}`;
		}
	}
	return result;
}
