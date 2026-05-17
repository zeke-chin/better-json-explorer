import * as vscode from 'vscode';
import { Node, parseTree } from 'jsonc-parser';

export type JsonFormatResult = {
	formatted: string;
	sourceKind: 'json' | 'json_str';
};

export type NestedJsonHit = {
	range: vscode.Range;
	parsedText: string;
	keyPath: string;
};

export type RawNestedJsonHit = {
	offset: number;
	length: number;
	parsedText: string;
	keyPath: string;
};

export type StringValueHit = {
	range: vscode.Range;
	keyPath: string;
	rawValue: string;
	parsedText?: string;
};

export type RawStringValueHit = {
	offset: number;
	length: number;
	keyPath: string;
	rawValue: string;
	parsedText?: string;
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

export function formatJsonOrJsonString(text: string): JsonFormatResult | undefined {
	const trimmed = text.trim();
	if (trimmed.length === 0) {
		return undefined;
	}

	let candidate = trimmed;
	let parsedFromString = false;

	for (let depth = 0; depth < UNWRAP_DEPTH; depth++) {
		let parsed: unknown;
		try {
			parsed = JSON.parse(candidate);
		} catch {
			return undefined;
		}

		if (isJsonContainer(parsed)) {
			return {
				formatted: JSON.stringify(parsed, null, '\t'),
				sourceKind: parsedFromString ? 'json_str' : 'json',
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
	}));
}

function walkAllStrings(node: Node, path: Array<string | number>, hits: RawStringValueHit[]): void {
	if (node.type === 'string') {
		const value = node.value;
		if (typeof value !== 'string') {
			return;
		}
		const unwrapped = tryUnwrapJsonString(value);
		hits.push({
			offset: node.offset,
			length: node.length,
			keyPath: formatKeyPath(path),
			rawValue: value,
			parsedText: unwrapped ? JSON.stringify(unwrapped, null, '\t') : undefined,
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

export type PlainStringFormat = 'markdown' | 'text';

const MARKDOWN_MIN_LENGTH = 20;
const MARKDOWN_MIN_SCORE = 2;

const STRONG_MARKDOWN_PATTERNS: RegExp[] = [
	/```[\s\S]*?```/,                                  // fenced code block
	/!\[[^\]]*\]\([^)\s]+\)/,                          // image
	/^\|.+\|\s*\r?\n\|[\s:|-]+\|/m,                    // table header + separator
];

const WEAK_MARKDOWN_PATTERNS: RegExp[] = [
	/^#{1,6}\s+\S/m,                                   // ATX heading
	/\[[^\]\n]+\]\([^)\s]+\)/,                         // inline link
	/^>\s+\S/m,                                        // blockquote
	/^---+$/m,                                         // horizontal rule
	/\*\*[^*\n]+\*\*/,                                 // bold
	/(?<!\w)__[^_\n]+__(?!\w)/,                        // bold (underscore)
	/^[-*+]\s+\S.*(?:\r?\n[-*+]\s+\S.*){1,}/m,         // multi-item bullet list
	/^\d+\.\s+\S.*(?:\r?\n\d+\.\s+\S.*){1,}/m,         // multi-item ordered list
];

export function detectStringFormat(value: string): PlainStringFormat {
	if (value.length < MARKDOWN_MIN_LENGTH) {
		return 'text';
	}

	let score = 0;
	for (const re of STRONG_MARKDOWN_PATTERNS) {
		if (re.test(value)) {
			score += 2;
		}
	}
	for (const re of WEAK_MARKDOWN_PATTERNS) {
		if (re.test(value)) {
			score += 1;
		}
	}

	return score >= MARKDOWN_MIN_SCORE ? 'markdown' : 'text';
}
