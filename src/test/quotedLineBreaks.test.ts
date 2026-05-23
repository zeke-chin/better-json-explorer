import * as assert from 'assert';
import { escapeQuotedLineBreaks } from '../inputRepair/quotedLineBreaks';

suite('escapeQuotedLineBreaks', () => {
	test('returns input unchanged when no line breaks present (fast path)', () => {
		const input = '{"a":1,"b":[1,2,3]}';
		assert.strictEqual(escapeQuotedLineBreaks(input), input);
	});

	test('returns input unchanged when newlines are outside any string', () => {
		const input = '{\n  "a": 1,\n  "b": 2\n}';
		// Real newlines between tokens are valid JSON whitespace.
		assert.strictEqual(escapeQuotedLineBreaks(input), input);
	});

	test('escapes a real newline inside a double-quoted JSON string', () => {
		const input = '{"a":"line1\nline2"}';
		const out = escapeQuotedLineBreaks(input);
		assert.strictEqual(out, '{"a":"line1\\nline2"}');
		// And the result is now valid JSON:
		const parsed = JSON.parse(out);
		assert.strictEqual(parsed.a, 'line1\nline2');
	});

	test('escapes multiple real newlines in same string', () => {
		const input = '{"a":"l1\nl2\nl3"}';
		const out = escapeQuotedLineBreaks(input);
		assert.strictEqual(out, '{"a":"l1\\nl2\\nl3"}');
	});

	test('treats CRLF as a single line break', () => {
		const input = '{"a":"l1\r\nl2"}';
		const out = escapeQuotedLineBreaks(input);
		assert.strictEqual(out, '{"a":"l1\\nl2"}');
	});

	test('treats standalone CR as a line break', () => {
		const input = '{"a":"l1\rl2"}';
		const out = escapeQuotedLineBreaks(input);
		assert.strictEqual(out, '{"a":"l1\\nl2"}');
	});

	test('honors escaped quote inside string (does not close prematurely)', () => {
		// JSON: { "a": "He said \"hi\"\nbye" }  ← real newline mid-string
		const input = '{"a":"He said \\"hi\\"\nbye"}';
		const out = escapeQuotedLineBreaks(input);
		assert.strictEqual(JSON.parse(out).a, 'He said "hi"\nbye');
	});

	test('honors escaped backslash followed by quote', () => {
		// String value is `path\` then end. The escaped backslash should not
		// flag the following `"` as escaped.
		const input = '{"a":"path\\\\","b":"x\nx"}';
		const out = escapeQuotedLineBreaks(input);
		const parsed = JSON.parse(out);
		assert.strictEqual(parsed.a, 'path\\');
		assert.strictEqual(parsed.b, 'x\nx');
	});

	test('recognizes single-quoted strings (Python repr)', () => {
		const input = "{'a': 'line1\nline2'}";
		const out = escapeQuotedLineBreaks(input);
		assert.strictEqual(out, "{'a': 'line1\\nline2'}");
	});

	test('mixed: JSON outer, Python repr inner — both quote kinds tracked', () => {
		// Outer JSON value is a Python repr string; the real newline is
		// inside the outer double-quoted JSON string.
		const input = `{"log":"{'a': 1,\n  'b': 2}"}`;
		const out = escapeQuotedLineBreaks(input);
		// JSON.parse succeeds; inner value still has its real newline preserved
		// in the unescaped string content (\n turns back into a real newline).
		const parsed = JSON.parse(out);
		assert.strictEqual(parsed.log, "{'a': 1,\n  'b': 2}");
	});

	test('user-reported case: JSON with line-wrapped Python repr values', () => {
		const input = `{"request_id":"req-001","session":"{'token': 'abc123', 'expires_in': 3600,
  'roles':
    ['admin', 'user']}"}`;
		const out = escapeQuotedLineBreaks(input);
		const parsed = JSON.parse(out);
		assert.strictEqual(parsed.request_id, 'req-001');
		// Inner Python repr is preserved with its line breaks (now as real \n
		// in the JS string value):
		assert.ok(parsed.session.startsWith("{'token': 'abc123'"));
		assert.ok(parsed.session.includes('\n'));
	});

	test('does not touch real newlines that appear between top-level tokens', () => {
		const input = `{"a":\n  "x",\n  "b": "y\nz"}`;
		const out = escapeQuotedLineBreaks(input);
		const parsed = JSON.parse(out);
		assert.strictEqual(parsed.a, 'x');
		assert.strictEqual(parsed.b, 'y\nz');
	});

	test('empty input passes through fast path', () => {
		assert.strictEqual(escapeQuotedLineBreaks(''), '');
	});
});
