import * as vscode from 'vscode';

let outputChannel: vscode.OutputChannel | undefined;

export function initLogger(): vscode.OutputChannel {
	outputChannel = vscode.window.createOutputChannel('BetterJsonExplorer');
	return outputChannel;
}

export function logInfo(message: string): void {
	const line = `[BetterJsonExplorer] ${message}`;
	console.log(line);
	outputChannel?.appendLine(line);
}

export function logError(message: string, error: unknown): void {
	const line = `[BetterJsonExplorer] ${message}`;
	console.error(line, error);
	outputChannel?.appendLine(line);
	outputChannel?.appendLine(error instanceof Error ? error.stack ?? error.message : String(error));
}
