import * as vscode from 'vscode';
import { detectStringFormat, findStringValues, StringValueHit } from './jsonUtils';
import { PARSE_COMMAND_ID } from './codeLensProvider';

export type OpenKind = 'json' | 'text' | 'markdown';

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
		md.isTrusted = { enabledCommands: [PARSE_COMMAND_ID] };

		if (hit.parsedText !== undefined) {
			md.appendMarkdown(`**Parsed JSON** \`${escapeMarkdown(hit.keyPath)}\`\n\n`);
			md.appendCodeblock(hit.parsedText, 'json');
			md.appendMarkdown(`\n\n${buildOpenLink(hit.parsedText, hit.keyPath, 'json')}`);
			return new vscode.Hover(md, hit.range);
		}

		const format = detectStringFormat(hit.rawValue);
		if (format === 'markdown') {
			md.appendMarkdown(`**Markdown** \`${escapeMarkdown(hit.keyPath)}\`\n\n`);
			md.appendMarkdown(hit.rawValue);
			md.appendMarkdown(`\n\n---\n\n${buildOpenLink(hit.rawValue, hit.keyPath, 'markdown')}`);
		} else {
			md.appendMarkdown(`**String value** \`${escapeMarkdown(hit.keyPath)}\`\n\n`);
			md.appendCodeblock(hit.rawValue, '');
			md.appendMarkdown(`\n\n${buildOpenLink(hit.rawValue, hit.keyPath, 'text')}`);
		}

		return new vscode.Hover(md, hit.range);
	}
}

function findHit(hits: StringValueHit[], position: vscode.Position): StringValueHit | undefined {
	return hits.find((hit) => hit.range.contains(position));
}

function buildOpenLink(content: string, keyPath: string, kind: OpenKind): string {
	const args = encodeURIComponent(JSON.stringify([content, keyPath, kind]));
	const label =
		kind === 'json' ? '▸ Open parsed JSON in side panel'
		: kind === 'markdown' ? '▸ Open markdown in side panel'
		: '▸ Open value in side panel';
	return `[${label}](command:${PARSE_COMMAND_ID}?${args})`;
}

function escapeMarkdown(text: string): string {
	return text.replace(/`/g, '\\`');
}
