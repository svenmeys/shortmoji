import { describe, test, expect } from 'bun:test';

// Load emoji data by evaluating the file (it declares a global const)
const dataFile = await Bun.file(import.meta.dir + '/../emoji-data.js').text();
const EMOJI_DATA = new Function(dataFile + '; return EMOJI_DATA;')();

// Extract pure functions from content.js for testing
function searchEmojis(query) {
  const q = query.toLowerCase();
  const prefix = [], contains = [];
  for (const sc in EMOJI_DATA) {
    if (sc.startsWith(q)) prefix.push({ shortcode: sc, emoji: EMOJI_DATA[sc] });
    else if (sc.includes(q)) contains.push({ shortcode: sc, emoji: EMOJI_DATA[sc] });
  }
  return [...prefix, ...contains].slice(0, 8);
}

function findTrigger(before, autoReplace = true) {
  if (autoReplace) {
    const instant = before.match(/:([a-z0-9_+\-]+):$/);
    if (instant && EMOJI_DATA[instant[1]]) {
      return { mode: 'instant', start: before.length - instant[0].length, emoji: EMOJI_DATA[instant[1]] };
    }
  }

  const trigger = before.match(/[:#]([a-z0-9_+\-]{2,})$/);
  if (!trigger) return null;

  const pos = before.length - trigger[0].length;
  if (pos > 0 && !/\s/.test(before[pos - 1])) return null;

  const results = searchEmojis(trigger[1]);
  if (!results.length) return null;

  return { mode: 'autocomplete', start: pos, results };
}

// --- Tests ---

describe('EMOJI_DATA', () => {
  test('has entries', () => {
    expect(Object.keys(EMOJI_DATA).length).toBeGreaterThan(1800);
  });

  test('common shortcodes exist', () => {
    expect(EMOJI_DATA['smile']).toBe('😄');
    expect(EMOJI_DATA['fire']).toBe('🔥');
    expect(EMOJI_DATA['rocket']).toBe('🚀');
    expect(EMOJI_DATA['heart']).toBe('❤️');
    expect(EMOJI_DATA['thumbsup']).toBe('👍');
    expect(EMOJI_DATA['+1']).toBe('👍');
    expect(EMOJI_DATA['tada']).toBe('🎉');
    expect(EMOJI_DATA['eyes']).toBe('👀');
    expect(EMOJI_DATA['100']).toBe('💯');
  });
});

describe('searchEmojis', () => {
  test('prefix matches come first', () => {
    const results = searchEmojis('smi');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].shortcode).toStartWith('smi');
  });

  test('contains matches are included', () => {
    const results = searchEmojis('heart');
    const shortcodes = results.map(r => r.shortcode);
    expect(shortcodes).toContain('heart');
    // Should also find things like "broken_heart" via contains
    expect(results.length).toBeGreaterThan(1);
  });

  test('returns max 8 results', () => {
    const results = searchEmojis('sm');
    expect(results.length).toBeLessThanOrEqual(8);
  });

  test('returns empty for no match', () => {
    const results = searchEmojis('zzzzxxx');
    expect(results).toEqual([]);
  });

  test('case insensitive', () => {
    const results = searchEmojis('FIRE');
    // query is lowercased internally, so this should still work
    expect(results.length).toBeGreaterThan(0);
  });

  test('each result has shortcode and emoji', () => {
    const results = searchEmojis('rock');
    for (const r of results) {
      expect(r).toHaveProperty('shortcode');
      expect(r).toHaveProperty('emoji');
      expect(typeof r.emoji).toBe('string');
    }
  });
});

describe('findTrigger', () => {
  describe('instant replacement', () => {
    test(':smile: triggers instant replace', () => {
      const hit = findTrigger('hello :smile:');
      expect(hit.mode).toBe('instant');
      expect(hit.emoji).toBe('😄');
      expect(hit.start).toBe(6);
    });

    test(':fire: at start of text', () => {
      const hit = findTrigger(':fire:');
      expect(hit.mode).toBe('instant');
      expect(hit.emoji).toBe('🔥');
      expect(hit.start).toBe(0);
    });

    test('unknown shortcode does not instant replace', () => {
      const hit = findTrigger(':notarealshortcode:');
      expect(hit).toBeNull();
    });

    test('instant replace disabled when autoReplace=false', () => {
      // :smile: with closing colon — no instant replace, no autocomplete either
      // (trailing : breaks the autocomplete regex). This is correct: user must use dropdown
      expect(findTrigger('hello :smile:', false)).toBeNull();

      // But partial :smi still triggers autocomplete
      const hit = findTrigger('hello :smi', false);
      expect(hit).not.toBeNull();
      expect(hit.mode).toBe('autocomplete');
    });
  });

  describe('autocomplete with colon', () => {
    test(':smi triggers autocomplete', () => {
      const hit = findTrigger('hello :smi');
      expect(hit.mode).toBe('autocomplete');
      expect(hit.results.length).toBeGreaterThan(0);
      expect(hit.start).toBe(6);
    });

    test('needs 2+ chars after colon', () => {
      expect(findTrigger('hello :s')).toBeNull();
    });

    test('no trigger without preceding whitespace', () => {
      expect(findTrigger('http://example.com:8080')).toBeNull();
    });

    test('works at start of text', () => {
      const hit = findTrigger(':roc');
      expect(hit).not.toBeNull();
      expect(hit.mode).toBe('autocomplete');
    });
  });

  describe('autocomplete with pound', () => {
    test('#smi triggers autocomplete', () => {
      const hit = findTrigger('hello #smi');
      expect(hit.mode).toBe('autocomplete');
      expect(hit.results.length).toBeGreaterThan(0);
    });

    test('#fire triggers autocomplete', () => {
      const hit = findTrigger('text #fire');
      expect(hit).not.toBeNull();
      expect(hit.mode).toBe('autocomplete');
    });

    test('no trigger for mid-word #', () => {
      expect(findTrigger('word#fire')).toBeNull();
    });

    test('works at start of text', () => {
      const hit = findTrigger('#rock');
      expect(hit).not.toBeNull();
      expect(hit.mode).toBe('autocomplete');
    });
  });

  describe('edge cases', () => {
    test('empty string returns null', () => {
      expect(findTrigger('')).toBeNull();
    });

    test('just a colon returns null', () => {
      expect(findTrigger(':')).toBeNull();
    });

    test('colon with one char returns null', () => {
      expect(findTrigger(':s')).toBeNull();
    });

    test('no match returns null', () => {
      expect(findTrigger(':zzzzxxx')).toBeNull();
    });
  });
});
