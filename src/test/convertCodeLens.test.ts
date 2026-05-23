import * as assert from 'assert';
import * as vscode from 'vscode';

import {
	CONVERT_TO_JSON_COMMAND_ID,
	computeConvertToJsonLenses,
} from '../codeLensProvider';
import { AutoConvertConfig } from '../config';

const SHOW_BUTTONS: AutoConvertConfig = { autoConvertPython: false, autoConvertLineBreak: false };
const AUTO_PYTHON: AutoConvertConfig = { autoConvertPython: true, autoConvertLineBreak: false };
const AUTO_LINE_BREAK: AutoConvertConfig = { autoConvertPython: false, autoConvertLineBreak: true };
const AUTO_BOTH: AutoConvertConfig = { autoConvertPython: true, autoConvertLineBreak: true };

async function openPlaintextDoc(content: string): Promise<vscode.TextDocument> {
	return vscode.workspace.openTextDocument({ language: 'plaintext', content });
}

suite('ConvertToJsonCodeLens', () => {
	test('renders Python-dict CodeLens for top-level Python repr', async () => {
		const doc = await openPlaintextDoc(
			"{'name': 'Alice', 'tags': ('admin', 'dev'), 'meta': {'active': True, 'parent': None}}"
		);
		const lenses = computeConvertToJsonLenses(doc, SHOW_BUTTONS);

		assert.strictEqual(lenses.length, 1);
		assert.strictEqual(lenses[0].command?.command, CONVERT_TO_JSON_COMMAND_ID);
		assert.strictEqual(lenses[0].command?.title, '▸ Convert Python dict to JSON');
		assert.strictEqual(lenses[0].range.start.line, 0);
	});

	test('renders line-break-repair CodeLens for JSON with raw newlines inside strings', async () => {
		const doc = await openPlaintextDoc('{"message": "line1\nline2\nline3", "ok": true}');
		const lenses = computeConvertToJsonLenses(doc, SHOW_BUTTONS);

		assert.strictEqual(lenses.length, 1);
		assert.strictEqual(lenses[0].command?.command, CONVERT_TO_JSON_COMMAND_ID);
		assert.strictEqual(lenses[0].command?.title, '▸ Convert to JSON (fix line breaks)');
	});

	test('does not render for clean JSON (auto-format path owns it)', async () => {
		const doc = await openPlaintextDoc('{"a": 1, "b": [true, null]}');
		const lenses = computeConvertToJsonLenses(doc, SHOW_BUTTONS);
		assert.strictEqual(lenses.length, 0);
	});

	test('does not render for pretty-printed JSON whose newlines are outside strings', async () => {
		const doc = await openPlaintextDoc('{\n  "a": 1,\n  "b": 2\n}');
		const lenses = computeConvertToJsonLenses(doc, SHOW_BUTTONS);
		assert.strictEqual(lenses.length, 0);
	});

	test('does not render for non-structured content', async () => {
		const doc = await openPlaintextDoc('hello world, this is just text');
		const lenses = computeConvertToJsonLenses(doc, SHOW_BUTTONS);
		assert.strictEqual(lenses.length, 0);
	});

	test('does not render for unsupported Python repr (datetime call)', async () => {
		const doc = await openPlaintextDoc("{'time': datetime(2024, 1, 1)}");
		const lenses = computeConvertToJsonLenses(doc, SHOW_BUTTONS);
		assert.strictEqual(lenses.length, 0);
	});

	test('renders for Python list literal at the top level', async () => {
		const doc = await openPlaintextDoc("[{'a': True}, {'b': None}]");
		const lenses = computeConvertToJsonLenses(doc, SHOW_BUTTONS);
		assert.strictEqual(lenses.length, 1);
		assert.strictEqual(lenses[0].command?.title, '▸ Convert Python dict to JSON');
	});

	test('renders for leading-whitespace Python repr', async () => {
		const doc = await openPlaintextDoc("\n\n   {'x': 1}\n");
		const lenses = computeConvertToJsonLenses(doc, SHOW_BUTTONS);
		assert.strictEqual(lenses.length, 1);
	});

	test('renders line-break-repair CodeLens for CRLF inside strings', async () => {
		const doc = await openPlaintextDoc('{"msg": "a\r\nb"}');
		const lenses = computeConvertToJsonLenses(doc, SHOW_BUTTONS);
		assert.strictEqual(lenses.length, 1);
		assert.strictEqual(lenses[0].command?.title, '▸ Convert to JSON (fix line breaks)');
	});

	suite('autoConvert config gates button visibility', () => {
		test('autoConvertPython=true suppresses Python button', async () => {
			const doc = await openPlaintextDoc("{'a': True}");
			assert.strictEqual(computeConvertToJsonLenses(doc, AUTO_PYTHON).length, 0);
		});

		test('autoConvertPython=true does NOT suppress line-break button', async () => {
			const doc = await openPlaintextDoc('{"msg": "a\nb"}');
			const lenses = computeConvertToJsonLenses(doc, AUTO_PYTHON);
			assert.strictEqual(lenses.length, 1);
			assert.strictEqual(lenses[0].command?.title, '▸ Convert to JSON (fix line breaks)');
		});

		test('autoConvertLineBreak=true suppresses line-break button', async () => {
			const doc = await openPlaintextDoc('{"msg": "a\nb"}');
			assert.strictEqual(computeConvertToJsonLenses(doc, AUTO_LINE_BREAK).length, 0);
		});

		test('autoConvertLineBreak=true does NOT suppress Python button', async () => {
			const doc = await openPlaintextDoc("{'a': True}");
			const lenses = computeConvertToJsonLenses(doc, AUTO_LINE_BREAK);
			assert.strictEqual(lenses.length, 1);
			assert.strictEqual(lenses[0].command?.title, '▸ Convert Python dict to JSON');
		});

		test('both flags=true suppresses both buttons', async () => {
			const pyDoc = await openPlaintextDoc("{'a': True}");
			const repairDoc = await openPlaintextDoc('{"msg": "a\nb"}');
			assert.strictEqual(computeConvertToJsonLenses(pyDoc, AUTO_BOTH).length, 0);
			assert.strictEqual(computeConvertToJsonLenses(repairDoc, AUTO_BOTH).length, 0);
		});
	});
});
