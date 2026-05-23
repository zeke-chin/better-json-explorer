import * as vscode from 'vscode';
import { findStringValues, StringValueHit } from './jsonUtils';
import { detectStringFormat } from './markdownDetect';
import { OpenKind, PARSE_COMMAND_ID } from './parseNestedCommand';

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
			const isPython = hit.sourceKind === 'python';
			const sourceLabel = isPython ? 'Parsed Python dict' : 'Parsed JSON';
			const kind: OpenKind = isPython ? 'python' : 'json';
			md.appendMarkdown(`**${sourceLabel}** \`${escapeMarkdown(hit.keyPath)}\`\n\n`);
			md.appendCodeblock(hit.parsedText, 'json');
			md.appendMarkdown(`\n\n${buildOpenLink(hit.parsedText, hit.keyPath, kind)}`);
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
		: kind === 'python' ? '▸ Open parsed Python dict in side panel'
		: kind === 'markdown' ? '▸ Open markdown in side panel'
		: '▸ Open value in side panel';
	return `[${label}](command:${PARSE_COMMAND_ID}?${args})`;
}

function escapeMarkdown(text: string): string {
	return text.replace(/`/g, '\\`');
}
