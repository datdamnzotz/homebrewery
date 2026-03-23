import "./codeEditor.less";
import React, { useEffect, useRef, forwardRef, useImperativeHandle } from "react";

import { EditorState } from "@codemirror/state";
import { defaultKeymap, history, historyField, undo, redo } from "@codemirror/commands";
import { foldGutter, foldKeymap } from "@codemirror/language";
import {
	EditorView,
	keymap,
	lineNumbers,
	highlightActiveLineGutter,
	highlightActiveLine,
	scrollPastEnd,
} from "@codemirror/view";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { css } from "@codemirror/lang-css";
import { basicLightHighlightStyle } from "cm6-theme-basic-light";
import { HighlightStyle } from "@codemirror/language";

import { syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";

const highlightStyle = HighlightStyle.define([
	{
		tag: tags.heading1,
		color: "black",
		fontSize: "1.75em",
		fontWeight: "700",
		class: "cm-header cm-header-1",
	},
	{
		tag: tags.processingInstruction,
		color: "blue",
	},
	// …
]);

const CodeEditor = forwardRef(
	(
		{
			value = "",
			onChange = () => {},
			language = "",
			tab = "brewText",
			editorTheme = "default",
			view,
			style,
			...props
		},
		ref,
	) => {
		const editorRef = useRef(null);
		const viewRef = useRef(null);
		const docsRef = useRef({});
		const prevTabRef = useRef(tab);

		console.log(props);

		// --- init editor ---
		const createExtensions = ({ onChange, language, editorTheme }) => {
			const updateListener = EditorView.updateListener.of((update) => {
				if (update.docChanged) {
					onChange(update.state.doc.toString());
				}
			});

			const boldCommand = (view) => {
				const { from, to } = view.state.selection.main;
				const selected = view.state.doc.sliceString(from, to);
				const text = `**${selected}**`;

				view.dispatch({
					changes: { from, to, insert: text },
					selection: { anchor: from + text.length },
				});

				return true;
			};

			const italicCommand = (view) => {
				const { from, to } = view.state.selection.main;
				const selected = view.state.doc.sliceString(from, to);
				const text = `*${selected}*`;

				view.dispatch({
					changes: { from, to, insert: text },
					selection: { anchor: from + text.length },
				});

				return true;
			};

			const customKeymap = keymap.of([
				{ key: "Mod-b", run: boldCommand },
				{ key: "Mod-i", run: italicCommand },
			]);

			const languageExtension =
				language === "css" ? css() : markdown({ base: markdownLanguage, codeLanguages: languages });

			const themeExtension = syntaxHighlighting(basicLightHighlightStyle);

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
				themeExtension,
				syntaxHighlighting(highlightStyle),
			];
		};

		useEffect(() => {
			if (!editorRef.current) return;

			// create initial editor state
			const state = EditorState.create({
				doc: value,
				extensions: createExtensions({ onChange, language, editorTheme }),
			});

			viewRef.current = new EditorView({
				state,
				parent: editorRef.current,
			});

			// save initial state for current tab
			docsRef.current[tab] = state;

			return () => viewRef.current?.destroy();
		}, []);

		useEffect(() => {
			const view = viewRef.current;
			if (!view) return;

			const prevTab = prevTabRef.current;

			if (prevTab !== tab) {
				// save current state
				docsRef.current[prevTab] = view.state;

				// restore or create
				let nextState = docsRef.current[tab];

				if (!nextState) {
					nextState = EditorState.create({
						doc: value,
						extensions: createExtensions({ onChange, language, editorTheme }),
					});
				}

				view.setState(nextState);
				prevTabRef.current = tab;
			}
		}, [tab]);

		useEffect(() => {
			const view = viewRef.current;
			if (!view) return;

			const current = view.state.doc.toString();
			if (value !== current) {
				view.dispatch({
					changes: { from: 0, to: current.length, insert: value },
				});
			}
		}, [value]);
		// --- exposed API ---
		useImperativeHandle(ref, () => ({
			getValue: () => viewRef.current.state.doc.toString(),

			setValue: (text) => {
				const view = viewRef.current;
				view.dispatch({
					changes: { from: 0, to: view.state.doc.length, insert: text },
				});
			},

			injectText: (text) => {
				const view = viewRef.current;
				const { from, to } = view.state.selection.main;

				view.dispatch({
					changes: { from, to, insert: text },
					selection: { anchor: from + text.length },
				});

				view.focus();
			},

			getCursorPosition: () => viewRef.current.state.selection.main.head,

			setCursorPosition: (pos) => {
				viewRef.current.dispatch({ selection: { anchor: pos } });
				viewRef.current.focus();
			},

			undo: () => undo(viewRef.current),
			redo: () => redo(viewRef.current),

			historySize: () => {
				const view = viewRef.current;
				if (!view) return { done: 0, undone: 0 };

				const h = view.state.field(historyField, false);
				if (!h) return { done: 0, undone: 0 };

				return { done: h.done.length, undone: h.undone.length };
			},

			focus: () => viewRef.current.focus(),
		}));

		return <div className="codeEditor" ref={editorRef} style={style} />;
	},
);

export default CodeEditor;
