import * as vscode from 'vscode';
import {
	ConvertToJsonCodeLensProvider,
	NestedJsonCodeLensProvider,
} from './codeLensProvider';
import {
	CONVERT_TO_JSON_COMMAND_ID,
	convertInPlaceToJson,
	formatDocumentIfPossible,
	toggleActiveDocument,
} from './commands';
import { isWholeDocumentPaste, shouldAutoFormatDocument } from './editorOps';
import { NestedJsonHoverProvider } from './hoverProvider';
import { initLogger, logError, logInfo } from './logger';
import {
	OpenKind,
	PARSE_COMMAND_ID,
	parseNestedJsonCommand,
} from './parseNestedCommand';

const formatInFlight = new Set<string>();

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
			toggleActiveDocument().then(undefined, (error: unknown) => {
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

	const convertDisposable = vscode.commands.registerCommand(
		CONVERT_TO_JSON_COMMAND_ID,
		(uriString?: string) => {
			convertInPlaceToJson(uriString).then(undefined, (error: unknown) => {
				logError('Failed to convert document to JSON.', error);
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

	const convertCodeLensDisposable = vscode.languages.registerCodeLensProvider(
		{ language: 'plaintext' },
		new ConvertToJsonCodeLensProvider()
	);

	context.subscriptions.push(
		outputChannel,
		changeDisposable,
		toggleDisposable,
		parseNestedDisposable,
		convertDisposable,
		hoverDisposable,
		codeLensDisposable,
		convertCodeLensDisposable
	);
}

export function deactivate() {}
