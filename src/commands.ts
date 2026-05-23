import * as vscode from 'vscode';
import { readAutoConvertConfig } from './config';
import { computeConvertToJsonLenses, CONVERT_TO_JSON_COMMAND_ID } from './codeLensProvider';
import {
	isJsonLanguage,
	replaceEditorText,
	shouldAutoFormatDocument,
	switchToJsonAndReplace,
} from './editorOps';
import { formatJsonOrJsonString, stringifyJsonText } from './jsonUtils';
import { logError, logInfo } from './logger';

export { CONVERT_TO_JSON_COMMAND_ID };

/**
 * Paste hot path. If the just-pasted content is recognized as JSON (or one of
 * the user-opted-in repair variants), switch the document to JSON language
 * mode and replace its contents with the formatted output.
 */
export async function formatDocumentIfPossible(
	document: vscode.TextDocument,
	requirePlainText = true
): Promise<boolean> {
	if (requirePlainText && !shouldAutoFormatDocument(document)) {
		return false;
	}

	const result = formatJsonOrJsonString(document.getText());
	if (!result) {
		return false;
	}

	// Python repr and JSON-that-needed-line-break-repair are gated by user
	// configuration. When the corresponding `autoConvert` flag is true we
	// proceed with the format (paste-time auto-convert). When it's false
	// (default), we skip — the user opts in via the CodeLens button instead.
	const autoConvert = readAutoConvertConfig();
	if (result.sourceKind === 'python_str' && !autoConvert.autoConvertPython) {
		return false;
	}
	if (result.sourceKind === 'json_repaired' && !autoConvert.autoConvertLineBreak) {
		return false;
	}

	logInfo(`Detected ${result.sourceKind}; switching language mode to JSON and formatting.`);
	await switchToJsonAndReplace(document, result.formatted);
	return true;
}

/**
 * `Cmd+;` dispatcher. In json/jsonc it does the existing JSON ⇄ JSON-string
 * toggle; in plaintext it converts Python repr or line-break-broken JSON in
 * place, but only when the corresponding CodeLens button is visible.
 */
export async function toggleActiveDocument(): Promise<void> {
	const editor = vscode.window.activeTextEditor;
	if (!editor) {
		return;
	}

	if (isJsonLanguage(editor.document)) {
		await toggleActiveJsonEditor();
		return;
	}

	if (editor.document.languageId === 'plaintext') {
		// Mirror the CodeLens button's visibility: if the icon is up, the
		// shortcut converts; if config has suppressed the icon (or content
		// isn't convertible), the shortcut no-ops with a status hint.
		const lenses = computeConvertToJsonLenses(editor.document);
		if (lenses.length === 0) {
			vscode.window.setStatusBarMessage('BetterJsonExplorer: nothing to convert', 2500);
			return;
		}
		await convertInPlaceToJson();
	}
}

async function toggleActiveJsonEditor(): Promise<void> {
	const editor = getActiveJsonEditor();
	if (!editor) {
		return;
	}

	const text = editor.document.getText();
	const result = formatJsonOrJsonString(text);
	if (!result) {
		vscode.window.setStatusBarMessage('BetterJsonExplorer: cannot toggle current JSON text', 2500);
		return;
	}

	if (result.sourceKind === 'json_str') {
		logInfo('Toggling JSON string to formatted JSON.');
		const replaced = await replaceEditorText(editor, result.formatted);
		if (replaced) {
			vscode.window.setStatusBarMessage('to json format', 2500);
		}
		return;
	}

	const jsonString = stringifyJsonText(text);
	if (!jsonString) {
		vscode.window.setStatusBarMessage('BetterJsonExplorer: cannot convert current JSON text to string', 2500);
		return;
	}

	logInfo('Toggling formatted JSON to JSON string.');
	const replaced = await replaceEditorText(editor, jsonString);
	if (replaced) {
		vscode.window.setStatusBarMessage('to json string', 2500);
	}
}

function getActiveJsonEditor(): vscode.TextEditor | undefined {
	const editor = vscode.window.activeTextEditor;
	if (!editor || !isJsonLanguage(editor.document)) {
		return undefined;
	}
	return editor;
}

/**
 * Convert a plaintext document containing Python repr or line-break-broken
 * JSON into JSON in place. Invoked by both the CodeLens button (with a URI
 * argument) and the `Cmd+;` shortcut path (no argument → active editor).
 */
export async function convertInPlaceToJson(uriString?: string): Promise<void> {
	const document = await resolveTargetDocument(uriString);
	if (!document) {
		vscode.window.setStatusBarMessage('BetterJsonExplorer: no active editor', 2500);
		return;
	}

	const result = formatJsonOrJsonString(document.getText());
	if (!result || (result.sourceKind !== 'python_str' && result.sourceKind !== 'json_repaired')) {
		vscode.window.setStatusBarMessage('BetterJsonExplorer: nothing to convert', 2500);
		return;
	}

	logInfo(`Converting ${result.sourceKind} to JSON via CodeLens button.`);
	await switchToJsonAndReplace(document, result.formatted);
}

async function resolveTargetDocument(uriString?: string): Promise<vscode.TextDocument | undefined> {
	if (uriString) {
		try {
			const uri = vscode.Uri.parse(uriString);
			return await vscode.workspace.openTextDocument(uri);
		} catch (error) {
			logError('Failed to resolve target document URI.', error);
			return undefined;
		}
	}
	return vscode.window.activeTextEditor?.document;
}
