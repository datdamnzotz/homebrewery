/* eslint max-lines: ["error", { "max": 400 }] */
import './codeEditor.less';
import React, { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';

import {
	EditorView,
	keymap,
	lineNumbers,
	highlightActiveLineGutter,
	highlightActiveLine,
	scrollPastEnd,
	Decoration,
	ViewPlugin,
	WidgetType
} from '@codemirror/view';
import { EditorState, Compartment } from '@codemirror/state';
import { foldGutter, foldKeymap, syntaxHighlighting } from '@codemirror/language';
import { defaultKeymap, history, historyField, undo, redo } from '@codemirror/commands';
import { languages } from '@codemirror/language-data';
import { css, cssLanguage } from '@codemirror/lang-css';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { autocompleteEmoji } from './autocompleteEmoji.js';
import { searchKeymap, search } from '@codemirror/search';

import * as themesImport from '@uiw/codemirror-themes-all';
import { defaultCM5Theme } from '@themes/codeMirror/customThemes/default.js';

const themes = { default: defaultCM5Theme, ...themesImport };
const themeCompartment = new Compartment();
const highlightCompartment = new Compartment();

import { customKeymap } from './customKeyMap.js';
import { homebreweryFold, hbFolding } from './customFolding.js';
import { customHighlightStyle, tokenizeCustomMarkdown, tokenizeCustomCSS } from './customHighlight.js';
import { legacyCustomHighlightStyle, legacyTokenizeCustomMarkdown } from './legacyCustomHighlight.js'; //only makes highlight for

const createHighlightPlugin = (renderer, tab)=>{
	let tokenize;

if (tab === "brewStyles") {
  tokenize = tokenizeCustomCSS;
} else {
  tokenize = renderer === 'V3' ? tokenizeCustomMarkdown : legacyTokenizeCustomMarkdown;
}
	/* eslint-disable no-restricted-syntax */
	class countWidget extends WidgetType {
		constructor(count) {
			super();
			this.count = count;
		}
		toDOM() {
			const span = document.createElement('span');
			span.className = 'cm-count';
			span.textContent = this.count;
			span.style.color = '#989898';
			return span;
		}
		ignoreEvent() { return true; }
	}
	/* eslint-enable no-restricted-syntax */

	return ViewPlugin.fromClass(
		class {
			constructor(view) {
				this.decorations = this.buildDecorations(view);
			}
			update(update) {
				if(update.docChanged) {
					this.decorations = this.buildDecorations(update.view);
				}
			}
			buildDecorations(view) {
				const decos = [];
				const tokens = tokenize(view.state.doc.toString());

				let pageCount = 1;
				let snippetCount = 0;
				tokens.forEach((tok)=>{
					const line = view.state.doc.line(tok.line + 1);

					if(tok.from != null && tok.to != null && tok.from < tok.to) {

						decos.push(
							Decoration.mark({ class: `cm-${tok.type}` }).range(line.from + tok.from, line.from + tok.to)

						);

					} else {
						decos.push(Decoration.line({ class: `cm-${tok.type}` }).range(line.from));
						if(tok.type === 'pageLine'  && tab === 'brewText') {
							pageCount++;
							line.from === 0 && pageCount--;
							decos.push(Decoration.widget({ widget: new countWidget(pageCount), side: 2 }).range(line.to));
						}
						if(tok.type === 'snippetLine' && tab === 'brewSnippets') {
							snippetCount++;
							decos.push(Decoration.widget({ widget: new countWidget(snippetCount), side: 2 }).range(line.to));
						}
					}
				});

				decos.sort((a, b)=>a.from - b.from || a.to - b.to);
				return Decoration.set(decos);
			}
		},
		{ decorations: (v)=>v.decorations }
	);
};

const CodeEditor = forwardRef(
	(
		{
			value = '',
			onChange = ()=>{},
			onCursorChange = ()=>{},
			onViewChange = ()=>{},
			language = '',
			tab = 'brewText',
			editorTheme = 'default',
			view,
			style,
			renderer,
			...props
		},
		ref,
	)=>{
		const editorRef = useRef(null);
		const viewRef = useRef(null);
		const docsRef = useRef({});
		const prevTabRef = useRef(tab);

		const createExtensions = ({ onChange, language, editorTheme })=>{
			const updateListener = EditorView.updateListener.of((update)=>{
				if(update.docChanged) {
					onChange(update.state.doc.toString());
				}
				if(update.selectionSet) {
					const pos = update.state.selection.main.head;
					const line = update.state.doc.lineAt(pos).number;

					onCursorChange(line);
				}
				if(update.viewportChanged) {
					const { from } = update.view.viewport;
					const line = update.state.doc.lineAt(from).number;

					onViewChange(line);
				}
			});

			const highlightExtension = renderer === 'V3'
  			? syntaxHighlighting(customHighlightStyle)
  			: syntaxHighlighting(legacyCustomHighlightStyle);

			const customHighlightPlugin = createHighlightPlugin(renderer, tab);

			const combinedHighlight = [
				customHighlightPlugin,
				highlightExtension,
			];

			const languageExtension = language === 'css' ? [css(), cssLanguage] : markdown({ base: markdownLanguage, codeLanguages: languages });

			const themeExtension = Array.isArray(themes[editorTheme]) ? themes[editorTheme] : [];

			return [
				history(),
				keymap.of([...defaultKeymap, customKeymap, foldKeymap, ...searchKeymap]),
				updateListener,
				EditorView.lineWrapping,
				scrollPastEnd(),
				languageExtension,

				lineNumbers(),
				homebreweryFold,
				hbFolding,

				foldGutter({
					openText   : '▾',
					closedText : '▸'
				}),

				highlightActiveLine(),
				highlightActiveLineGutter(),
				highlightCompartment.of(combinedHighlight),
				themeCompartment.of(themeExtension),
				...(tab !== 'brewStyles' ? [autocompleteEmoji] : []),
				search(),
			];
		};

		useEffect(()=>{
			if(!editorRef.current) return;

			const state = EditorState.create({
				doc        : value,
				extensions : createExtensions({ onChange, language, editorTheme }),
			});

			viewRef.current = new EditorView({
				state,
				parent : editorRef.current,
			});

			docsRef.current[tab] = state;

			return ()=>viewRef.current?.destroy();
		}, []);

		useEffect(()=>{
			const view = viewRef.current;
			if(!view) return;

			const prevTab = prevTabRef.current;

			if(prevTab !== tab) {
				docsRef.current[prevTab] = view.state;

				let nextState = docsRef.current[tab];

				if(!nextState) {
					nextState = EditorState.create({
						doc        : value,
						extensions : createExtensions({ onChange, language, editorTheme }),
					});
				}

				view.setState(nextState);
				prevTabRef.current = tab;
			}
		}, [tab]);

		useEffect(()=>{
			const view = viewRef.current;
			if(!view) return;

			const current = view.state.doc.toString();
			if(value !== current) {
				view.dispatch({
					changes : { from: 0, to: current.length, insert: value },
				});
			}
		}, [value]);

		useEffect(()=>{
			//rebuild theme extension on theme change
			const view = viewRef.current;
			if(!view) return;

			const themeExtension = Array.isArray(themes[editorTheme]) ? themes[editorTheme] : [];

			view.dispatch({
				effects : themeCompartment.reconfigure(themeExtension),
			});
		}, [editorTheme]);
		useEffect(()=>{
			const view = viewRef.current;
			if(!view) return;

			const highlightExtension =renderer === 'V3'
    		? syntaxHighlighting(customHighlightStyle)
    		: syntaxHighlighting(legacyCustomHighlightStyle);

			const customHighlightPlugin = createHighlightPlugin(renderer, tab);

			view.dispatch({
				effects : highlightCompartment.reconfigure([customHighlightPlugin, highlightExtension]),
			});
		}, [renderer]);

		useImperativeHandle(ref, ()=>({
			getValue : ()=>viewRef.current.state.doc.toString(),

			setValue : (text)=>{
				const view = viewRef.current;
				view.dispatch({
					changes : { from: 0, to: view.state.doc.length, insert: text },
				});
			},

			injectText : (text)=>{
				const view = viewRef.current;
				const { from, to } = view.state.selection.main;

				view.dispatch({
					changes   : { from, to, insert: text },
					selection : { anchor: from + text.length },
				});

				view.focus();
			},

			getCursorPosition : ()=>viewRef.current.state.selection.main.head,

			getScrollTop : ()=>viewRef.current.scrollDOM.scrollTop,

			scrollToY : (y)=>{
				viewRef.current.scrollDOM.scrollTo({ top: y });
			},

			getLineTop : (lineNumber)=>{
				const view = viewRef.current;
				if(!view) return 0;

				const line = view.state.doc.line(lineNumber);
				return view.coordsAtPos(line.from)?.top ?? 0;
			},

			setCursorToLine : (lineNumber)=>{
				const view = viewRef.current;
				const line = view.state.doc.line(lineNumber);

				view.dispatch({
					selection : { anchor: line.from }
				});

				view.focus();
			},

			undo : ()=>undo(viewRef.current),
			redo : ()=>redo(viewRef.current),

			historySize : ()=>{
				const view = viewRef.current;
				if(!view) return { done: 0, undone: 0 };

				const h = view.state.field(historyField, false);
				if(!h) return { done: 0, undone: 0 };

				return { done: h.done.length, undone: h.undone.length };
			},

			focus : ()=>viewRef.current.focus(),
		}));

		return <div className={`codeEditor ${tab}`} ref={editorRef} style={style} />;
	},
);

export default CodeEditor;
