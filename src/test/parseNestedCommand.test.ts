import * as assert from 'assert';
import {
	MAX_PENDING_OPENS,
	PendingOpen,
	sanitize,
	stashPendingOpen,
	takePendingOpen,
} from '../parseNestedCommand';

suite('parseNestedCommand', () => {
	suite('stashPendingOpen / takePendingOpen', () => {
		const sample = (content: string): PendingOpen => ({
			content,
			keyPath: 'data.items[0].config',
			kind: 'json',
		});

		test('round-trips a stashed payload by token', () => {
			const open = sample('{"a":1}');
			const token = stashPendingOpen(open);
			assert.deepStrictEqual(takePendingOpen(token), open);
		});

		test('returns a distinct token per stash', () => {
			const t1 = stashPendingOpen(sample('one'));
			const t2 = stashPendingOpen(sample('two'));
			assert.notStrictEqual(t1, t2);
			assert.strictEqual(takePendingOpen(t1)?.content, 'one');
			assert.strictEqual(takePendingOpen(t2)?.content, 'two');
		});

		test('does not consume on read (a link can be clicked more than once)', () => {
			const token = stashPendingOpen(sample('keep'));
			assert.strictEqual(takePendingOpen(token)?.content, 'keep');
			assert.strictEqual(takePendingOpen(token)?.content, 'keep');
		});

		test('returns undefined for an unknown token', () => {
			assert.strictEqual(takePendingOpen('definitely-not-a-token'), undefined);
		});

		test('evicts the oldest entry once past the LRU bound', () => {
			const first = stashPendingOpen(sample('oldest'));
			// Stash strictly more than the bound so `first` is guaranteed evicted.
			for (let i = 0; i < MAX_PENDING_OPENS; i++) {
				stashPendingOpen(sample(`fill-${i}`));
			}
			assert.strictEqual(takePendingOpen(first), undefined);
		});

		test('keeps the most recent entry after eviction', () => {
			let lastToken = '';
			for (let i = 0; i <= MAX_PENDING_OPENS; i++) {
				lastToken = stashPendingOpen(sample(`recent-${i}`));
			}
			assert.strictEqual(
				takePendingOpen(lastToken)?.content,
				`recent-${MAX_PENDING_OPENS}`
			);
		});
	});

	suite('sanitize', () => {
		test('replaces filesystem-unfriendly chars with underscore', () => {
			assert.strictEqual(sanitize('data.commands[6].desc'), 'data.commands_6_.desc');
		});

		test('keeps safe chars (alnum . _ -) intact', () => {
			assert.strictEqual(sanitize('a.b_c-d.0'), 'a.b_c-d.0');
		});

		test('falls back to "root" for an empty string', () => {
			assert.strictEqual(sanitize(''), 'root');
		});

		test('falls back to "root" for undefined (defensive guard against URI arg loss)', () => {
			assert.strictEqual(sanitize(undefined), 'root');
		});
	});
});
