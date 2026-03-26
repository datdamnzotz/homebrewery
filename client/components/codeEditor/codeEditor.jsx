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
import { css } from '@codemirror/lang-css';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { autocompleteEmoji } from './autocompleteEmoji.js';

import * as themes from '@uiw/codemirror-themes-all';
const themeCompartment = new Compartment();
const highlightCompartment = new Compartment();

import { customKeymap } from './customKeyMap.js';
import { homebreweryFold, hbFolding } from './customFolding.js';
import { customHighlightStyle, tokenizeCustomMarkdown } from './customHighlight.js';
import { legacyCustomHighlightStyle, legacyTokenizeCustomMarkdown } from './legacyCustomHighlight.js'; //only makes highlight for

const createHighlightPlugin = (renderer, tab)=>{
	const tokenize = renderer === 'V3' ? tokenizeCustomMarkdown : legacyTokenizeCustomMarkdown;

	class countWidget extends WidgetType {
		constructor(count) {
			super();
			this.count = count;
		}
		toDOM() {
			const span = document.createElement('span');
			span.className = 'cm-page-count';
			span.textContent = this.count;
			span.style.color = '#989898';
			return span;
		}
		ignoreEvent() { return true; }
	}

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
				tokens.forEach((tok)=>{
					const line = view.state.doc.line(tok.line + 1);

					if(tok.from != null && tok.to != null && tok.from < tok.to) {

						decos.push(
							Decoration.mark({ class: `cm-${tok.type}` }).range(line.from + tok.from, line.from + tok.to)

						);

					} else {
						decos.push(Decoration.line({ class: `cm-${tok.type}` }).range(line.from));
						if(tok.type === 'pageLine') {
							pageCount++;
							line.from === 0 && pageCount--;
							decos.push(Decoration.widget({ widget: new countWidget(pageCount), side: 2 }).range(line.to));
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
			});

			const highlightExtension = renderer === 'V3'
  			? syntaxHighlighting(customHighlightStyle)
  			: syntaxHighlighting(legacyCustomHighlightStyle);

			const customHighlightPlugin = createHighlightPlugin(renderer);

			const combinedHighlight = [
				customHighlightPlugin,
				highlightExtension,
			];

			const languageExtension = language === 'css' ? css() : markdown({ base: markdownLanguage, codeLanguages: languages });

			const themeExtension = Array.isArray(themes[editorTheme]) ? themes[editorTheme] : [];

			return [
				history(),
				keymap.of(defaultKeymap),
				customKeymap,
				updateListener,
				EditorView.lineWrapping,
				scrollPastEnd(),
				languageExtension,

				lineNumbers(),
				homebreweryFold,
				hbFolding,

				keymap.of(foldKeymap),
				foldGutter({
					openText   : '▾',
					closedText : '▸'
				}),
				themeCompartment.of(themeExtension),

				highlightActiveLine(),
				highlightActiveLineGutter(),
				highlightCompartment.of(combinedHighlight),
				autocompleteEmoji,
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

			const customHighlightPlugin = createHighlightPlugin(renderer);

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

			setCursorPosition : (pos)=>{
				viewRef.current.dispatch({ selection: { anchor: pos } });
				viewRef.current.focus();
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
