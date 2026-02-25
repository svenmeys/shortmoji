# Chrome Extension Manifest V3 — Reference

Quick reference for Shortmoji development. Full docs: https://developer.chrome.com/docs/extensions/

## Key Points

- **Manifest V3** is the current standard (V2 deprecated)
- **Content scripts** run in an isolated world — can access page DOM but not page JS variables
- **Service workers** replace background pages — event-driven, no persistent state
- **No remote code** — all JS must be bundled in the extension package
- **No `eval()`** — Content Security Policy prohibits it

## Content Scripts

### Available APIs (direct access)
- `chrome.storage` — sync/local storage
- `chrome.runtime.sendMessage()` — messaging to service worker
- `chrome.runtime.onMessage` — receive messages
- `chrome.i18n` — internationalization
- `dom` — full DOM access

### Registration (manifest.json)
```json
{
  "content_scripts": [{
    "matches": ["<all_urls>"],
    "js": ["file.js"],
    "css": ["file.css"],
    "run_at": "document_idle",
    "all_frames": true
  }]
}
```

### `run_at` values
- `document_idle` — after DOM ready, before load event (default, recommended)
- `document_start` — before any DOM construction
- `document_end` — after DOM ready

## Storage API

```js
// Save
chrome.storage.sync.set({ key: value });

// Load
chrome.storage.sync.get({ key: default }, (data) => { ... });

// Listen for changes
chrome.storage.onChanged.addListener((changes) => { ... });
```

- `sync` — syncs across user's Chrome instances (100KB limit)
- `local` — local only (5MB limit)

## Permissions

| Permission | What it does |
|-----------|-------------|
| `storage` | Access to `chrome.storage` API |
| `activeTab` | Temporary access to current tab on user action |
| `host_permissions` | Access to specific URLs |

Prefer minimal permissions. `storage` is all we need for the toggle.

## Publishing

1. Create ZIP of extension directory
2. Upload at https://chrome.google.com/webstore/devconsole
3. $5 one-time developer registration fee
4. Review takes 1-3 business days

## Sources
- https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts
- https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3
- https://developer.chrome.com/docs/extensions/reference/api/storage
