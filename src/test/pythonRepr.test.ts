import * as assert from 'assert';
import { pythonReprToJson } from '../pythonRepr';

function expectJson(input: string, expected: unknown): void {
	const result = pythonReprToJson(input);
	assert.ok(result, `expected ok for ${JSON.stringify(input)}, got undefined`);
	assert.deepStrictEqual(JSON.parse(result.json), expected);
}

function expectReject(input: string): void {
	const result = pythonReprToJson(input);
	assert.strictEqual(result, undefined, `expected undefined for ${JSON.stringify(input)}`);
}

suite('pythonReprToJson', () => {
	suite('input shapes', () => {
		test('accepts the JSON subset (JSON literals are valid Python literals)', () => {
			// In the real flow upstream tries JSON.parse first, so the converter
			// usually never sees pure JSON. But accepting it is correct behavior.
			expectJson('{"a": 1}', { a: 1 });
			expectJson('[1, 2, 3]', [1, 2, 3]);
		});

		test('lowercase JSON null/true/false is rejected (only Python keywords supported)', () => {
			expectReject('{"a": null}');
			expectReject('{"a": true}');
		});

		test('non-python text returns undefined', () => {
			expectReject('not python at all');
			expectReject('');
			expectReject('   ');
		});

		test('top-level True / None parse to JSON primitives (caller filters out non-containers)', () => {
			const t = pythonReprToJson('True');
			assert.ok(t);
			assert.strictEqual(t.json, 'true');
			const n = pythonReprToJson('None');
			assert.ok(n);
			assert.strictEqual(n.json, 'null');
		});
	});

	suite('dict', () => {
		test('flat dict with single-quoted keys and values', () => {
			expectJson("{'name': 'alice', 'count': 3}", { name: 'alice', count: 3 });
		});

		test('dict with True / False / None', () => {
			expectJson("{'a': True, 'b': False, 'c': None}", { a: true, b: false, c: null });
		});

		test('empty dict', () => {
			expectJson('{}', {});
		});

		test('trailing comma in dict', () => {
			expectJson("{'a': 1,}", { a: 1 });
		});

		test('mixed single and double quoted strings', () => {
			expectJson(`{'a': "x", "b": 'y'}`, { a: 'x', b: 'y' });
		});

		test('dict with integer keys is rejected (JSON requires string keys)', () => {
			expectReject("{1: 'a'}");
		});

		test('set literal is rejected (no colon)', () => {
			expectReject("{'a', 'b', 'c'}");
		});
	});

	suite('list and tuple', () => {
		test('flat list', () => {
			expectJson("[1, 'a', True, None]", [1, 'a', true, null]);
		});

		test('empty list', () => {
			expectJson('[]', []);
		});

		test('trailing comma in list', () => {
			expectJson("[1, 2, 3,]", [1, 2, 3]);
		});

		test('tuple is converted to JSON array', () => {
			expectJson("(1, 2, 3)", [1, 2, 3]);
		});

		test('single-element tuple with trailing comma', () => {
			expectJson("(1,)", [1]);
		});

		test('empty tuple', () => {
			expectJson('()', []);
		});
	});

	suite('nesting', () => {
		test('dict containing list and nested dict', () => {
			expectJson(
				"{'items': [1, 2], 'meta': {'ok': True}}",
				{ items: [1, 2], meta: { ok: true } }
			);
		});

		test('list of dicts', () => {
			expectJson(
				"[{'a': 1}, {'a': 2}, {'a': 3}]",
				[{ a: 1 }, { a: 2 }, { a: 3 }]
			);
		});

		test('tuple inside dict', () => {
			expectJson("{'coords': (10, 20)}", { coords: [10, 20] });
		});

		test('deeply nested', () => {
			expectJson(
				"{'a': {'b': {'c': {'d': True}}}}",
				{ a: { b: { c: { d: true } } } }
			);
		});
	});

	suite('strings', () => {
		test('apostrophe escaped in single-quoted string', () => {
			expectJson("{'msg': 'It\\'s fine'}", { msg: "It's fine" });
		});

		test('double quote inside single-quoted string is literal', () => {
			expectJson(`{'msg': 'He said "hi"'}`, { msg: 'He said "hi"' });
		});

		test('newline escape', () => {
			expectJson("{'log': 'line1\\nline2'}", { log: 'line1\nline2' });
		});

		test('tab and carriage return escape', () => {
			expectJson("{'a': 'x\\ty\\rz'}", { a: 'x\ty\rz' });
		});

		test('hex escape \\xNN', () => {
			expectJson("{'a': '\\x41'}", { a: 'A' });
		});

		test('unicode escape \\uNNNN', () => {
			expectJson("{'a': '\\u00e9'}", { a: 'é' });
		});

		test('triple-quoted string with literal newline', () => {
			expectJson("{'doc': '''line1\nline2'''}", { doc: 'line1\nline2' });
		});

		test('empty string', () => {
			expectJson("{'a': ''}", { a: '' });
		});

		test('raw newline in single-quoted string is rejected', () => {
			expectReject("{'a': 'line1\nline2'}");
		});

		test('unterminated string is rejected', () => {
			expectReject("{'a': 'unterminated");
		});

		test('unknown escape is rejected', () => {
			expectReject("{'a': '\\q'}");
		});
	});

	suite('numbers', () => {
		test('integer', () => {
			expectJson("{'a': 42}", { a: 42 });
		});

		test('negative integer', () => {
			expectJson("{'a': -7}", { a: -7 });
		});

		test('float', () => {
			expectJson("{'a': 3.14}", { a: 3.14 });
		});

		test('float with no integer part', () => {
			expectJson("{'a': .5}", { a: 0.5 });
		});

		test('float with no fractional digits', () => {
			expectJson("{'a': 1.}", { a: 1.0 });
		});

		test('exponent', () => {
			expectJson("{'a': 1.5e2, 'b': 2E-3}", { a: 150, b: 0.002 });
		});

		test('leading + is stripped', () => {
			expectJson("{'a': +5}", { a: 5 });
		});
	});

	suite('failure paths (unsupported repr forms)', () => {
		test('bytes literal is rejected', () => {
			expectReject("{'a': b'raw'}");
		});

		test('function-call repr (datetime) is rejected', () => {
			expectReject("{'t': datetime(2024, 1, 1)}");
		});

		test('object-reference repr is rejected', () => {
			expectReject("{'obj': <Foo object at 0x100>}");
		});

		test('UUID-like repr is rejected', () => {
			expectReject("{'id': UUID('abc')}");
		});

		test('trailing garbage after valid literal is rejected', () => {
			expectReject("{'a': 1} junk");
		});

		test('unbalanced braces are rejected', () => {
			expectReject("{'a': 1");
			expectReject("[1, 2");
		});

		test('missing colon in dict pair is rejected', () => {
			expectReject("{'a' 1}");
		});
	});

	suite('whitespace handling', () => {
		test('arbitrary whitespace between tokens', () => {
			expectJson("  {  'a'  :  1  ,  'b'  :  2  }  ", { a: 1, b: 2 });
		});

		test('newlines between tokens', () => {
			expectJson("{\n  'a': 1,\n  'b': 2\n}", { a: 1, b: 2 });
		});
	});
});
