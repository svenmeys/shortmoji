# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.0] - 2026-11-02

### Fixed
- The dropdown landed off-screen on any text field without an explicit line-height, while still taking Enter
- `:constructor:` and `:__proto__:` inserted JavaScript internals as text
- `x[a:b:` and `foo:fire:` turned into emoji. A shortcode now needs a start that is not a word, colon, slash or dot
- `:-p` and `:-o` opened the dropdown and Enter replaced them with an unrelated emoji
- `#1234` opened the dropdown and took the Enter that sends the message
- Paste and Backspace converted a shortcode nobody was typing
- Composing with an IME was interrupted mid-word
- Shift+Enter and Cmd+Enter were eaten as picks
- Moving the caret left the dropdown open, and Enter then replaced the wrong text
- Arrow keys leaked to the page while the dropdown was open
- Escape closed the dropdown only until the next character
- The dropdown stayed behind after focus moved, the page scrolled, or the extension was turned off
- An exact match could sit below longer ones: `:ok` listed `ok_hand` first

### Added
- Slate, CKEditor 5 and Trix now accept the replacement. They used to revert it
- Editors inside open shadow roots and `about:blank`/`srcdoc` iframes, which covers TinyMCE
- Screen reader roles on the dropdown, and named, focusable switches in the popup
- `test/e2e.py`: loads the real extension in a browser and types with real keys

### Changed
- Typing in a long document no longer gets slower with its length, and the dropdown is measured once per shortcode
- Emoji data is only built in a frame once someone starts a shortcode there
- Unit tests now run the shipped code. They used to test a pasted copy

## [1.1.1] - 2026-02-26

### Added
- Firefox support and build scripts
- `#` trigger and auto-replace toggle
- Ko-fi link

## [1.0.0] - 2026-02-25

### Added
- Initial release
- 1870+ emoji shortcodes (full gemoji set)
- Instant replacement on closing `:` (e.g., `:fire:` → 🔥)
- Autocomplete dropdown with keyboard navigation
- Works in textarea, input, and contenteditable fields
- Toggle on/off via extension popup
- Catppuccin Mocha themed dropdown
