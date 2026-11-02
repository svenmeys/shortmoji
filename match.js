// Pure shortcode matching. Shared by content.js and test/emoji-search.test.js, so the tests run this code.

let emojiData = null;
function emojis() {
  return emojiData || (emojiData = loadEmojiData());
}

// Longest shortcode is 40 chars. Looking further back only makes every keystroke slower in long documents.
const TAIL = 64;
const MAX_RESULTS = 8;
// A shortcode cannot start right after one of these: a:b: and std::x: and host:100: are not emoji.
const NOT_A_START = /[\p{L}\p{N}_:/.]$/u;

function canStartAt(tail, index) {
  return !NOT_A_START.test(tail.slice(0, index));
}

function searchEmojis(query) {
  const q = query.toLowerCase();
  const data = emojis();
  const best = Object.hasOwn(data, q) ? [{ shortcode: q, emoji: data[q] }] : [];
  const contains = [];
  for (const sc in data) {
    if (sc === q) continue;
    if (sc.startsWith(q)) {
      best.push({ shortcode: sc, emoji: data[sc] });
      if (best.length === MAX_RESULTS) return best;
    } else if (q.length > 2 && contains.length < MAX_RESULTS && sc.includes(q)) {
      // Two chars would match inside any word: :-p finds non-potable_water.
      contains.push({ shortcode: sc, emoji: data[sc] });
    }
  }
  return [...best, ...contains].slice(0, MAX_RESULTS);
}

// allowInstant: false for anything but a typed closing colon, so paste and backspace stay literal.
function findTrigger(before, allowInstant = true) {
  const tail = before.slice(-TAIL);

  const instant = allowInstant && tail.match(/:([a-z0-9_+\-]+):$/);
  if (instant && canStartAt(tail, instant.index)) {
    const data = emojis();
    // hasOwn, because :constructor: is a property of every object.
    if (Object.hasOwn(data, instant[1])) {
      return { mode: 'instant', start: before.length - instant[0].length, emoji: data[instant[1]] };
    }
  }

  const trigger = tail.match(/[:#]([a-z0-9_+\-]{2,})$/);
  if (!trigger || !canStartAt(tail, trigger.index)) return null;
  if (trigger[0][0] === '#' && /^\d+$/.test(trigger[1])) return null; // #1234 is an issue number

  const results = searchEmojis(trigger[1]);
  if (!results.length) return null;

  return { mode: 'autocomplete', start: before.length - trigger[0].length, results };
}
