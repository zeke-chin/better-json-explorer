import * as assert from 'assert';
import { detectStringFormat } from '../markdownDetect';

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
