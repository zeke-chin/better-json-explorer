import * as assert from 'assert';
import { closeDanglingCodeFence } from '../hoverProvider';

suite('hoverProvider', () => {
	suite('closeDanglingCodeFence', () => {
		test('leaves fence-free text unchanged', () => {
			assert.strictEqual(closeDanglingCodeFence('hello world'), 'hello world');
		});

		test('leaves balanced fences unchanged', () => {
			const md = 'text\n```json\n{"a":1}\n```\nmore';
			assert.strictEqual(closeDanglingCodeFence(md), md);
		});

		test('closes a single dangling fence (preview truncated mid code block)', () => {
			const md = 'text\n```json\n{"a":1}';
			assert.strictEqual(closeDanglingCodeFence(md), `${md}\n\`\`\``);
		});

		test('closes when the opening fence carries a language tag', () => {
			const md = '```ts\nconst x = 1;';
			assert.strictEqual(closeDanglingCodeFence(md), `${md}\n\`\`\``);
		});

		test('only counts fences at line start (inline backticks are ignored)', () => {
			const md = 'inline ``` not a fence';
			assert.strictEqual(closeDanglingCodeFence(md), md);
		});
	});
});
