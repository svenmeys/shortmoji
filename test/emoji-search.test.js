import { describe, test, expect } from 'bun:test';

// Load the files the extension ships, not a copy of them.
const source = async (f) => Bun.file(`${import.meta.dir}/../${f}`).text();
const { EMOJI_DATA, searchEmojis, findTrigger } = new Function(
  `${await source('emoji-data.js')}\n${await source('match.js')}\nreturn { EMOJI_DATA: loadEmojiData(), searchEmojis, findTrigger };`
)();

// --- Tests ---

describe('EMOJI_DATA', () => {
  test('has entries', () => {
    expect(Object.keys(EMOJI_DATA).length).toBeGreaterThan(1800);
  });

  test('every shortcode can be typed', () => {
    for (const sc of Object.keys(EMOJI_DATA)) expect(sc).toMatch(/^[a-z0-9_+\-]+$/);
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

  test('exact match comes first', () => {
    for (const q of ['ok', 'car', 'cat', 'man']) expect(searchEmojis(q)[0].shortcode).toBe(q);
  });

  test('two chars never match inside a word', () => {
    expect(searchEmojis('-p')).toEqual([]);
    expect(searchEmojis('-o')).toEqual([]);
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

  describe('not shortcodes', () => {
    test('object builtins', () => {
      expect(findTrigger(':constructor:')).toBeNull();
      expect(findTrigger(':__proto__:')).toBeNull();
    });

    test('colons in code and URLs', () => {
      for (const s of ['x[a:b:', 'foo:fire:', 'http://x.io:100:', 'std::x:']) expect(findTrigger(s)).toBeNull();
    });

    test('issue numbers and capitalised hashtags', () => {
      expect(findTrigger('fixes #1234')).toBeNull();
      expect(findTrigger('#Fire')).toBeNull();
    });

    test('closing colon without allowInstant', () => {
      expect(findTrigger('see :fire:', false)).toBeNull();
    });
  });

  describe('still shortcodes', () => {
    test('right after an emoji or a bracket', () => {
      expect(findTrigger('🔥:rocket:').emoji).toBe('🚀');
      expect(findTrigger('(:fire:').emoji).toBe('🔥');
      expect(findTrigger('(:roc').mode).toBe('autocomplete');
    });

    test('offsets stay right in text far longer than the search window', () => {
      const long = 'x '.repeat(5000);
      expect(findTrigger(long + ':fire:').start).toBe(long.length);
      expect(findTrigger(long + ':roc').start).toBe(long.length);
    });

    test('uppercase after a colon', () => {
      expect(findTrigger(':FIRE:').emoji).toBe('🔥');
      expect(findTrigger(':Rocke').results[0].shortcode).toBe('rocket');
    });

    test('100 and +1', () => {
      expect(findTrigger(':100:').emoji).toBe('💯');
      expect(findTrigger(':+1:').emoji).toBe('👍');
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
