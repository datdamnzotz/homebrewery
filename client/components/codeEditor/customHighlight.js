import { HighlightStyle } from '@codemirror/language';
import { tags } from '@lezer/highlight';

// Making the tokens
const customTags = {
	pageLine        : 'pageLine', 		// .cm-pageLine
	snippetLine     : 'snippetLine', 	// .cm-snippetLine
	columnSplit     : 'columnSplit', 	// .cm-columnSplit
	block           : 'block', 			// .cm-block
	inlineBlock     : 'inline-block', 	// .cm-inline-block
	injection       : 'injection', 		// .cm-injection
	emoji           : 'emoji', 			// .cm-emoji
	superscript     : 'superscript', 	// .cm-superscript
	subscript       : 'subscript', 		// .cm-subscript
	definitionList  : 'definitionList', // .cm-definitionList
	definitionTerm  : 'definitionTerm', // .cm-definitionTerm
	definitionDesc  : 'definitionDesc', // .cm-definitionDesc
	definitionColon : 'definitionColon', // .cm-definitionColon
};

export function tokenizeCustomMarkdown(text) {
	const tokens = [];
	const lines = text.split('\n');

	console.log(tags);
	lines.forEach((lineText, lineNumber)=>{
		// --- Page / snippet lines ---
		if(/^(?=\\page(?:break)?(?: *{[^\n{}]*})?$)/m.test(lineText)) tokens.push({ line: lineNumber, type: customTags.pageLine });
		if(/^\\snippet\ .*$/.test(lineText)) tokens.push({ line: lineNumber, type: customTags.snippetLine });
		if(/^\\column(?:break)?$/.test(lineText)) tokens.push({ line: lineNumber, type: customTags.columnSplit });

		// --- Emoji ---
		if(/:.\w+?:/.test(lineText)) {
			const emojiRegex = /(:\w+?:)/g;
			let match;
			while ((match = emojiRegex.exec(lineText)) !== null) {
				tokens.push({
					line : lineNumber,
					type : customTags.emoji,
					from : match.index,
					to   : match.index + match[0].length,
				});
			}
		}

		// --- Superscript / Subscript ---
		if(/\^/.test(lineText)) {
			let startIndex = lineText.indexOf('^');
			const superRegex = /\^(?!\s)(?=([^\n\^]*[^\s\^]))\1\^/gy;
			const subRegex = /\^\^(?!\s)(?=([^\n\^]*[^\s\^]))\1\^\^/gy;

			while (startIndex >= 0) {
				superRegex.lastIndex = subRegex.lastIndex = startIndex;

				let match = subRegex.exec(lineText);
				let type = customTags.subscript;

				if(!match) {
					match = superRegex.exec(lineText);
					type = customTags.superscript;
				}

				if(match) {
					tokens.push({
						line : lineNumber,
						type,
						from : match.index,
						to   : match.index + match[0].length,
					});
				}

				startIndex = lineText.indexOf(
					'^',
					Math.max(startIndex + 1, superRegex.lastIndex || 0, subRegex.lastIndex || 0),
				);
			}
		}

		// --- inline definition lists ---
		if(/::/.test(lineText)) {
			if(/^:*$/.test(lineText) == true) {
				return; //if line only has colons, stops
			}

			const singleLineRegex = /^([^:\n]*\S)(::)([^\n]*)$/dmy;

			const match = singleLineRegex.exec(lineText);

			if(match) {
				const [full, term, colons, desc] = match;
				let offset = 0;
				// Entire line as definitionList
				tokens.push({
					line : lineNumber,
					type : customTags.definitionList,
				});

				// Term
				tokens.push({
					line : lineNumber,
					type : customTags.definitionTerm,
					from : offset,
					to   : offset + term.length,
				});
				offset += term.length;

				// ::
				tokens.push({
					line : lineNumber,
					type : customTags.definitionColon,
					from : offset,
					to   : offset + colons.length,
				});
				offset += colons.length;

				// Definition
				tokens.push({
					line : lineNumber,
					type : customTags.definitionDesc,
					from : offset,
					to   : offset + desc.length,
				});

				return;
			}
		}

		// multiline def list
		if(!/^::/.test(lines[lineNumber]) && lineNumber + 1 < lines.length && /^::/.test(lines[lineNumber + 1])) {
			const startLine = lineNumber;
			const defs = [];
			let endLine = startLine;

			// collect all following :: definitions
			for (let i = lineNumber + 1; i < lines.length; i++) {
				const nextLine = lines[i];
				const onlyColonsMatch = /^:*$/.test(nextLine);
				const defMatch = /^(::)(.*\S.*)?\s*$/.exec(nextLine);
				if(!onlyColonsMatch && defMatch) {
					defs.push({ colons: defMatch[1], desc: defMatch[2], line: i });
					endLine = i;
				} else break;
			}

			if(defs.length > 0) {
				tokens.push({
					line : startLine,
					type : customTags.definitionList,
				});

				// term
				tokens.push({
					line : startLine,
					type : customTags.definitionTerm,
					from : 0,
					to   : lineText.length,
				});

				// definitions
				defs.forEach((d)=>{
					tokens.push({
						line : d.line,
						type : customTags.definitionList,
					});

					tokens.push({
						line : d.line,
						type : customTags.definitionColon,
						from : 0,
						to   : d.colons.length,
					});
					tokens.push({
						line : d.line,
						type : customTags.definitionDesc,
						from : d.colons.length,
						to   : d.colons.length + d.desc.length,
					});
				});
			}
		}

		if(lineText.includes('{') && lineText.includes('}')) {
			const injectionRegex = /(?:^|[^{\n])({(?=((?:[:=](?:"[\w,\-()#%. ]*"|[\w\-()#%.]*)|[^"':={}\s]*)*))\2})/gm;
			let match;
			while ((match = injectionRegex.exec(lineText)) !== null) {
				tokens.push({
					line : lineNumber,
					from : match.index +1,
					to   : match.index + match[1].length +1,
					type : customTags.injection,
				});
			}
		}
		if(lineText.includes('{{') && lineText.includes('}}')) {
			// Inline blocks: single-line {{…}}
			const spanRegex = /{{(?=((?:[:=](?:"[\w,\-()#%. ]*"|[\w\-()#%.]*)|[^"':={}\s]*)*))\1 *|}}/g;
			let match;
			let blockCount = 0;
			while ((match = spanRegex.exec(lineText)) !== null) {
				if(match[0].startsWith('{{')) {
					blockCount += 1;
				} else {
					blockCount -= 1;
				}
				if(blockCount < 0) {
					blockCount = 0;
					continue;
				}
				tokens.push({
					line : lineNumber,
					from : match.index,
					to   : match.index + match[0].length,
					type : customTags.inlineBlock,
				});
			}
		} else if(lineText.trimLeft().startsWith('{{') || lineText.trimLeft().startsWith('}}')) {
			// Highlight block divs {{\n Content \n}}
			let endCh = lineText.length + 1;

			const match = lineText.match(
				/^ *{{(?=((?:[:=](?:"[\w,\-()#%. ]*"|[\w\-()#%.]*)|[^"':={}\s]*)*))\1 *$|^ *}}$/,
			);
			if(match) endCh = match.index + match[0].length;
			tokens.push({ line: lineNumber, type: customTags.block });
		}
	});

	return tokens;
}

export const customHighlightStyle = HighlightStyle.define([
	{ tag: tags.heading,  class: 'cm-header' },
	{ tag: tags.heading1,  class: 'cm-header cm-header-1' },
	{ tag: tags.heading2,  class: 'cm-header cm-header-2' },
	{ tag: tags.heading3,  class: 'cm-header cm-header-3' },
	{ tag: tags.heading4,  class: 'cm-header cm-header-4' },
	{ tag: tags.heading5,  class: 'cm-header cm-header-5' },
	{ tag: tags.heading6,  class: 'cm-header cm-header-6' },
	{ tag: tags.link,  class: 'cm-link' },
	{ tag: tags.string,  class: 'cm-string' },
	{ tag: tags.url,  class: 'cm-string cm-url' },
	{ tag: tags.list,  class: 'cm-list' },
	{ tag: tags.strong,  class: 'cm-strong' },
	{ tag: tags.emphasis,  class: 'cm-em' },
	

	{ tag: customTags.pageLine, color: '#f0a' },
	{ tag: customTags.snippetLine, class: 'cm-snippetLine', color: '#0af' },
	{ tag: customTags.inlineBlock, class: 'cm-inline-block' },
	{ tag: customTags.emoji, class: 'cm-emoji', color: '#fa0' },
	{ tag: customTags.superscript, class: 'cm-superscript', verticalAlign: 'super', fontSize: '0.8em' },
	{ tag: customTags.subscript, class: 'cm-subscript', verticalAlign: 'sub', fontSize: '0.8em' },
	{ tag: customTags.definitionTerm, class: 'cm-dt', fontWeight: 'bold', color: '#0a0' },
	{ tag: customTags.definitionDesc, class: 'cm-dd', color: '#070' },
]);



