# Gemoji Reference

Shortmoji uses the [gemoji](https://github.com/github/gemoji) shortcode standard — the same one used by Slack, GitHub, and Discord.

## Source Data

- **Repository:** https://github.com/github/gemoji
- **Format:** JSON array of objects with `emoji`, `description`, `category`, `aliases`, `tags`
- **Count:** 1870 emoji, 1913 shortcodes (some emoji have multiple aliases)
- **Generated:** `emoji-data.js` is auto-generated from gemoji JSON

## Regenerating emoji-data.js

If gemoji updates, regenerate:

```bash
curl -sL https://raw.githubusercontent.com/github/gemoji/master/db/emoji.json -o /tmp/gemoji.json

cat /tmp/gemoji.json | python3 -c "
import json, sys
data = json.load(sys.stdin)
lines = []
for e in data:
    if 'emoji' in e and 'aliases' in e:
        for alias in e['aliases']:
            lines.append(f\"  '{alias}': '{e['emoji']}'\")
print('const EMOJI_DATA = {')
print(',\n'.join(lines))
print('};')
" > emoji-data.js
```

## Category Breakdown

| Category | Count |
|----------|-------|
| Smileys & Emotion | 166 |
| People & Body | 363 |
| Animals & Nature | 152 |
| Food & Drink | 133 |
| Travel & Places | 218 |
| Activities | 85 |
| Objects | 261 |
| Symbols | 223 |
| Flags | 269 |

## Common Gotchas

| What people type | Correct shortcode | Emoji |
|-----------------|-------------------|-------|
| `:thumbs_up:` | `:thumbsup:` or `:+1:` | 👍 |
| `:check:` | `:white_check_mark:` | ✅ |
| `:blue_circle:` | `:large_blue_circle:` | 🔵 |
| `:steak:` | `:cut_of_meat:` | 🥩 |
| `:flag-us:` | `:us:` | 🇺🇸 |
| `:flag-gb:` | `:gb:` or `:uk:` | 🇬🇧 |
