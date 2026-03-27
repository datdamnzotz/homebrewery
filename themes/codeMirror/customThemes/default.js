// themes/codeMirror/customThemes/default.js
import { EditorView } from '@codemirror/view';
import { Compartment } from '@codemirror/state';

export const themeCompartment = new Compartment();

export const defaultCM5Theme = EditorView.theme({
  "&": {
    backgroundColor: "white",
    color: "black",
  },
  ".cm-content": {
    padding: "4px 0",
    fontFamily: "monospace",
    fontSize: "13px",
    lineHeight: "1",
  },
  ".cm-line": {
    padding: "0 4px",
  },
  ".cm-gutters": {
    borderRight: "1px solid #ddd",
    backgroundColor: "#f7f7f7",
    whiteSpace: "nowrap",
  },
  ".cm-linenumber": {
    padding: "0 3px 0 5px",
    minWidth: "20px",
    textAlign: "right",
    color: "#999",
    whiteSpace: "nowrap",
  },
  ".cm-cursor": {
    borderLeft: "1px solid black",
  },
  ".cm-fat-cursor": {
    width: "auto",
    backgroundColor: "#7e7",
    caretColor: "transparent",
  },
  ".cm-activeline-background": {
    backgroundColor: "#e8f2ff",
  },
  ".cm-selected": {
    backgroundColor: "#d7d4f0",
  },
  ".cm-foldmarker": {
    color: "blue",
    textShadow:
      "#b9f 1px 1px 2px, #b9f -1px -1px 2px, #b9f 1px -1px 2px, #b9f -1px 1px 2px",
    fontFamily: "arial",
    lineHeight: "0.3",
    cursor: "pointer",
  },

  // Semantic classes
  ".cm-header": { color: "blue", fontWeight: "bold" },
  ".cm-strong": { fontWeight: "bold" },
  ".cm-em": { fontStyle: "italic" },
  ".cm-quote": { color: "#090" },
  ".cm-keyword": { color: "#708" },
  ".cm-atom": { color: "#219" },
  ".cm-number": { color: "#164" },
  ".cm-def": { color: "#00f" },
  ".cm-variable-2": { color: "#05a" },
  ".cm-variable-3, .cm-type": { color: "#085" },
  ".cm-comment": { color: "#a50" },
  ".cm-string": { color: "#a11" },
  ".cm-string-2": { color: "#f50" },
  ".cm-meta, .cm-qualifier": { color: "#555" },
  ".cm-builtin": { color: "#30a" },
  ".cm-bracket": { color: "#997" },
  ".cm-tag": { color: "#170" },
  ".cm-attribute": { color: "#00c" },
  ".cm-hr": { color: "#999" },
  ".cm-link": { color: "#00c", textDecoration: "underline" },
  ".cm-negative": { color: "#d44" },
  ".cm-positive": { color: "#292" },
  ".cm-error, .cm-invalidchar": { color: "#f00" },
  ".cm-matchingbracket": { color: "#0b0" },
  ".cm-nonmatchingbracket": { color: "#a22" },
  ".cm-matchingtag": { backgroundColor: "rgba(255, 150, 0, 0.3)" },
}, { dark: false });