import * as vscode from 'vscode';
import { findStringValues, StringValueHit } from './jsonUtils';
import { detectStringFormat } from './markdownDetect';
import { OpenKind, PARSE_BY_TOKEN_COMMAND_ID, stashPendingOpen } from './parseNestedCommand';

export class NestedJsonHoverProvider implements vscode.HoverProvider {
	provideHover(
		document: vscode.TextDocument,
		position: vscode.Position
	): vscode.ProviderResult<vscode.Hover> {
		const hits = findStringValues(document);
		const hit = findHit(hits, position);
		if (!hit) {
			return undefined;
		}

		const md = new vscode.MarkdownString();
		md.isTrusted = { enabledCommands: [PARSE_BY_TOKEN_COMMAND_ID] };

		if (hit.parsedText !== undefined) {
			const isPython = hit.sourceKind === 'python';
			const sourceLabel = isPython ? 'Parsed Python dict' : 'Parsed JSON';
			const kind: OpenKind = isPython ? 'python' : 'json';
			const { preview, truncatedNote } = truncateForPreview(hit.parsedText);
			const link = buildOpenLink(hit.parsedText, hit.keyPath, kind);
			md.appendMarkdown(`**${sourceLabel}** \`${escapeMarkdown(hit.keyPath)}\`\n\n`);
			md.appendMarkdown(`${link}\n\n`);
			md.appendCodeblock(preview, 'json');
			md.appendMarkdown(truncatedNote);
			md.appendMarkdown(`\n\n${link}`);
			return new vscode.Hover(md, hit.range);
		}

		const format = detectStringFormat(hit.rawValue);
		const { preview, truncatedNote } = truncateForPreview(hit.rawValue);
		if (format === 'markdown') {
			const link = buildOpenLink(hit.rawValue, hit.keyPath, 'markdown');
			md.appendMarkdown(`**Markdown** \`${escapeMarkdown(hit.keyPath)}\`\n\n`);
			md.appendMarkdown(`${link}\n\n---\n\n`);
			md.appendMarkdown(closeDanglingCodeFence(preview));
			md.appendMarkdown(truncatedNote);
			md.appendMarkdown(`\n\n---\n\n${link}`);
		} else {
			const link = buildOpenLink(hit.rawValue, hit.keyPath, 'text');
			md.appendMarkdown(`**String value** \`${escapeMarkdown(hit.keyPath)}\`\n\n`);
			md.appendMarkdown(`${link}\n\n`);
			md.appendCodeblock(preview, '');
			md.appendMarkdown(truncatedNote);
			md.appendMarkdown(`\n\n${link}`);
		}

		return new vscode.Hover(md, hit.range);
	}
}

function findHit(hits: StringValueHit[], position: vscode.Position): StringValueHit | undefined {
	return hits.find((hit) => hit.range.contains(position));
}

const MAX_PREVIEW_CHARS = 2000;

/**
 * Keep the hover popup small. For large values we render only the head and add
 * a note; the full content is still reachable via the side-panel link, which
 * carries the complete value rather than this preview.
 */
function truncateForPreview(text: string): { preview: string; truncatedNote: string } {
	if (text.length <= MAX_PREVIEW_CHARS) {
		return { preview: text, truncatedNote: '' };
	}
	const omitted = text.length - MAX_PREVIEW_CHARS;
	return {
		preview: text.slice(0, MAX_PREVIEW_CHARS),
		truncatedNote: `\n\n_… 预览已截断，省略 ${omitted} 字符。点击链接在侧边栏查看完整内容。_`,
	};
}

/**
 * A truncated (or malformed) markdown preview can leave a ``` code fence open,
 * which would swallow everything appended after it — including the footer
 * "open" link, rendering it as literal text instead of a clickable command.
 * Balancing the fences lets the trailing content escape the code block.
 */
export function closeDanglingCodeFence(markdown: string): string {
	const fences = markdown.match(/^```/gm);
	if (fences && fences.length % 2 !== 0) {
		return `${markdown}\n\`\`\``;
	}
	return markdown;
}

function buildOpenLink(content: string, keyPath: string, kind: OpenKind): string {
	// Stash the full content and embed only a short token: a large value would
	// otherwise blow past the hover renderer's command-URI size limit, and the
	// command would then fire with all arguments undefined.
	const token = stashPendingOpen({ content, keyPath, kind });
	const args = encodeURIComponent(JSON.stringify([token]));
	const label =
		kind === 'json' ? '▸ Open parsed JSON in side panel'
		: kind === 'python' ? '▸ Open parsed Python dict in side panel'
		: kind === 'markdown' ? '▸ Open markdown in side panel'
		: '▸ Open value in side panel';
	return `[${label}](command:${PARSE_BY_TOKEN_COMMAND_ID}?${args})`;
}

function escapeMarkdown(text: string): string {
	return text.replace(/`/g, '\\`');
}
