// customMarkdownGrammar.js

// --- Custom tags with CM6-compatible class names ---
export const customTags = {
	pageLine: "pageLine", // .cm-pageLine
	snippetLine: "snippetLine", // .cm-snippetLine
	columnSplit: "columnSplit", // .cm-columnSplit
	snippetBreak: "snippetBreak", // .cm-snippetBreak
	inlineBlock: "inline-block", // .cm-inline-block
	block: "block", // .cm-block
	emoji: "emoji", // .cm-emoji
	superscript: "superscript", // .cm-superscript
	subscript: "subscript", // .cm-subscript
	definitionList: "definitionList", // .cm-definitionList
	definitionTerm: "definitionTerm", // .cm-definitionTerm
	definitionDesc: "definitionDesc", // .cm-definitionDesc
	definitionColon: "definitionColon", // .cm-definitionColon
	injection: "injection", // .cm-injection
};

// --- Tokenizer function ---
export function tokenizeCustomMarkdown(text) {
	const tokens = [];
	const lines = text.split("\n");

	// Track multi-line blocks
	let inBlock = false;
	let blockStart = 0;

	lines.forEach((lineText, lineNumber) => {
		// --- Page / snippet lines ---
		if (/\\page/.test(lineText)) tokens.push({ line: lineNumber, type: customTags.pageLine });
		if (/\\snippet/.test(lineText)) tokens.push({ line: lineNumber, type: customTags.snippetLine });
		if (/^\\column(?:break)?$/.test(lineText)) tokens.push({ line: lineNumber, type: customTags.columnSplit });
		if (/\\snippet/.test(lineText)) tokens.push({ line: lineNumber, type: customTags.snippetBreak });

		// --- Emoji ---
		if (/:\w+?:/.test(lineText)) tokens.push({ line: lineNumber, type: customTags.emoji });

		// --- Superscript / Subscript ---
		if (/\^/.test(lineText)) {
			let startIndex = lineText.indexOf("^");
			const superRegex = /\^(?!\s)(?=([^\n\^]*[^\s\^]))\1\^/gy;
			const subRegex = /\^\^(?!\s)(?=([^\n\^]*[^\s\^]))\1\^\^/gy;

			while (startIndex >= 0) {
				superRegex.lastIndex = subRegex.lastIndex = startIndex;

				let match = subRegex.exec(lineText);
				let type = customTags.subscript;

				if (!match) {
					match = superRegex.exec(lineText);
					type = customTags.superscript;
				}

				if (match) {
					tokens.push({
						line: lineNumber,
						type,
						from: match.index,
						to: match.index + match[0].length,
					});
				}

				startIndex = lineText.indexOf(
					"^",
					Math.max(startIndex + 1, superRegex.lastIndex || 0, subRegex.lastIndex || 0),
				);
			}
		}

		// --- inline definition lists ---
		if (/::/.test(lineText)) {
			if (/^:*$/.test(lineText) == true) {
				return; //if line only has colons, stops
			}

			const singleLineRegex = /^([^:\n]*\S)(::)([^\n]*)$/dmy;

			let match = singleLineRegex.exec(lineText);

			if (match) {
				const [full, term, colons, desc] = match;
				let offset = 0;

				// Entire line as definitionList
				tokens.push({
					line: lineNumber,
					type: customTags.definitionList,
				});

				// Term
				tokens.push({
					line: lineNumber,
					type: customTags.definitionTerm,
					from: offset,
					to: offset + term.length,
				});
				offset += term.length;

				// ::
				tokens.push({
					line: lineNumber,
					type: customTags.definitionColon,
					from: offset,
					to: offset + colons.length,
				});
				offset += colons.length;

				// Definition
				tokens.push({
					line: lineNumber,
					type: customTags.definitionDesc,
					from: offset,
					to: offset + desc.length,
				});

				return;
			}
		}

		// --- Multiline definition list: term:\n::def1\n::def2 ---
		// Only treat this line as a term if next line starts with ::
		if (!/^::/.test(lines[lineNumber]) && lineNumber + 1 < lines.length && /^::/.test(lines[lineNumber + 1])) {
			console.log(`testing line ${lineNumber + 1}, with content: ${lineText}`);
			console.log(`next line is ${lineNumber + 1 + 1}, with content: ${lines[lineNumber + 1]}`);

			const term = lineText;
			const startLine = lineNumber;
			let defs = [];
			let endLine = startLine;

			// collect all following :: definitions
			for (let i = lineNumber + 1; i < lines.length; i++) {
				const nextLine = lines[i];
				const onlyColonsMatch = /^:*$/.test(nextLine);
				const defMatch = /^(::)(.*\S.*)?\s*$/.exec(nextLine);
				if (!onlyColonsMatch && defMatch) {
					defs.push({ colons: defMatch[1], desc: defMatch[2], line: i });
					endLine = i;
				} else break;
			}

			console.log(defs);
			if (defs.length > 0) {
				tokens.push({
					line: startLine,
					type: customTags.definitionList,
				});

				// term
				tokens.push({
					line: startLine,
					type: customTags.definitionTerm,
					from: 0,
					to: lineText.length,
				});

				// definitions
				defs.forEach((d) => {
					tokens.push({
						line: d.line,
						type: customTags.definitionList,
					});

					tokens.push({
						line: d.line,
						type: customTags.definitionColon,
						from: 0,
						to: d.colons.length,
					});
					tokens.push({
						line: d.line,
						type: customTags.definitionDesc,
						from: d.colons.length,
						to: d.colons.length + d.desc.length,
					});
				});
			}
		}

		// --- Injection `{…}` ---
		const injectorRegex = /{(?=((?:[:=](?:"[\w,\-()#%. ]*"|[\w\-()#%.]*)|[^"':={}\s]*)*))\1}/g;
		let match;
		while ((match = injectorRegex.exec(lineText)) !== null) {
			tokens.push({
				line: lineNumber,
				type: customTags.injection,
				from: match.index,
				to: match.index + match[0].length,
			});
		}

		// --- Inline block `{{…}}` on the same line ---
		const inlineRegex = /{{(?=((?:[:=](?:"[\w,\-()#%. ]*"|[\w\-()#%.]*)|[^"':={}\s]*)*))\1 *}}/g;
		while ((match = inlineRegex.exec(lineText)) !== null) {
			tokens.push({
				line: lineNumber,
				type: customTags.inlineBlock,
				from: match.index,
				to: match.index + match[0].length,
			});
		}

		// --- Multi-line blocks `{{…}}` --- only start/end lines
		if (lineText.trimLeft().startsWith("{{") && !lineText.trimLeft().endsWith("}}")) {
			inBlock = true;
			blockStart = lineNumber;
			tokens.push({ line: lineNumber, type: customTags.block });
		}
		if (lineText.trimLeft().startsWith("}}") && inBlock) {
			tokens.push({ line: lineNumber, type: customTags.block });
			inBlock = false;
		}
	});

	return tokens;
}
