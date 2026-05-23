/**
 * Python repr literal → JSON text converter.
 *
 * Covers the `ast.literal_eval` subset: dict / list / tuple / str / int /
 * float / True / False / None. Anything outside that subset (function calls,
 * object references, bytes literals, set literals, complex numbers) causes
 * the converter to return `undefined` for the entire input — no partial
 * conversion.
 */

export type PythonReprResult = { json: string };

type State = {
	input: string;
	pos: number;
};

const WHITESPACE = new Set([' ', '\t', '\n', '\r']);

// Python escape character → resolved character (single-char escapes only).
const SIMPLE_ESCAPES: Record<string, string> = {
	'\\': '\\',
	"'": "'",
	'"': '"',
	'n': '\n',
	'r': '\r',
	't': '\t',
	'b': '\b',
	'f': '\f',
	'0': '\0',
	'a': '\x07',
	'v': '\x0B',
};

export function pythonReprToJson(input: string): PythonReprResult | undefined {
	// No upfront sniff: callers always try JSON.parse first, so we only see
	// inputs that JSON rejected. The parser itself early-exits on any
	// non-literal character via parseValue, which is just as cheap.
	const state: State = { input, pos: 0 };
	skipWhitespace(state);
	if (eof(state)) {
		return undefined;
	}

	const json = parseValue(state);
	if (json === undefined) {
		return undefined;
	}

	skipWhitespace(state);
	if (!eof(state)) {
		// Trailing junk — reject the entire input.
		return undefined;
	}

	return { json };
}

function peek(s: State, offset = 0): string {
	return s.input[s.pos + offset] ?? '';
}

function advance(s: State): string {
	const c = s.input[s.pos];
	s.pos++;
	return c;
}

function eof(s: State): boolean {
	return s.pos >= s.input.length;
}

function skipWhitespace(s: State): void {
	while (s.pos < s.input.length && WHITESPACE.has(s.input[s.pos])) {
		s.pos++;
	}
}

function isDigit(c: string): boolean {
	return c >= '0' && c <= '9';
}

function isIdentStart(c: string): boolean {
	return (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || c === '_';
}

function isIdentPart(c: string): boolean {
	return isIdentStart(c) || isDigit(c);
}

function parseValue(s: State): string | undefined {
	skipWhitespace(s);
	if (eof(s)) {
		return undefined;
	}

	const c = peek(s);
	if (c === '{') {
		return parseDict(s);
	}
	if (c === '[') {
		return parseSequence(s, '[', ']');
	}
	if (c === '(') {
		return parseSequence(s, '(', ')');
	}
	if (c === "'" || c === '"') {
		return parseString(s);
	}
	if (c === '-' || c === '+' || isDigit(c) || c === '.') {
		return parseNumber(s);
	}
	if (isIdentStart(c)) {
		return parseIdentifier(s);
	}
	return undefined;
}

function parseString(s: State): string | undefined {
	const quote = advance(s);

	let isTriple = false;
	if (peek(s) === quote && peek(s, 1) === quote) {
		advance(s);
		advance(s);
		isTriple = true;
	}

	let value = '';

	while (!eof(s)) {
		const c = peek(s);

		if (c === quote) {
			if (isTriple) {
				if (peek(s, 1) === quote && peek(s, 2) === quote) {
					advance(s);
					advance(s);
					advance(s);
					return JSON.stringify(value);
				}
				value += advance(s);
				continue;
			}
			advance(s);
			return JSON.stringify(value);
		}

		if (c === '\\') {
			advance(s);
			if (eof(s)) {
				return undefined;
			}
			const next = advance(s);

			if (next === 'x') {
				const hex = s.input.slice(s.pos, s.pos + 2);
				if (!/^[0-9a-fA-F]{2}$/.test(hex)) {
					return undefined;
				}
				s.pos += 2;
				value += String.fromCharCode(parseInt(hex, 16));
				continue;
			}
			if (next === 'u') {
				const hex = s.input.slice(s.pos, s.pos + 4);
				if (!/^[0-9a-fA-F]{4}$/.test(hex)) {
					return undefined;
				}
				s.pos += 4;
				value += String.fromCharCode(parseInt(hex, 16));
				continue;
			}
			if (next === '\n') {
				// Line continuation inside source — drop it.
				continue;
			}
			if (SIMPLE_ESCAPES[next] !== undefined) {
				value += SIMPLE_ESCAPES[next];
				continue;
			}
			// Unknown escape — reject rather than guess.
			return undefined;
		}

		if (!isTriple && (c === '\n' || c === '\r')) {
			// Single-quoted strings must not contain raw newlines.
			return undefined;
		}

		value += advance(s);
	}

	// Unterminated string literal.
	return undefined;
}

function parseNumber(s: State): string | undefined {
	const start = s.pos;
	if (peek(s) === '-' || peek(s) === '+') {
		advance(s);
	}

	let digitsBeforeDot = 0;
	while (!eof(s) && isDigit(peek(s))) {
		advance(s);
		digitsBeforeDot++;
	}

	let hasDot = false;
	let digitsAfterDot = 0;
	if (peek(s) === '.') {
		hasDot = true;
		advance(s);
		while (!eof(s) && isDigit(peek(s))) {
			advance(s);
			digitsAfterDot++;
		}
	}

	if (digitsBeforeDot === 0 && digitsAfterDot === 0) {
		return undefined;
	}

	if (peek(s) === 'e' || peek(s) === 'E') {
		advance(s);
		if (peek(s) === '+' || peek(s) === '-') {
			advance(s);
		}
		let expDigits = 0;
		while (!eof(s) && isDigit(peek(s))) {
			advance(s);
			expDigits++;
		}
		if (expDigits === 0) {
			return undefined;
		}
	}

	let raw = s.input.slice(start, s.pos);

	// Normalize for JSON compatibility:
	//  - drop leading `+` (JSON disallows)
	//  - add 0 before/after stray dot ("1." → "1.0", ".5" → "0.5")
	if (raw.startsWith('+')) {
		raw = raw.slice(1);
	}
	if (raw.startsWith('-.')) {
		raw = '-0' + raw.slice(1);
	} else if (raw.startsWith('.')) {
		raw = '0' + raw;
	}
	if (hasDot && digitsAfterDot === 0) {
		// "1." → "1.0"; matches whether or not an exponent follows because
		// the dot must be immediately followed by an exponent marker if so,
		// which we would have caught above. Insert before the exponent.
		const ePos = raw.search(/[eE]/);
		if (ePos === -1) {
			raw = raw + '0';
		} else {
			raw = raw.slice(0, ePos) + '0' + raw.slice(ePos);
		}
	}

	return raw;
}

function parseIdentifier(s: State): string | undefined {
	const start = s.pos;
	while (!eof(s) && isIdentPart(peek(s))) {
		advance(s);
	}
	const ident = s.input.slice(start, s.pos);
	if (ident === 'True') {
		return 'true';
	}
	if (ident === 'False') {
		return 'false';
	}
	if (ident === 'None') {
		return 'null';
	}
	// Other identifiers (datetime, UUID, custom classes, …) are unsupported.
	return undefined;
}

function parseSequence(s: State, openChar: string, closeChar: string): string | undefined {
	if (advance(s) !== openChar) {
		return undefined;
	}

	const items: string[] = [];
	skipWhitespace(s);

	if (peek(s) === closeChar) {
		advance(s);
		return '[]';
	}

	while (true) {
		const item = parseValue(s);
		if (item === undefined) {
			return undefined;
		}
		items.push(item);

		skipWhitespace(s);
		const next = peek(s);
		if (next === ',') {
			advance(s);
			skipWhitespace(s);
			// Trailing comma is allowed.
			if (peek(s) === closeChar) {
				advance(s);
				return '[' + items.join(',') + ']';
			}
			continue;
		}
		if (next === closeChar) {
			advance(s);
			return '[' + items.join(',') + ']';
		}
		return undefined;
	}
}

function parseDict(s: State): string | undefined {
	advance(s); // {
	skipWhitespace(s);

	if (peek(s) === '}') {
		advance(s);
		return '{}';
	}

	const pairs: string[] = [];

	while (true) {
		const key = parseValue(s);
		if (key === undefined) {
			return undefined;
		}
		// Dict keys must be strings for JSON compatibility. Set literals
		// ({1, 2, 3}) and dicts with non-string keys ({1: 'a'}) are rejected.
		if (!key.startsWith('"')) {
			return undefined;
		}

		skipWhitespace(s);
		if (peek(s) !== ':') {
			return undefined;
		}
		advance(s);

		const value = parseValue(s);
		if (value === undefined) {
			return undefined;
		}
		pairs.push(key + ':' + value);

		skipWhitespace(s);
		const next = peek(s);
		if (next === ',') {
			advance(s);
			skipWhitespace(s);
			if (peek(s) === '}') {
				advance(s);
				return '{' + pairs.join(',') + '}';
			}
			continue;
		}
		if (next === '}') {
			advance(s);
			return '{' + pairs.join(',') + '}';
		}
		return undefined;
	}
}
