import * as vscode from 'vscode';

/**
 * User-configurable behavior for the two "needs opt-in" conversions.
 * `true` means "auto-convert on paste"; `false` (default) means "show the
 * CodeLens button instead".
 */
export type AutoConvertConfig = {
	autoConvertPython: boolean;
	autoConvertLineBreak: boolean;
};

export const CONFIG_SECTION = 'betterJsonExplorer';
export const CONFIG_KEY_PYTHON_AUTO = 'pythonRepr.autoConvert';
export const CONFIG_KEY_LINE_BREAK_AUTO = 'lineBreakRepair.autoConvert';

export function readAutoConvertConfig(): AutoConvertConfig {
	const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
	return {
		autoConvertPython: config.get<boolean>(CONFIG_KEY_PYTHON_AUTO, false),
		autoConvertLineBreak: config.get<boolean>(CONFIG_KEY_LINE_BREAK_AUTO, false),
	};
}
