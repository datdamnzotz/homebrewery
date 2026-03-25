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
} from '@codemirror/view';
import { EditorState, Compartment } from '@codemirror/state';
import { foldGutter, foldKeymap, syntaxHighlighting, HighlightStyle } from '@codemirror/language';
import { defaultKeymap, history, historyField, undo, redo } from '@codemirror/commands';
import { languages } from '@codemirror/language-data';
import { css } from '@codemirror/lang-css';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';

import { tags } from '@lezer/highlight';

// #########################   THEMES   #############################

import * as themes from '@uiw/codemirror-themes-all';

const themeCompartment = new Compartment();

// #########################   CUSTOM HIGHLIGHTS   #############################

const highlightStyle = HighlightStyle.define([
	{
		tag        : tags.heading1,
		color      : 'black',
		fontSize   : '1.75em',
		fontWeight : '700',
		class      : 'cm-header cm-header-1',
	},
	{
		tag   : tags.processingInstruction,
		color : 'blue',
	},
	// …
]);

import { tokenizeCustomMarkdown, customTags } from './customMarkdownGrammar.js';

const customHighlightStyle = HighlightStyle.define([
	{ tag: tags.heading1, color: '#000', fontWeight: '700' },
	{ tag: tags.keyword, color: '#07a' }, // example for your markdown headings
	{ tag: customTags.pageLine, color: '#f0a' },
	{ tag: customTags.snippetBreak, class: 'cm-snippet-break', color: '#0af' },
	{ tag: customTags.inlineBlock, class: 'cm-inline-block', backgroundColor: '#fffae6' },
	{ tag: customTags.emoji, class: 'cm-emoji', color: '#fa0' },
	{ tag: customTags.superscript, class: 'cm-superscript', verticalAlign: 'super', fontSize: '0.8em' },
	{ tag: customTags.subscript, class: 'cm-subscript', verticalAlign: 'sub', fontSize: '0.8em' },
	{ tag: customTags.definitionTerm, class: 'cm-dt', fontWeight: 'bold', color: '#0a0' },
	{ tag: customTags.definitionDesc, class: 'cm-dd', color: '#070' },
]);

const customHighlightPlugin = ViewPlugin.fromClass(
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
			const tokens = tokenizeCustomMarkdown(view.state.doc.toString());

			tokens.forEach((tok)=>{
				const line = view.state.doc.line(tok.line + 1);

				if(tok.from != null && tok.to != null && tok.from < tok.to) {
					// inline decoration
					decos.push(
						Decoration.mark({ class: `cm-${tok.type}` }).range(line.from + tok.from, line.from + tok.to),
					);
				} else {
					// full-line decoration
					decos.push(Decoration.line({ class: `cm-${tok.type}` }).range(line.from));
				}
			});

			// sort by absolute start position
			decos.sort((a, b)=>a.from - b.from || a.to - b.to);

			return Decoration.set(decos);
		}
	},
	{
		decorations : (v)=>v.decorations,
	},
);

// #########################   COMPONENT   #############################

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

			const boldCommand = (view)=>{
				const { from, to } = view.state.selection.main;
				const selected = view.state.doc.sliceString(from, to);
				const text = `**${selected}**`;

				view.dispatch({
					changes   : { from, to, insert: text },
					selection : { anchor: from + text.length },
				});

				return true;
			};

			const italicCommand = (view)=>{
				const { from, to } = view.state.selection.main;
				const selected = view.state.doc.sliceString(from, to);
				const text = `*${selected}*`;

				view.dispatch({
					changes   : { from, to, insert: text },
					selection : { anchor: from + text.length },
				});

				return true;
			};

			const customKeymap = keymap.of([
				{ key: 'Mod-b', run: boldCommand },
				{ key: 'Mod-i', run: italicCommand },
			]);

			const languageExtension =
				language === 'css' ? css() : markdown({ base: markdownLanguage, codeLanguages: languages });

			const themeExtension = Array.isArray(themes[editorTheme]) ? themes[editorTheme] : [];

			return [
				history(),
				keymap.of(defaultKeymap),
				customKeymap,
				updateListener,
				EditorView.lineWrapping,
				scrollPastEnd(),
				languageExtension,
				highlightActiveLine(),
				highlightActiveLineGutter(),
				keymap.of(foldKeymap),
				foldGutter(),
				lineNumbers(),

				themeCompartment.of(themeExtension), // 👈 key line

				syntaxHighlighting(highlightStyle),
				customHighlightPlugin,
				syntaxHighlighting(customHighlightStyle),
			];
		};

		useEffect(()=>{
			if(!editorRef.current) return;

			// create initial editor state
			const state = EditorState.create({
				doc        : value,
				extensions : createExtensions({ onChange, language, editorTheme }),
			});

			viewRef.current = new EditorView({
				state,
				parent : editorRef.current,
			});

			// save initial state for current tab
			docsRef.current[tab] = state;

			return ()=>viewRef.current?.destroy();
		}, []);

		useEffect(()=>{
			const view = viewRef.current;
			if(!view) return;

			const prevTab = prevTabRef.current;

			if(prevTab !== tab) {
				// save current state
				docsRef.current[prevTab] = view.state;

				// restore or create
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

		return <div className='codeEditor' ref={editorRef} style={style} />;
	},
);

export default CodeEditor;
