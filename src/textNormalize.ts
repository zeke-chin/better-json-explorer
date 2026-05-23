/**
 * Repair input text that copied from a terminal got broken mid-string by a
 * line wrap. Real newline characters that fall inside a quoted literal are
 * replaced with the `\n` escape sequence so JSON.parse / pythonReprToJson
 * can accept the input.
 *
 * Newlines OUTSIDE strings are valid whitespace and are preserved as-is —
 * Python and JSON both accept them between tokens.
 *
 * The scanner recognizes both `"..."` (JSON / Python) and `'...'` (Python)
 * literals. Backslash escapes (`\"`, `\'`, `\\`) are honored so that an
 * escaped quote does not falsely close a string.
 *
 * Limitations:
 * - Python triple-quoted strings (`'''...'''` / `"""..."""`) are not
 *   recognized. Inputs whose top level contains them may be miscounted.
 *   In practice repr() output never uses triple quotes, so this is fine.
 */

export function escapeQuotedLineBreaks(input: string): string {
	// Fast path: nothing to fix if no real line breaks anywhere.
	if (input.indexOf('\n') < 0 && input.indexOf('\r') < 0) {
		return input;
	}

	let output = '';
	let inString: '"' | "'" | null = null;
	let escape = false;

	for (let i = 0; i < input.length; i++) {
		const c = input[i];

		if (inString !== null) {
			if (escape) {
				output += c;
				escape = false;
				continue;
			}
			if (c === '\\') {
				output += c;
				escape = true;
				continue;
			}
			if (c === inString) {
				output += c;
				inString = null;
				continue;
			}
			if (c === '\n' || c === '\r') {
				// Treat CRLF as a single line break to avoid emitting `\n\n`.
				if (c === '\r' && input[i + 1] === '\n') {
					i++;
				}
				output += '\\n';
				continue;
			}
			output += c;
			continue;
		}

		// Outside any string: real newlines are valid whitespace and are
		// preserved verbatim. Just track quote opens.
		if (c === '"' || c === "'") {
			inString = c as '"' | "'";
		}
		output += c;
	}

	return output;
}
