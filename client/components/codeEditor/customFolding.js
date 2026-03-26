import { foldService } from '@codemirror/language';
import { codeFolding } from '@codemirror/language';

export function getFoldPreview(state, from, to) {
	const doc = state.doc;
	const start = doc.lineAt(from).number;
	const end = doc.lineAt(to).number;

	if(doc.line(start).text.trim()) return ` ↤ Lines ${start}-${end} ↦`;

	const preview = Array.from({ length: end - start }, (_, i)=>doc.line(start + 1 + i).text.trim())
		.find(Boolean) || `Lines ${start}-${end}`;

	return ` ↤ ${preview.replace('{', '').slice(0, 50).trim()}${preview.length > 50 ? '...' : ''} ↦`;
}

export const homebreweryFold = foldService.of((state, lineStart)=>{
	const doc = state.doc;
	const matcher = /^(?=\\page(?:break)?(?: *{[^\n{}]*})?$)/m;

	const startLine = doc.lineAt(lineStart);
	const prevLineText = startLine.number > 1 ? doc.line(startLine.number - 1).text : '';

	if(startLine.number > 1 && !matcher.test(prevLineText)) return null;

	let endLine = startLine.number;
	while (endLine < doc.lines && !matcher.test(doc.line(endLine + 1).text)) {
		endLine++;
	}

	if(endLine === startLine.number) return null;

	const widgetObject = { from: startLine.from, to: doc.line(endLine).to };
	console.log(widgetObject);

	return widgetObject;
});

export const hbFolding = codeFolding({
	preparePlaceholder : (state, range)=>{
		return getFoldPreview(state, range.from, range.to);
	},
	placeholderDOM(view, onclick, prepared) {
		const span = document.createElement('span');
		span.className = 'cm-fold-placeholder';
		span.textContent = prepared;
		span.onclick = onclick;
		span.style.color = '#989898';
		return span;
	},
});
