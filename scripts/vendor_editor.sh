#!/usr/bin/env sh
# Rebuild static/vendor/codemirror.js, the one file the in-app editor loads.
#
# The app has no frontend build step; this is not one. It runs once, by hand, when
# the editor's library needs updating, and its output is committed. Versions are
# pinned so a rebuild is reproducible. Needs node/npx; nothing is installed into
# the repo.
#
# The bundle is a classic script exposing window.CM: just what static/editor.js
# uses. Deliberately no autocompletion — an interview editor doesn't have it.
set -eu

ROOT=$(cd "$(dirname "$0")/.." && pwd)
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

cat > "$WORK/package.json" <<'EOF'
{
  "private": true,
  "dependencies": {
    "@codemirror/state": "6.7.6",
    "@codemirror/view": "6.43.13",
    "@codemirror/commands": "6.11.1",
    "@codemirror/language": "6.12.4",
    "@codemirror/lang-python": "6.2.1",
    "@codemirror/theme-one-dark": "6.1.3",
    "@codemirror/autocomplete": "6.20.3",
    "esbuild": "0.28.2"
  }
}
EOF

cat > "$WORK/entry.js" <<'EOF'
export { EditorState, Compartment, StateField, StateEffect } from "@codemirror/state";
export {
  EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter,
  highlightSpecialChars, drawSelection, Decoration, WidgetType,
} from "@codemirror/view";
export { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
export { indentOnInput, bracketMatching, syntaxHighlighting, indentUnit } from "@codemirror/language";
export { python } from "@codemirror/lang-python";
export { oneDarkHighlightStyle } from "@codemirror/theme-one-dark";
export { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
EOF

cd "$WORK"
npm install --silent --no-audit --no-fund
mkdir -p "$ROOT/static/vendor"
npx --no-install esbuild entry.js --bundle --minify --format=iife --global-name=CM \
  --legal-comments=eof \
  --banner:js="/* CodeMirror 6 (MIT, (c) Marijn Haverbeke and others) + @codemirror/* packages pinned in scripts/vendor_editor.sh, which built this file. */" \
  --outfile="$ROOT/static/vendor/codemirror.js"
echo "wrote static/vendor/codemirror.js ($(wc -c < "$ROOT/static/vendor/codemirror.js") bytes)"
