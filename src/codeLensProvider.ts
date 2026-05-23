import * as vscode from 'vscode';
import {
	AutoConvertConfig,
	CONFIG_KEY_LINE_BREAK_AUTO,
	CONFIG_KEY_PYTHON_AUTO,
	CONFIG_SECTION,
	readAutoConvertConfig,
} from './config';
import { firstNonWhitespaceChar } from './editorOps';
import { findNestedJsonStrings, formatJsonOrJsonString } from './jsonUtils';
import { PARSE_COMMAND_ID } from './parseNestedCommand';

export const CONVERT_TO_JSON_COMMAND_ID = 'better-json-explorer.convertToJsonInPlace';

type CacheEntry = {
	version: number;
	lenses: vscode.CodeLens[];
};

/**
 * CodeLens above any string-valued node in a JSON/JSONC document whose
 * content is itself JSON or a Python repr literal. Clicking opens the parsed
 * content in a new editor pane beside the current one.
 */
export class NestedJsonCodeLensProvider implements vscode.CodeLensProvider {
	private readonly cache = new WeakMap<vscode.TextDocument, CacheEntry>();

	provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
		const cached = this.cache.get(document);
		if (cached && cached.version === document.version) {
			return cached.lenses;
		}

		const hits = findNestedJsonStrings(document);
		const lenses = hits.map(
			(hit) =>
				new vscode.CodeLens(new vscode.Range(hit.range.start, hit.range.start), {
					title: hit.sourceKind === 'python' ? '▸ Parse Python dict' : '▸ Parse JSON',
					command: PARSE_COMMAND_ID,
					arguments: [hit.parsedText, hit.keyPath, hit.sourceKind === 'python' ? 'python' : 'json'],
				})
		);

		this.cache.set(document, { version: document.version, lenses });
		return lenses;
	}
}

/**
 * Plaintext top-level button. Renders one CodeLens at line 0 when the entire
 * document is either:
 *   - a parseable Python repr literal (sourceKind === 'python_str'), or
 *   - JSON that only parses after repairing in-string line breaks
 *     (sourceKind === 'json_repaired').
 *
 * The button is suppressed for whichever source kinds the user has opted into
 * "auto-convert on paste" via configuration — that's the alternate UX and we
 * don't want to show both.
 */
export class ConvertToJsonCodeLensProvider implements vscode.CodeLensProvider {
	private cache = new WeakMap<vscode.TextDocument, CacheEntry>();
	private readonly emitter = new vscode.EventEmitter<void>();

	readonly onDidChangeCodeLenses = this.emitter.event;

	private readonly configListener = vscode.workspace.onDidChangeConfiguration((event) => {
		if (
			event.affectsConfiguration(`${CONFIG_SECTION}.${CONFIG_KEY_PYTHON_AUTO}`) ||
			event.affectsConfiguration(`${CONFIG_SECTION}.${CONFIG_KEY_LINE_BREAK_AUTO}`)
		) {
			// Drop the cache so the next provideCodeLenses honors the new flags.
			// (Version-keyed cache otherwise hides config-only changes.)
			this.cache = new WeakMap();
			this.emitter.fire();
		}
	});

	dispose(): void {
		this.configListener.dispose();
		this.emitter.dispose();
	}

	provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
		if (document.languageId !== 'plaintext') {
			return [];
		}

		const cached = this.cache.get(document);
		if (cached && cached.version === document.version) {
			return cached.lenses;
		}

		const lenses = computeConvertToJsonLenses(document);
		this.cache.set(document, { version: document.version, lenses });
		return lenses;
	}
}

export function computeConvertToJsonLenses(
	document: vscode.TextDocument,
	config: AutoConvertConfig = readAutoConvertConfig()
): vscode.CodeLens[] {
	const text = document.getText();
	const head = firstNonWhitespaceChar(text);
	// Both Python repr and JSON always start with `{`, `[`, or (Python only) `(`.
	if (head !== '{' && head !== '[' && head !== '(') {
		return [];
	}

	const result = formatJsonOrJsonString(text);
	if (!result) {
		return [];
	}

	let title: string | undefined;
	if (result.sourceKind === 'python_str' && !config.autoConvertPython) {
		title = '▸ Convert Python dict to JSON';
	} else if (result.sourceKind === 'json_repaired' && !config.autoConvertLineBreak) {
		title = '▸ Convert to JSON (fix line breaks)';
	}
	if (!title) {
		return [];
	}

	const range = new vscode.Range(0, 0, 0, 0);
	return [
		new vscode.CodeLens(range, {
			title,
			command: CONVERT_TO_JSON_COMMAND_ID,
			arguments: [document.uri.toString()],
		}),
	];
}
