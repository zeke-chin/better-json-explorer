import * as vscode from 'vscode';

export const PARSE_COMMAND_ID = 'better-json-explorer.parseNestedJson';

export type OpenKind = 'json' | 'text' | 'markdown' | 'python';

const OPEN_KIND_CONFIG: Record<OpenKind, { prefix: string; ext: string; language: string }> = {
	json: { prefix: 'Parsed', ext: 'json', language: 'json' },
	text: { prefix: 'Value', ext: 'txt', language: 'plaintext' },
	markdown: { prefix: 'Value', ext: 'md', language: 'markdown' },
	python: { prefix: 'Parsed-py', ext: 'json', language: 'json' },
};

/**
 * Open `content` in a new editor pane beside the current one, using the
 * language + filename prefix derived from `kind`. Existing untitled documents
 * with the same name are detected by URI and we pick a unique suffix.
 */
export async function parseNestedJsonCommand(
	content: string,
	keyPath: string,
	kind: OpenKind = 'json'
): Promise<void> {
	const cfg = OPEN_KIND_CONFIG[kind] ?? OPEN_KIND_CONFIG.json;
	const baseName = `${cfg.prefix}-${sanitize(keyPath)}.${cfg.ext}`;
	const uri = uniqueUntitledUri(baseName);

	const doc = await vscode.workspace.openTextDocument(uri);
	if (doc.getText().length === 0) {
		const edit = new vscode.WorkspaceEdit();
		edit.insert(uri, new vscode.Position(0, 0), content);
		await vscode.workspace.applyEdit(edit);
	}

	if (doc.languageId !== cfg.language && !(cfg.language === 'json' && doc.languageId === 'jsonc')) {
		await vscode.languages.setTextDocumentLanguage(doc, cfg.language);
	}

	await vscode.window.showTextDocument(doc, {
		viewColumn: vscode.ViewColumn.Beside,
		preview: false,
	});
}

function sanitize(keyPath: string): string {
	const safe = keyPath.replace(/[^A-Za-z0-9._-]/g, '_');
	return safe.length > 0 ? safe : 'root';
}

function uniqueUntitledUri(baseName: string): vscode.Uri {
	const openUris = new Set(
		vscode.workspace.textDocuments.map((doc) => doc.uri.toString())
	);

	const candidate = `untitled:${baseName}`;
	if (!openUris.has(candidate)) {
		return vscode.Uri.parse(candidate);
	}

	const dotIndex = baseName.lastIndexOf('.');
	const stem = dotIndex >= 0 ? baseName.slice(0, dotIndex) : baseName;
	const ext = dotIndex >= 0 ? baseName.slice(dotIndex) : '';

	for (let i = 2; i < 1000; i++) {
		const next = `untitled:${stem}-${i}${ext}`;
		if (!openUris.has(next)) {
			return vscode.Uri.parse(next);
		}
	}

	return vscode.Uri.parse(`untitled:${stem}-${Date.now()}${ext}`);
}
