import * as assert from 'assert';
import {
	findNestedJsonStringsRaw,
	findStringValuesRaw,
	formatJsonOrJsonString,
	formatKeyPath,
	isJsonContainer,
	stringifyJsonText,
	tryUnwrapJsonString,
	tryUnwrapStructured,
} from '../jsonUtils';

suite('jsonUtils', () => {
	suite('isJsonContainer', () => {
		test('object is container', () => {
			assert.strictEqual(isJsonContainer({}), true);
			assert.strictEqual(isJsonContainer({ a: 1 }), true);
		});

		test('array is container', () => {
			assert.strictEqual(isJsonContainer([]), true);
			assert.strictEqual(isJsonContainer([1, 2]), true);
		});

		test('primitives are not containers', () => {
			assert.strictEqual(isJsonContainer('abc'), false);
			assert.strictEqual(isJsonContainer(42), false);
			assert.strictEqual(isJsonContainer(true), false);
			assert.strictEqual(isJsonContainer(null), false);
			assert.strictEqual(isJsonContainer(undefined), false);
		});
	});

	suite('tryUnwrapJsonString', () => {
		test('unwraps single-level object', () => {
			assert.deepStrictEqual(tryUnwrapJsonString('{"a":1}'), { a: 1 });
		});

		test('unwraps single-level array', () => {
			assert.deepStrictEqual(tryUnwrapJsonString('[1,2,3]'), [1, 2, 3]);
		});

		test('unwraps multi-level nested string', () => {
			const doubleEncoded = JSON.stringify(JSON.stringify({ a: 1 }));
			assert.deepStrictEqual(tryUnwrapJsonString(doubleEncoded), { a: 1 });
		});

		test('returns undefined for json primitives', () => {
			assert.strictEqual(tryUnwrapJsonString('42'), undefined);
			assert.strictEqual(tryUnwrapJsonString('true'), undefined);
			assert.strictEqual(tryUnwrapJsonString('null'), undefined);
			assert.strictEqual(tryUnwrapJsonString('"hello"'), undefined);
		});

		test('returns undefined for invalid json', () => {
			assert.strictEqual(tryUnwrapJsonString('not json'), undefined);
			assert.strictEqual(tryUnwrapJsonString('{a:1}'), undefined);
			assert.strictEqual(tryUnwrapJsonString(''), undefined);
			assert.strictEqual(tryUnwrapJsonString('   '), undefined);
		});

		test('does not exceed unwrap depth', () => {
			let value: string = JSON.stringify({ a: 1 });
			for (let i = 0; i < 10; i++) {
				value = JSON.stringify(value);
			}
			assert.strictEqual(tryUnwrapJsonString(value), undefined);
		});

		test('does not accept Python repr (JSON-only boundary preserved)', () => {
			// Python fallback lives in tryUnwrapStructured, not here.
			assert.strictEqual(tryUnwrapJsonString("{'a': 1}"), undefined);
		});
	});

	suite('tryUnwrapStructured', () => {
		test('unwraps plain JSON with sourceKind json', () => {
			const result = tryUnwrapStructured('{"a":1}');
			assert.ok(result);
			assert.deepStrictEqual(result.value, { a: 1 });
			assert.strictEqual(result.sourceKind, 'json');
		});

		test('unwraps multi-level JSON string with sourceKind json', () => {
			const result = tryUnwrapStructured(JSON.stringify(JSON.stringify({ a: 1 })));
			assert.ok(result);
			assert.deepStrictEqual(result.value, { a: 1 });
			assert.strictEqual(result.sourceKind, 'json');
		});

		test('unwraps Python repr with sourceKind python', () => {
			const result = tryUnwrapStructured("{'a': 1, 'b': True, 'c': None}");
			assert.ok(result);
			assert.deepStrictEqual(result.value, { a: 1, b: true, c: null });
			assert.strictEqual(result.sourceKind, 'python');
		});

		test('unwraps Python list with sourceKind python', () => {
			const result = tryUnwrapStructured("[1, 'a', True]");
			assert.ok(result);
			assert.deepStrictEqual(result.value, [1, 'a', true]);
			assert.strictEqual(result.sourceKind, 'python');
		});

		test('returns undefined for non-container Python literal', () => {
			assert.strictEqual(tryUnwrapStructured('True'), undefined);
			assert.strictEqual(tryUnwrapStructured("'hello'"), undefined);
		});

		test('returns undefined for unparseable input', () => {
			assert.strictEqual(tryUnwrapStructured('not anything'), undefined);
			assert.strictEqual(tryUnwrapStructured(''), undefined);
		});
	});

	suite('formatJsonOrJsonString', () => {
		test('formats a plain json object', () => {
			const result = formatJsonOrJsonString('{"a":1}');
			assert.ok(result);
			assert.strictEqual(result.sourceKind, 'json');
			assert.deepStrictEqual(JSON.parse(result.formatted), { a: 1 });
		});

		test('detects json string source', () => {
			const result = formatJsonOrJsonString(JSON.stringify('{"a":1}'));
			assert.ok(result);
			assert.strictEqual(result.sourceKind, 'json_str');
		});

		test('returns undefined for non-container json', () => {
			assert.strictEqual(formatJsonOrJsonString('42'), undefined);
			assert.strictEqual(formatJsonOrJsonString('"plain string"'), undefined);
		});

		test('returns undefined for invalid input', () => {
			assert.strictEqual(formatJsonOrJsonString('not json'), undefined);
			assert.strictEqual(formatJsonOrJsonString(''), undefined);
		});

		test('detects Python repr source at the top level', () => {
			const result = formatJsonOrJsonString("{'a': 1, 'b': True}");
			assert.ok(result);
			assert.strictEqual(result.sourceKind, 'python_str');
			assert.deepStrictEqual(JSON.parse(result.formatted), { a: 1, b: true });
		});

		test('formatted Python output is pretty-printed JSON', () => {
			const result = formatJsonOrJsonString("{'a': 1}");
			assert.ok(result);
			assert.ok(result.formatted.includes('\n'), 'expected pretty-printed multi-line output');
		});

		test('repairs JSON whose string values were wrapped mid-line in a terminal', () => {
			// Real-world paste from a console that broke a string literal
			// across lines. JSON.parse alone would reject this with "Bad
			// control character in string literal".
			const input = `{"request_id":"req-001","session":"{'token': 'abc123', 'expires_in': 3600,
  'roles':
    ['admin', 'user']}"}`;
			const result = formatJsonOrJsonString(input);
			assert.ok(result, 'expected the line-wrapped JSON to be repaired');
			assert.strictEqual(result.sourceKind, 'json_repaired');
			const parsed = JSON.parse(result.formatted);
			assert.strictEqual(parsed.request_id, 'req-001');
			// The session value still contains the inner Python repr text
			// verbatim (with real newlines now embedded as JS string newlines).
			assert.ok(parsed.session.startsWith("{'token': 'abc123'"));
		});

		test('clean JSON without in-string newlines stays sourceKind=json', () => {
			const result = formatJsonOrJsonString('{"a": 1, "b": [true, null]}');
			assert.ok(result);
			assert.strictEqual(result.sourceKind, 'json');
		});

		test('pretty-printed JSON (newlines only outside strings) stays sourceKind=json', () => {
			const result = formatJsonOrJsonString('{\n  "a": 1,\n  "b": 2\n}');
			assert.ok(result);
			assert.strictEqual(result.sourceKind, 'json');
		});

		test('repairs Python repr whose strings were wrapped mid-line in a terminal', () => {
			const input = "{'a': 'line1\nline2', 'b': 2}";
			const result = formatJsonOrJsonString(input);
			assert.ok(result);
			assert.strictEqual(result.sourceKind, 'python_str');
			assert.deepStrictEqual(JSON.parse(result.formatted), { a: 'line1\nline2', b: 2 });
		});
	});

	suite('stringifyJsonText', () => {
		test('stringifies a json object', () => {
			const result = stringifyJsonText('{"a":1}');
			assert.ok(result);
			assert.strictEqual(JSON.parse(JSON.parse(result)).a, 1);
		});

		test('returns undefined for primitives or invalid', () => {
			assert.strictEqual(stringifyJsonText('42'), undefined);
			assert.strictEqual(stringifyJsonText('bad'), undefined);
			assert.strictEqual(stringifyJsonText(''), undefined);
		});
	});

	suite('formatKeyPath', () => {
		test('empty path is root', () => {
			assert.strictEqual(formatKeyPath([]), 'root');
		});

		test('single object key', () => {
			assert.strictEqual(formatKeyPath(['payload']), 'payload');
		});

		test('nested object keys', () => {
			assert.strictEqual(formatKeyPath(['data', 'payload']), 'data.payload');
		});

		test('array index uses bracket notation', () => {
			assert.strictEqual(formatKeyPath(['items', 0]), 'items[0]');
			assert.strictEqual(formatKeyPath(['items', 2, 'config']), 'items[2].config');
		});

		test('top-level array index', () => {
			assert.strictEqual(formatKeyPath([0]), '[0]');
		});
	});

	suite('findNestedJsonStringsRaw', () => {
		test('detects nested json string in flat object', () => {
			const text = `{"id":1,"payload":${JSON.stringify(JSON.stringify({ user: 'zeke' }))}}`;
			const hits = findNestedJsonStringsRaw(text);
			assert.strictEqual(hits.length, 1);
			assert.strictEqual(hits[0].keyPath, 'payload');
			assert.deepStrictEqual(JSON.parse(hits[0].parsedText), { user: 'zeke' });
		});

		test('detects multiple nested json strings', () => {
			const a = JSON.stringify(JSON.stringify({ a: 1 }));
			const b = JSON.stringify(JSON.stringify([1, 2, 3]));
			const text = `{"first":${a},"second":${b}}`;
			const hits = findNestedJsonStringsRaw(text);
			assert.strictEqual(hits.length, 2);
			assert.deepStrictEqual(hits.map((h) => h.keyPath).sort(), ['first', 'second']);
		});

		test('skips strings whose content is a json primitive', () => {
			const text = `{"num":"42","bool":"true","str":"hello"}`;
			const hits = findNestedJsonStringsRaw(text);
			assert.strictEqual(hits.length, 0);
		});

		test('walks into nested objects', () => {
			const inner = JSON.stringify(JSON.stringify({ deep: true }));
			const text = `{"outer":{"inner":${inner}}}`;
			const hits = findNestedJsonStringsRaw(text);
			assert.strictEqual(hits.length, 1);
			assert.strictEqual(hits[0].keyPath, 'outer.inner');
		});

		test('walks into arrays with indices', () => {
			const inner = JSON.stringify(JSON.stringify({ k: 1 }));
			const text = `{"items":[null,${inner}]}`;
			const hits = findNestedJsonStringsRaw(text);
			assert.strictEqual(hits.length, 1);
			assert.strictEqual(hits[0].keyPath, 'items[1]');
		});

		test('returns empty for plain json with no nested strings', () => {
			const text = `{"a":1,"b":[1,2],"c":"plain"}`;
			const hits = findNestedJsonStringsRaw(text);
			assert.strictEqual(hits.length, 0);
		});

		test('returns empty for empty input', () => {
			assert.deepStrictEqual(findNestedJsonStringsRaw(''), []);
		});

		test('handles jsonc with comments gracefully', () => {
			const inner = JSON.stringify(JSON.stringify({ a: 1 }));
			const text = `{\n// a comment\n"payload":${inner}\n}`;
			const hits = findNestedJsonStringsRaw(text);
			assert.strictEqual(hits.length, 1);
			assert.strictEqual(hits[0].keyPath, 'payload');
		});

		test('hit offset/length cover entire quoted string literal', () => {
			const payload = JSON.stringify(JSON.stringify({ a: 1 }));
			const text = `{"payload":${payload}}`;
			const hits = findNestedJsonStringsRaw(text);
			assert.strictEqual(hits.length, 1);
			const slice = text.slice(hits[0].offset, hits[0].offset + hits[0].length);
			assert.strictEqual(slice, payload);
		});
	});

	suite('findStringValuesRaw', () => {
		test('returns all string values regardless of content', () => {
			const text = `{"name":"zeke","age":"30","empty":""}`;
			const hits = findStringValuesRaw(text);
			assert.strictEqual(hits.length, 3);
			assert.deepStrictEqual(hits.map((h) => h.keyPath).sort(), ['age', 'empty', 'name']);
			assert.strictEqual(hits.every((h) => h.parsedText === undefined), true);
		});

		test('marks json-parseable strings with parsedText', () => {
			const inner = JSON.stringify(JSON.stringify({ a: 1 }));
			const text = `{"plain":"hello","data":${inner}}`;
			const hits = findStringValuesRaw(text);
			assert.strictEqual(hits.length, 2);
			const plain = hits.find((h) => h.keyPath === 'plain');
			const data = hits.find((h) => h.keyPath === 'data');
			assert.ok(plain && data);
			assert.strictEqual(plain.parsedText, undefined);
			assert.strictEqual(plain.rawValue, 'hello');
			assert.ok(data.parsedText);
			assert.deepStrictEqual(JSON.parse(data.parsedText), { a: 1 });
		});

		test('exposes unescaped raw value', () => {
			const text = `{"msg":"line1\\nline2\\tindented"}`;
			const hits = findStringValuesRaw(text);
			assert.strictEqual(hits.length, 1);
			assert.strictEqual(hits[0].rawValue, 'line1\nline2\tindented');
		});

		test('walks into arrays of strings', () => {
			const text = `{"tags":["a","b","c"]}`;
			const hits = findStringValuesRaw(text);
			assert.strictEqual(hits.length, 3);
			assert.deepStrictEqual(hits.map((h) => h.keyPath), ['tags[0]', 'tags[1]', 'tags[2]']);
		});

		test('propagates sourceKind json on JSON-parseable string', () => {
			const inner = JSON.stringify(JSON.stringify({ a: 1 }));
			const text = `{"data":${inner}}`;
			const hits = findStringValuesRaw(text);
			assert.strictEqual(hits.length, 1);
			assert.strictEqual(hits[0].sourceKind, 'json');
			assert.ok(hits[0].parsedText);
		});

		test('propagates sourceKind python on Python repr string value', () => {
			const text = `{"log":"{'user':'alice','ok':True}"}`;
			const hits = findStringValuesRaw(text);
			assert.strictEqual(hits.length, 1);
			assert.strictEqual(hits[0].sourceKind, 'python');
			assert.ok(hits[0].parsedText);
			assert.deepStrictEqual(JSON.parse(hits[0].parsedText!), { user: 'alice', ok: true });
		});

		test('defaults sourceKind to json when no unwrap happened', () => {
			const text = `{"plain":"just a string"}`;
			const hits = findStringValuesRaw(text);
			assert.strictEqual(hits.length, 1);
			assert.strictEqual(hits[0].parsedText, undefined);
			assert.strictEqual(hits[0].sourceKind, 'json');
		});
	});
});
