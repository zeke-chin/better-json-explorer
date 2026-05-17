import * as assert from 'assert';
import {
	detectStringFormat,
	findNestedJsonStringsRaw,
	findStringValuesRaw,
	formatJsonOrJsonString,
	formatKeyPath,
	isJsonContainer,
	stringifyJsonText,
	tryUnwrapJsonString,
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
	});

	suite('detectStringFormat', () => {
		test('short string is text', () => {
			assert.strictEqual(detectStringFormat('hello world'), 'text');
		});

		test('plain prose without markdown markers is text', () => {
			assert.strictEqual(
				detectStringFormat('This is a longer paragraph of plain prose with multiple words.'),
				'text'
			);
		});

		test('code-like content is text', () => {
			const code = 'function foo() {\n  return 1 + 2;\n}\nfoo();';
			assert.strictEqual(detectStringFormat(code), 'text');
		});

		test('heading + list is markdown', () => {
			const md = '## API Reference\n\n- foo\n- bar\n- baz';
			assert.strictEqual(detectStringFormat(md), 'markdown');
		});

		test('fenced code block is markdown', () => {
			const md = 'Example:\n\n```ts\nconst x = 1;\n```';
			assert.strictEqual(detectStringFormat(md), 'markdown');
		});

		test('heading + inline link is markdown', () => {
			const md = '# Title\n\nSee [docs](https://example.com).';
			assert.strictEqual(detectStringFormat(md), 'markdown');
		});

		test('image embed is markdown', () => {
			const md = '![alt text](https://example.com/img.png) caption';
			assert.strictEqual(detectStringFormat(md), 'markdown');
		});

		test('table is markdown', () => {
			const md = '| a | b |\n|---|---|\n| 1 | 2 |';
			assert.strictEqual(detectStringFormat(md), 'markdown');
		});

		test('single heading-like line is not markdown', () => {
			const ini = '# Configuration\nport=8080\nhost=localhost';
			assert.strictEqual(detectStringFormat(ini), 'text');
		});

		test('single bullet line is not markdown', () => {
			assert.strictEqual(detectStringFormat('- just one bullet line here for sure'), 'text');
		});
	});
});
