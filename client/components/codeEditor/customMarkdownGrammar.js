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
	definitionTerm: "dt-highlight", // .cm-dt-highlight
	definitionDesc: "dd-highlight", // .cm-dd-highlight
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
		};
		// --- Definition lists ---
		if (/::/.test(lineText)) {
			tokens.push({ line: lineNumber, type: customTags.definitionDesc });
			tokens.push({ line: lineNumber, type: customTags.definitionTerm });
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
