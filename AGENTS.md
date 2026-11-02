# Shortmoji

Chrome extension that replaces `:emoji:` shortcodes with actual emoji characters. Uses the gemoji standard (Slack/GitHub/Discord compatible).

## Architecture

Zero dependencies, zero build step, pure vanilla JS. Manifest V3.

```
manifest.json      → Extension config
emoji-data.js      → Shortcode→emoji map (generated from gemoji), wrapped in loadEmojiData()
match.js           → findTrigger + searchEmojis: pure, no DOM, shared with the unit tests
content.js         → Content script: input detection, dropdown (shadow root, inline Catppuccin Mocha styles), replacement
popup.html/js      → Extension popup (enable/disable toggle)
test/              → emoji-search.test.js (bun), e2e.py (real browser, real keys)
```

## How It Works

1. Content script listens for `input` on all editable fields, plus cancelled `beforeinput` for editors that write the DOM themselves
2. Detects `:shortcode` and `#shortcode` (2+ chars), not right after a letter, digit, `_`, `:`, `/` or `.`
3. Two modes:
   - **Autocomplete:** `:smi` → dropdown with matches → arrow keys + Enter/Tab
   - **Instant replace:** `:smile:` → emoji, only when the closing colon was typed. Paste, undo and Backspace stay literal
4. Text fields use `document.execCommand('insertText')` for undo support + framework compat
5. Contenteditable fires a synthetic `beforeinput` first, then `execCommand` if the editor did not cancel it. `execCommand` fires no `beforeinput`, and Slate and CKEditor revert edits they did not get that way. Instant replace in contenteditable waits a task, because editors reconcile right after the event

## Key Files

- `docs/chrome-extension-mv3.md` — Chrome extension API reference
- `docs/gemoji-reference.md` — Emoji data source, regeneration instructions

## Development

Edit files → reload extension in `chrome://extensions/` → `bun test` and `python3 test/e2e.py`.

No build step. No npm. No framework. Load as unpacked extension.
