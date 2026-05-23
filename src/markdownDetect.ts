/**
 * Heuristic detector for whether a plain string value is best rendered as
 * Markdown or as plain text. Used by the hover provider to choose how to
 * present string values that aren't JSON-parseable.
 *
 * The detector requires either:
 *   - one "strong" Markdown marker (fenced code, image, table), or
 *   - the sum of weak markers (heading, link, list, etc.) reaching the
 *     score threshold.
 *
 * A single isolated heading-like line or single bullet would otherwise
 * misclassify any prose that happens to start with "#" or "-".
 */

export type PlainStringFormat = 'markdown' | 'text';

const MARKDOWN_MIN_LENGTH = 20;
const MARKDOWN_MIN_SCORE = 2;

const STRONG_MARKDOWN_PATTERNS: RegExp[] = [
	/```[\s\S]*?```/,                                  // fenced code block
	/!\[[^\]]*\]\([^)\s]+\)/,                          // image
	/^\|.+\|\s*\r?\n\|[\s:|-]+\|/m,                    // table header + separator
];

const WEAK_MARKDOWN_PATTERNS: RegExp[] = [
	/^#{1,6}\s+\S/m,                                   // ATX heading
	/\[[^\]\n]+\]\([^)\s]+\)/,                         // inline link
	/^>\s+\S/m,                                        // blockquote
	/^---+$/m,                                         // horizontal rule
	/\*\*[^*\n]+\*\*/,                                 // bold
	/(?<!\w)__[^_\n]+__(?!\w)/,                        // bold (underscore)
	/^[-*+]\s+\S.*(?:\r?\n[-*+]\s+\S.*){1,}/m,         // multi-item bullet list
	/^\d+\.\s+\S.*(?:\r?\n\d+\.\s+\S.*){1,}/m,         // multi-item ordered list
];

export function detectStringFormat(value: string): PlainStringFormat {
	if (value.length < MARKDOWN_MIN_LENGTH) {
		return 'text';
	}

	let score = 0;
	for (const re of STRONG_MARKDOWN_PATTERNS) {
		if (re.test(value)) {
			score += 2;
		}
	}
	for (const re of WEAK_MARKDOWN_PATTERNS) {
		if (re.test(value)) {
			score += 1;
		}
	}

	return score >= MARKDOWN_MIN_SCORE ? 'markdown' : 'text';
}
