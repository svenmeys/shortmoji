# Shortmoji — Emoji Shortcodes for Chrome

**The colon is mightier than the mouse.**

Type `:smile:` and get 😄. Anywhere on the web. No account, no tracking, no in-app purchases. Just you, a colon, and 1870 of your closest emoji friends.

## How It Works

1. Type `:` or `#` followed by an emoji name (e.g., `:rocket:` or `#rocket`)
2. A dropdown shows matching emoji — pick one with arrow keys + Enter/Tab
3. Or type the full shortcode with closing colon (`:rocket:`) for instant replacement

Works in text inputs, textareas, and contenteditable fields (Gmail, Notion, Slack web, etc).

## Install

1. Clone this repo or download the ZIP
2. Open `chrome://extensions/` in Chrome
3. Enable **Developer mode** (top right)
4. Click **Load unpacked** and select the `shortmoji` folder
5. Done — start typing `:shortcodes:` anywhere

## Features

- **1870+ emoji** — full [gemoji](https://github.com/github/gemoji) set (same shortcodes as Slack, GitHub, Discord)
- **Instant replace** — type `:fire:` and it becomes 🔥 immediately
- **Two triggers** — `:fire` (Slack-style) or `#fire` (quick pound key)
- **Autocomplete** — type 2+ chars and pick from a dropdown
- **Works everywhere** — text inputs, textareas, contenteditable (Gmail, Notion, etc)
- **Keyboard navigation** — arrow keys, Enter/Tab to select, Escape to dismiss
- **Toggle on/off** — click the extension icon
- **Zero dependencies** — pure vanilla JS, no build step, no framework
- **No tracking** — no analytics, no telemetry, no data collection

## Shortcode Reference

Uses the standard [gemoji](https://github.com/github/gemoji) shortcodes — the same ones used by Slack, GitHub, and Discord.

Common examples:

| Type this | Get this |
|-----------|----------|
| `:smile:` | 😄 |
| `:thumbsup:` | 👍 |
| `:fire:` | 🔥 |
| `:rocket:` | 🚀 |
| `:heart:` | ❤️ |
| `:tada:` | 🎉 |
| `:eyes:` | 👀 |
| `:100:` | 💯 |

## Development

No build step. Edit the files, reload the extension in `chrome://extensions/`.

```
shortmoji/
├── manifest.json      # Chrome extension manifest (V3)
├── content.js         # Content script — input detection, dropdown, replacement
├── emoji-data.js      # Shortcode → emoji mapping (generated from gemoji)
├── styles.css         # Dropdown styling
├── popup.html         # Extension popup (toggle on/off)
├── popup.js           # Popup logic
└── docs/              # Reference documentation
```

## Why

Because the built-in emoji picker requires a hotkey nobody remembers, a mouse journey through 47 categories, and the emotional resilience to scroll past 300 flags you'll never use. Life's too short. Type `:taco:`, get 🌮, move on.

## License

MIT — do whatever you want with it. We're not going to upsell you on premium emoji.
