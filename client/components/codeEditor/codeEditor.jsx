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
import { markdown } from "@codemirror/lang-markdown";
import { css } from "@codemirror/lang-css";
import { basicLightTheme } from "cm6-theme-basic-light";

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

		console.log(props);

		// --- init editor ---
		useEffect(() => {
			if (!editorRef.current) return;

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

			const languageExtension = () => {
				switch (language) {
					case "gfm":
						return markdown({ codeLanguages: [] }); // GitHub-flavored Markdown
					case "css":
						return css();
					default:
						return markdown();
				}
			};

			const state = EditorState.create({
				doc: value,
				extensions: [
					history(),
					keymap.of(defaultKeymap),
					customKeymap,
					updateListener,
					EditorView.lineWrapping,
					scrollPastEnd(),
					languageExtension(),
					highlightActiveLine(),
					highlightActiveLineGutter(),
					keymap.of(foldKeymap),
					foldGutter(),
					lineNumbers(),
					basicLightTheme,
					bracketMatching(),
				],
			});

			viewRef.current = new EditorView({
				state,
				parent: editorRef.current,
			});

			return () => viewRef.current?.destroy();
		}, []);

		// --- sync external value ---
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
