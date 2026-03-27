import { HighlightStyle } from '@codemirror/language';
import { tags } from '@lezer/highlight';

const customTags = {
	pageLine    : 'pageLine', // .cm-pageLine
	snippetLine : 'snippetLine', // .cm-snippetLine
};

export function legacyTokenizeCustomMarkdown(text) {
	const tokens = [];
	const lines = text.split('\n');

	lines.forEach((lineText, lineNumber)=>{
		// --- Page / snippet lines ---
		if(/^(?=\\page(?:break)?(?: *{[^\n{}]*})?$)/m.test(lineText)) tokens.push({ line: lineNumber, type: customTags.pageLine });
		if(/^\\snippet\ .*$/.test(lineText)) tokens.push({ line: lineNumber, type: customTags.snippetLine });
	});

	return tokens;
}

export const legacyCustomHighlightStyle = HighlightStyle.define([
	{ tag: tags.heading1, color: '#000', fontWeight: '700' },
	{ tag: tags.keyword, color: '#07a' }, // example for your markdown headings
	{ tag: customTags.pageLine, color: '#f0a' },
	{ tag: customTags.snippetLine, class: 'cm-snippetLine', color: '#0af' },
]);

