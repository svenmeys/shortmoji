# Shortmoji

Chrome extension that replaces `:emoji:` shortcodes with actual emoji characters. Uses the gemoji standard (Slack/GitHub/Discord compatible).

## Architecture

Zero dependencies, zero build step, pure vanilla JS. Manifest V3.

```
manifest.json      → Extension config
emoji-data.js      → Shortcode→emoji map (generated from gemoji)
content.js         → Content script: input detection, dropdown, replacement
styles.css         → Dropdown styling (Catppuccin Mocha)
popup.html/js      → Extension popup (enable/disable toggle)
```

## How It Works

1. Content script listens for `input` events on all editable fields
2. Detects `:shortcode` patterns (2+ chars after colon, preceded by whitespace)
3. Two modes:
   - **Autocomplete:** `:smi` → dropdown with matches → arrow keys + Enter/Tab
   - **Instant replace:** `:smile:` (closing colon) → immediate emoji insertion
4. Uses `document.execCommand('insertText')` for undo support + framework compat
5. Handles both native inputs (textarea/input) and contenteditable (Gmail, Notion, etc)

## Key Files

- `docs/chrome-extension-mv3.md` — Chrome extension API reference
- `docs/gemoji-reference.md` — Emoji data source, regeneration instructions

## Development

Edit files → reload extension in `chrome://extensions/` → test.

No build step. No npm. No framework. Load as unpacked extension.
