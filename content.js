(() => {
  'use strict';

  let dropdown = null;
  let selectedIndex = 0;
  let matches = [];
  let enabled = true;
  let autoReplace = true;
  let activeEl = null;
  let triggerStart = -1;

  // Sync settings
  chrome.storage.sync.get({ enabled: true, autoReplace: true }, (d) => {
    enabled = d.enabled;
    autoReplace = d.autoReplace;
  });
  chrome.storage.onChanged.addListener((c) => {
    if (c.enabled) enabled = c.enabled.newValue;
    if (c.autoReplace) autoReplace = c.autoReplace.newValue;
  });

  // --- Trigger detection (shared between textarea + contenteditable) ---

  function findTrigger(before) {
    // 1. Instant replacement: :shortcode: (colon-only, full match, if enabled)
    if (autoReplace) {
      const instant = before.match(/:([a-z0-9_+\-]+):$/);
      if (instant && EMOJI_DATA[instant[1]]) {
        return { mode: 'instant', start: before.length - instant[0].length, emoji: EMOJI_DATA[instant[1]] };
      }
    }

    // 2. Autocomplete: :query or #query (2+ chars, preceded by whitespace or start)
    const trigger = before.match(/[:#]([a-z0-9_+\-]{2,})$/);
    if (!trigger) return null;

    const pos = before.length - trigger[0].length;
    if (pos > 0 && !/\s/.test(before[pos - 1])) return null;

    const results = searchEmojis(trigger[1]);
    if (!results.length) return null;

    return { mode: 'autocomplete', start: pos, results };
  }

  // --- Dropdown ---

  function ensureDropdown() {
    if (dropdown) return;
    dropdown = document.createElement('div');
    dropdown.id = 'shortmoji-dropdown';
    document.documentElement.appendChild(dropdown);
  }

  function showDropdown(x, y, items) {
    ensureDropdown();
    dropdown.innerHTML = '';
    items.forEach((item, i) => {
      const row = document.createElement('div');
      row.className = 'shortmoji-item' + (i === selectedIndex ? ' selected' : '');
      row.innerHTML = `<span class="emoji">${item.emoji}</span><span class="shortcode">:${item.shortcode}:</span>`;
      row.addEventListener('mousedown', (e) => { e.preventDefault(); selectItem(i); });
      dropdown.appendChild(row);
    });

    const vw = window.innerWidth, vh = window.innerHeight;
    dropdown.classList.add('visible');
    const dw = dropdown.offsetWidth, dh = dropdown.offsetHeight;
    dropdown.style.left = Math.min(x, vw - dw - 8) + 'px';
    dropdown.style.top = (y + dh > vh ? y - dh - 4 : y + 4) + 'px';
  }

  function hideDropdown() {
    if (dropdown) { dropdown.classList.remove('visible'); dropdown.innerHTML = ''; }
    matches = [];
    selectedIndex = 0;
    activeEl = null;
    triggerStart = -1;
  }

  function updateSelection() {
    if (!dropdown) return;
    const items = dropdown.querySelectorAll('.shortmoji-item');
    items.forEach((el, i) => el.classList.toggle('selected', i === selectedIndex));
    items[selectedIndex]?.scrollIntoView({ block: 'nearest' });
  }

  // --- Caret position ---

  function getTextFieldCaret(el) {
    const cs = getComputedStyle(el);
    const mirror = document.createElement('div');
    mirror.style.cssText = 'position:fixed;left:-9999px;top:0;visibility:hidden;white-space:pre-wrap;word-wrap:break-word;';
    mirror.style.font = cs.font;
    mirror.style.padding = cs.padding;
    mirror.style.border = cs.border;
    mirror.style.boxSizing = cs.boxSizing;
    mirror.style.width = cs.width;
    mirror.style.letterSpacing = cs.letterSpacing;
    mirror.style.textIndent = cs.textIndent;
    mirror.style.lineHeight = cs.lineHeight;

    mirror.textContent = el.value.substring(0, el.selectionStart);
    const marker = document.createElement('span');
    marker.textContent = '\u200b';
    mirror.appendChild(marker);
    document.body.appendChild(mirror);

    const mr = mirror.getBoundingClientRect(), sr = marker.getBoundingClientRect(), er = el.getBoundingClientRect();
    const x = er.left + (sr.left - mr.left) - el.scrollLeft;
    const y = er.top + (sr.top - mr.top) - el.scrollTop + parseFloat(cs.lineHeight || cs.fontSize);
    document.body.removeChild(mirror);
    return { x, y };
  }

  function getCECaret() {
    const sel = window.getSelection();
    if (!sel.rangeCount) return null;
    const range = sel.getRangeAt(0).cloneRange();
    range.collapse(true);
    const rect = range.getBoundingClientRect();
    if (rect.x === 0 && rect.y === 0) return null;
    return { x: rect.left, y: rect.bottom };
  }

  // --- Replacement ---

  function replaceText(el, start, end, text) {
    if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
      el.focus();
      el.setSelectionRange(start, end);
      document.execCommand('insertText', false, text);
    } else {
      const sel = window.getSelection();
      if (!sel.rangeCount) return;
      const node = sel.getRangeAt(0).startContainer;
      if (node.nodeType !== Node.TEXT_NODE) return;
      const range = document.createRange();
      range.setStart(node, start);
      range.setEnd(node, end);
      sel.removeAllRanges();
      sel.addRange(range);
      document.execCommand('insertText', false, text);
    }
  }

  // --- Search ---

  function searchEmojis(query) {
    const q = query.toLowerCase();
    const prefix = [], contains = [];
    for (const sc in EMOJI_DATA) {
      if (sc.startsWith(q)) prefix.push({ shortcode: sc, emoji: EMOJI_DATA[sc] });
      else if (sc.includes(q)) contains.push({ shortcode: sc, emoji: EMOJI_DATA[sc] });
    }
    return [...prefix, ...contains].slice(0, 8);
  }

  // --- Input handling ---

  function isEditable(el) {
    if (!el) return false;
    const t = el.tagName;
    return t === 'TEXTAREA' || (t === 'INPUT' && /^(|text|search|url|email)$/.test(el.type)) || el.isContentEditable;
  }

  document.addEventListener('input', (e) => {
    if (!enabled) return;
    const el = e.target;
    if (!isEditable(el)) return;

    if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
      const cursor = el.selectionStart;
      const before = el.value.substring(0, cursor);
      const hit = findTrigger(before);

      if (!hit) { hideDropdown(); return; }
      if (hit.mode === 'instant') { replaceText(el, hit.start, cursor, hit.emoji); hideDropdown(); return; }

      activeEl = el;
      triggerStart = hit.start;
      matches = hit.results;
      selectedIndex = 0;
      showDropdown(...Object.values(getTextFieldCaret(el)), matches);
    } else if (el.isContentEditable) {
      const sel = window.getSelection();
      if (!sel.rangeCount) return;
      const node = sel.getRangeAt(0).startContainer;
      if (node.nodeType !== Node.TEXT_NODE) { hideDropdown(); return; }

      const cursor = sel.getRangeAt(0).startOffset;
      const before = node.textContent.substring(0, cursor);
      const hit = findTrigger(before);

      if (!hit) { hideDropdown(); return; }
      if (hit.mode === 'instant') { replaceText(el, hit.start, cursor, hit.emoji); hideDropdown(); return; }

      activeEl = el;
      triggerStart = hit.start;
      matches = hit.results;
      selectedIndex = 0;
      const pos = getCECaret();
      if (pos) showDropdown(pos.x, pos.y, matches);
    }
  }, true);

  // --- Selection ---

  function selectItem(index) {
    const item = matches[index];
    if (!item || !activeEl) return;

    if (activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'INPUT') {
      replaceText(activeEl, triggerStart, activeEl.selectionStart, item.emoji);
    } else if (activeEl.isContentEditable) {
      const sel = window.getSelection();
      if (sel.rangeCount) replaceText(activeEl, triggerStart, sel.getRangeAt(0).startOffset, item.emoji);
    }
    hideDropdown();
  }

  // --- Keyboard ---

  document.addEventListener('keydown', (e) => {
    if (!dropdown || !dropdown.classList.contains('visible')) return;

    if (e.key === 'ArrowDown') { e.preventDefault(); selectedIndex = (selectedIndex + 1) % matches.length; updateSelection(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); selectedIndex = (selectedIndex - 1 + matches.length) % matches.length; updateSelection(); }
    else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); e.stopPropagation(); selectItem(selectedIndex); }
    else if (e.key === 'Escape') { e.preventDefault(); hideDropdown(); }
  }, true);

  // --- Click outside ---

  document.addEventListener('mousedown', (e) => {
    if (dropdown && !dropdown.contains(e.target)) hideDropdown();
  }, true);
})();
