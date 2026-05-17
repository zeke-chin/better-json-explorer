import * as vscode from 'vscode';
import { initLogger, logError, logInfo } from './logger';
import { formatJsonOrJsonString, stringifyJsonText } from './jsonUtils';
import { NestedJsonHoverProvider } from './hoverProvider';
import {
	NestedJsonCodeLensProvider,
	OpenKind,
	PARSE_COMMAND_ID,
	parseNestedJsonCommand,
} from './codeLensProvider';

const formatInFlight = new Set<string>();

function isJsonLanguage(document: vscode.TextDocument): boolean {
	return document.languageId === 'json' || document.languageId === 'jsonc';
}

function shouldAutoFormatDocument(document: vscode.TextDocument): boolean {
	return document.languageId === 'plaintext';
}

function firstNonWhitespaceChar(text: string): string | undefined {
	for (let i = 0; i < text.length; i++) {
		const ch = text.charCodeAt(i);
		if (ch !== 0x20 && ch !== 0x09 && ch !== 0x0a && ch !== 0x0d) {
			return text[i];
		}
	}
	return undefined;
}

function isWholeDocumentPaste(event: vscode.TextDocumentChangeEvent): boolean {
	if (event.contentChanges.length !== 1) {
		return false;
	}

	const change = event.contentChanges[0];

	// Cheap filter 1: a whole-document replacement must start at offset 0.
	// Any edit in the middle/end of the document fails here without touching getText().
	if (change.rangeOffset !== 0) {
		return false;
	}

	const inserted = change.text;

	// Cheap filter 2: the inserted text must start with a JSON container or string opener.
	// formatJsonOrJsonString would reject anything else, so this is behavior-equivalent.
	const head = firstNonWhitespaceChar(inserted);
	if (head !== '{' && head !== '[' && head !== '"') {
		return false;
	}

	// Only now do the expensive full-document comparison.
	return event.document.getText().trim() === inserted.trim();
}

function findVisibleEditor(document: vscode.TextDocument): vscode.TextEditor | undefined {
	return vscode.window.visibleTextEditors.find((editor) => {
		return editor.document.uri.toString() === document.uri.toString();
	});
}

function getDocumentEndPosition(document: vscode.TextDocument): vscode.Position {
	return document.lineAt(document.lineCount - 1).range.end;
}

function getFullDocumentRange(document: vscode.TextDocument): vscode.Range {
	return new vscode.Range(new vscode.Position(0, 0), getDocumentEndPosition(document));
}

function revealDocumentEnd(document: vscode.TextDocument): void {
	const editor = findVisibleEditor(document);
	if (!editor) {
		return;
	}

	const endPosition = getDocumentEndPosition(document);
	const endRange = new vscode.Range(endPosition, endPosition);
	editor.selection = new vscode.Selection(endPosition, endPosition);
	editor.revealRange(endRange, vscode.TextEditorRevealType.Default);
}

async function replaceEditorText(editor: vscode.TextEditor, text: string): Promise<boolean> {
	const document = editor.document;
	const fullRange = getFullDocumentRange(document);
	const replaced = await editor.edit((editBuilder) => {
		editBuilder.replace(fullRange, text);
	});

	if (replaced) {
		revealDocumentEnd(document);
	}

	return replaced;
}

async function switchToJsonAndReplace(document: vscode.TextDocument, formatted: string): Promise<void> {
	const jsonDocument = document.languageId === 'json'
		? document
		: await vscode.languages.setTextDocumentLanguage(document, 'json');
	const fullRange = getFullDocumentRange(jsonDocument);
	const edit = new vscode.WorkspaceEdit();
	edit.replace(jsonDocument.uri, fullRange, formatted);
	await vscode.workspace.applyEdit(edit);
	revealDocumentEnd(jsonDocument);
}

async function formatDocumentIfPossible(document: vscode.TextDocument, requirePlainText = true): Promise<boolean> {
	if (requirePlainText && !shouldAutoFormatDocument(document)) {
		return false;
	}

	const result = formatJsonOrJsonString(document.getText());
	if (!result) {
		return false;
	}

	logInfo(`Detected ${result.sourceKind}; switching language mode to JSON and formatting.`);
	await switchToJsonAndReplace(document, result.formatted);
	return true;
}

function getActiveJsonEditor(): vscode.TextEditor | undefined {
	const editor = vscode.window.activeTextEditor;
	if (!editor || !isJsonLanguage(editor.document)) {
		return undefined;
	}

	return editor;
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

export function activate(context: vscode.ExtensionContext) {
	const outputChannel = initLogger();
	logInfo('Activated.');

	const changeDisposable = vscode.workspace.onDidChangeTextDocument((event) => {
		const documentKey = event.document.uri.toString();
		// Short-circuit any change events fired while we are mid-format on the same document.
		// This catches our own applyEdit echo, language-switch echoes, and any user keystrokes
		// landing during the async format window.
		if (formatInFlight.has(documentKey)) {
			return;
		}
		if (!shouldAutoFormatDocument(event.document) || !isWholeDocumentPaste(event)) {
			return;
		}

		formatInFlight.add(documentKey);
		formatDocumentIfPossible(event.document)
			.catch((error: unknown) => {
				logError('Failed to format pasted JSON.', error);
			})
			.finally(() => {
				formatInFlight.delete(documentKey);
			});
	});

	const toggleDisposable = vscode.commands.registerCommand(
		'better-json-explorer.toggleCurrentDocument',
		() => {
			toggleActiveJsonEditor().then(undefined, (error: unknown) => {
				logError('Failed to toggle current document.', error);
			});
		}
	);

	const parseNestedDisposable = vscode.commands.registerCommand(
		PARSE_COMMAND_ID,
		(content: string, keyPath: string, kind: OpenKind = 'json') => {
			parseNestedJsonCommand(content, keyPath, kind).then(undefined, (error: unknown) => {
				logError('Failed to open parsed content document.', error);
			});
		}
	);

	const jsonSelector: vscode.DocumentSelector = [
		{ language: 'json' },
		{ language: 'jsonc' },
	];

	const hoverDisposable = vscode.languages.registerHoverProvider(
		jsonSelector,
		new NestedJsonHoverProvider()
	);

	const codeLensDisposable = vscode.languages.registerCodeLensProvider(
		jsonSelector,
		new NestedJsonCodeLensProvider()
	);

	context.subscriptions.push(
		outputChannel,
		changeDisposable,
		toggleDisposable,
		parseNestedDisposable,
		hoverDisposable,
		codeLensDisposable
	);
}

export function deactivate() {}
