import * as vscode from 'vscode';

export function isJsonLanguage(document: vscode.TextDocument): boolean {
	return document.languageId === 'json' || document.languageId === 'jsonc';
}

export function shouldAutoFormatDocument(document: vscode.TextDocument): boolean {
	return document.languageId === 'plaintext';
}

export function firstNonWhitespaceChar(text: string): string | undefined {
	for (let i = 0; i < text.length; i++) {
		const ch = text.charCodeAt(i);
		if (ch !== 0x20 && ch !== 0x09 && ch !== 0x0a && ch !== 0x0d) {
			return text[i];
		}
	}
	return undefined;
}

/**
 * Detect a paste that REPLACED the entire document contents. Used by the
 * change listener to decide whether to attempt auto-format. Cheap filters
 * short-circuit before the expensive full-document comparison.
 */
export function isWholeDocumentPaste(event: vscode.TextDocumentChangeEvent): boolean {
	if (event.contentChanges.length !== 1) {
		return false;
	}

	const change = event.contentChanges[0];

	// Cheap filter 1: a whole-document replacement must start at offset 0.
	if (change.rangeOffset !== 0) {
		return false;
	}

	const inserted = change.text;

	// Cheap filter 2: only JSON-ish openers (`{`, `[`, `"`) can possibly be
	// formatted. (Python repr `'`-quoted top-level dicts also start with `{`.)
	const head = firstNonWhitespaceChar(inserted);
	if (head !== '{' && head !== '[' && head !== '"') {
		return false;
	}

	// Only now do the full-document compare.
	return event.document.getText().trim() === inserted.trim();
}

export function findVisibleEditor(document: vscode.TextDocument): vscode.TextEditor | undefined {
	return vscode.window.visibleTextEditors.find((editor) => {
		return editor.document.uri.toString() === document.uri.toString();
	});
}

export function getDocumentEndPosition(document: vscode.TextDocument): vscode.Position {
	return document.lineAt(document.lineCount - 1).range.end;
}

export function getFullDocumentRange(document: vscode.TextDocument): vscode.Range {
	return new vscode.Range(new vscode.Position(0, 0), getDocumentEndPosition(document));
}

export function revealDocumentEnd(document: vscode.TextDocument): void {
	const editor = findVisibleEditor(document);
	if (!editor) {
		return;
	}

	const endPosition = getDocumentEndPosition(document);
	const endRange = new vscode.Range(endPosition, endPosition);
	editor.selection = new vscode.Selection(endPosition, endPosition);
	editor.revealRange(endRange, vscode.TextEditorRevealType.Default);
}

export async function replaceEditorText(editor: vscode.TextEditor, text: string): Promise<boolean> {
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

/**
 * Switch `document` to the `json` language mode if it isn't already, then
 * replace its full content with `formatted`. Used by both the paste hot path
 * and the explicit "convert to JSON" command.
 */
export async function switchToJsonAndReplace(document: vscode.TextDocument, formatted: string): Promise<void> {
	const jsonDocument = document.languageId === 'json'
		? document
		: await vscode.languages.setTextDocumentLanguage(document, 'json');
	const fullRange = getFullDocumentRange(jsonDocument);
	const edit = new vscode.WorkspaceEdit();
	edit.replace(jsonDocument.uri, fullRange, formatted);
	await vscode.workspace.applyEdit(edit);
	revealDocumentEnd(jsonDocument);
}
