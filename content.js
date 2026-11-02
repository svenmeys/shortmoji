(() => {
  'use strict';

  let enabled = true;
  let autoReplace = true;

  let dropdown = null;
  let open = false;
  let matches = [];
  let selectedIndex = 0;
  let activeEl = null;
  let triggerStart = -1;
  let anchor = null;    // { x, top, bottom } of the trigger, measured once per trigger
  let anchorFor = null; // the element and offset that anchor belongs to
  let dismissed = null; // the trigger Escape closed: { el, start }

  chrome.storage.sync.get({ enabled: true, autoReplace: true }, (d) => {
    enabled = d.enabled;
    autoReplace = d.autoReplace;
  });
  chrome.storage.onChanged.addListener((c) => {
    if (c.enabled) {
      enabled = c.enabled.newValue;
      if (!enabled) hideDropdown();
    }
    if (c.autoReplace) autoReplace = c.autoReplace.newValue;
  });

  const isTextField = (el) => el.tagName === 'TEXTAREA' || el.tagName === 'INPUT';

  // Email fields stay out: they report selectionStart as null, so nothing can be replaced in them.
  function isEditable(el) {
    if (!el || !el.tagName) return false;
    if (el.tagName === 'TEXTAREA') return true;
    if (el.tagName === 'INPUT') return /^(|text|search|url)$/.test(el.type);
    return el.isContentEditable || el.ownerDocument.designMode === 'on'; // Firefox says false in designMode
  }

  // pa-lean: Android keyboards type everything as one composition, so composition cannot mean "leave it alone" there.
  // Not tested on a device. Upgrade path: a real Firefox for Android run.
  const ANDROID = /Android/.test(navigator.userAgent);
  const isComposing = (e) => e.isComposing && !ANDROID;

  // --- Selection, including inside shadow roots ---

  // Chrome hides shadow content from document.getSelection, and only offers it on the root.
  function selectionFor(el) {
    const root = el.getRootNode();
    return root.getSelection ? root.getSelection() : document.getSelection();
  }

  function caretTextNode(el) {
    const sel = selectionFor(el);
    if (!sel || !sel.rangeCount) return null;
    const { startContainer: node, startOffset: offset } = sel.getRangeAt(0);
    if (node.nodeType === Node.TEXT_NODE) return { node, offset };
    // Some editors park the caret on an element, after the text it follows.
    let last = node.childNodes[offset - 1];
    while (last && last.nodeType !== Node.TEXT_NODE) last = last.lastChild;
    return last ? { node: last, offset: last.length } : null;
  }

  // --- Dropdown ---

  function renderDropdown() {
    if (!dropdown) {
      dropdown = document.createElement('div');
      dropdown.id = 'shortmoji-dropdown';
      dropdown.setAttribute('role', 'listbox');
      dropdown.setAttribute('aria-label', 'Emoji');
      document.documentElement.appendChild(dropdown);
    }
    dropdown.replaceChildren(...matches.map((item, i) => {
      const row = document.createElement('div');
      row.className = 'shortmoji-item' + (i === selectedIndex ? ' selected' : '');
      row.setAttribute('role', 'option');
      row.setAttribute('aria-selected', String(i === selectedIndex));
      const emoji = document.createElement('span');
      emoji.className = 'emoji';
      emoji.textContent = item.emoji;
      const code = document.createElement('span');
      code.className = 'shortcode';
      code.textContent = `:${item.shortcode}:`;
      row.append(emoji, code);
      row.addEventListener('mousedown', (e) => { e.preventDefault(); selectItem(i); });
      // mousemove, not hover: a pointer that happens to rest under the list must not look like a choice.
      row.addEventListener('mousemove', () => {
        if (selectedIndex !== i) { selectedIndex = i; updateSelection(); }
      });
      return row;
    }));
  }

  function placeDropdown() {
    dropdown.classList.add('visible');
    dropdown.style.maxHeight = '';
    const width = dropdown.offsetWidth, height = dropdown.offsetHeight;
    dropdown.style.left = Math.max(8, Math.min(anchor.x, window.innerWidth - width - 8)) + 'px';
    // Never over the line being typed: take the roomier side and scroll inside it if the list does not fit.
    const below = window.innerHeight - anchor.bottom - 12, above = anchor.top - 12;
    const useBelow = height <= below || below >= above;
    const shown = Math.min(height, useBelow ? below : above);
    if (shown < height) dropdown.style.maxHeight = shown + 'px';
    dropdown.style.top = (useBelow ? anchor.bottom + 4 : anchor.top - shown - 4) + 'px';
  }

  // Measuring a long textarea takes tens of milliseconds, so it happens once per trigger, not per keystroke.
  function showDropdown(el, node, start, offset) {
    const key = node || el;
    if (!anchorFor || anchorFor.key !== key || anchorFor.start !== start) {
      anchor = measureAnchor(el, node, start, offset);
      anchorFor = { key, start };
    }
    if (!anchor) { hideDropdown(); return; }
    renderDropdown();
    placeDropdown();
    if (!open) {
      open = true;
      window.addEventListener('scroll', remeasure, { capture: true, passive: true });
      window.addEventListener('resize', remeasure);
      window.addEventListener('focusout', hideDropdown, true);
    }
  }

  function hideDropdown() {
    if (open) {
      open = false;
      dropdown.classList.remove('visible');
      dropdown.replaceChildren();
      window.removeEventListener('scroll', remeasure, { capture: true });
      window.removeEventListener('resize', remeasure);
      window.removeEventListener('focusout', hideDropdown, true);
    }
    matches = [];
    selectedIndex = 0;
    activeEl = null;
    triggerStart = -1;
    anchorFor = null;
  }

  function updateSelection() {
    const items = dropdown.querySelectorAll('.shortmoji-item');
    items.forEach((el, i) => {
      el.classList.toggle('selected', i === selectedIndex);
      el.setAttribute('aria-selected', String(i === selectedIndex));
    });
    items[selectedIndex]?.scrollIntoView({ block: 'nearest' });
  }

  let remeasureQueued = false;
  function remeasure() {
    if (remeasureQueued) return;
    remeasureQueued = true;
    requestAnimationFrame(() => {
      remeasureQueued = false;
      if (!open) return;
      if (isTextField(activeEl)) {
        anchor = measureAnchor(activeEl, null, triggerStart);
      } else {
        const ctx = caretTextNode(activeEl);
        anchor = ctx && measureAnchor(activeEl, ctx.node, triggerStart, ctx.offset);
      }
      if (anchor) placeDropdown(); else hideDropdown();
    });
  }

  // --- Where the trigger is on screen ---

  const MIRRORED = ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'fontVariant', 'fontStretch', 'lineHeight',
    'letterSpacing', 'wordSpacing', 'textIndent', 'textTransform', 'tabSize', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'];

  function measureTextField(el, start) {
    const cs = getComputedStyle(el);
    const box = el.getBoundingClientRect();
    const single = el.tagName === 'INPUT';
    const mirror = document.createElement('div');
    for (const prop of MIRRORED) mirror.style[prop] = cs[prop];
    mirror.style.position = 'fixed';
    mirror.style.left = '-9999px';
    mirror.style.top = '0';
    mirror.style.visibility = 'hidden';
    mirror.style.border = '0';
    mirror.style.boxSizing = 'border-box';
    mirror.style.width = el.clientWidth + 'px';
    mirror.style.whiteSpace = single ? 'pre' : 'pre-wrap';
    mirror.style.overflowWrap = 'break-word';
    mirror.textContent = el.value.substring(0, start);
    const marker = document.createElement('span');
    marker.textContent = '​';
    mirror.appendChild(marker);
    document.documentElement.appendChild(mirror);
    const from = mirror.getBoundingClientRect(), to = marker.getBoundingClientRect();
    mirror.remove();

    const x = box.left + el.clientLeft + (to.left - from.left) - el.scrollLeft;
    const clampedX = Math.max(box.left, Math.min(x, box.right));
    // A single-line field centers its text, so the field itself is the useful edge.
    if (single) return { x: clampedX, top: box.top, bottom: box.bottom };
    const top = box.top + el.clientTop + (to.top - from.top) - el.scrollTop;
    return { x: clampedX, top, bottom: top + to.height };
  }

  function measureAnchor(el, node, start, offset) {
    if (!node) return measureTextField(el, start);
    if (start > node.length || offset > node.length) return null;
    const range = document.createRange();
    range.setStart(node, start);
    range.setEnd(node, offset);
    const rect = range.getClientRects()[0] || el.getBoundingClientRect();
    return { x: rect.left, top: rect.top, bottom: rect.bottom };
  }

  // --- Replacement ---

  function replaceText(el, node, start, end, text) {
    if (!node) {
      el.focus();
      el.setSelectionRange(start, end);
      if (!document.execCommand('insertText', false, text)) {
        el.setRangeText(text, start, end, 'end');
        el.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, inputType: 'insertText', data: text }));
      }
      return;
    }
    if (end > node.length) return;
    const range = document.createRange();
    range.setStart(node, start);
    range.setEnd(node, end);
    const sel = selectionFor(el);
    sel.removeAllRanges();
    sel.addRange(range);
    // execCommand fires no beforeinput, and Slate and CKEditor take edits from that event alone. They treat anything
    // else as foreign and put their own text back. An editor that cancels this one has made the edit itself.
    const handled = !el.dispatchEvent(new InputEvent('beforeinput', {
      bubbles: true, cancelable: true, composed: true, inputType: 'insertText', data: text, targetRanges: [new StaticRange(range)],
    }));
    if (!handled) document.execCommand('insertText', false, text);
  }

  // --- Reacting to text changes ---

  function update(el, allowInstant) {
    let node = null, cursor, before;
    if (isTextField(el)) {
      cursor = el.selectionStart;
      if (cursor === null) { hideDropdown(); return; }
      before = el.value.substring(0, cursor);
    } else {
      const ctx = caretTextNode(el);
      if (!ctx) { hideDropdown(); return; }
      node = ctx.node;
      cursor = ctx.offset;
      before = node.data.substring(0, cursor);
    }

    const hit = findTrigger(before, autoReplace && allowInstant);
    if (!hit) { dismissed = null; hideDropdown(); return; }
    if (dismissed && dismissed.el === el && dismissed.start === hit.start) { hideDropdown(); return; }
    if (hit.mode === 'instant') {
      hideDropdown();
      if (!node) replaceText(el, null, hit.start, cursor, hit.emoji);
      else setTimeout(() => replaceInstantInEditor(el));
      return;
    }

    activeEl = el;
    triggerStart = hit.start;
    matches = hit.results;
    selectedIndex = 0;
    showDropdown(el, node, hit.start, cursor);
  }

  // Rich editors reconcile the DOM right after this event and undo a change made inside it (Slate, CKEditor, Trix),
  // so this runs once they are done, and checks the shortcode is still what sits before the caret.
  function replaceInstantInEditor(el) {
    const ctx = caretTextNode(el);
    if (!ctx) return;
    const hit = findTrigger(ctx.node.data.substring(0, ctx.offset));
    if (hit?.mode === 'instant') replaceText(el, ctx.node, hit.start, ctx.offset, hit.emoji);
  }

  function onTextChange(e, el) {
    if (isComposing(e)) { hideDropdown(); return; }
    const typing = e.inputType === 'insertText' || (ANDROID && e.inputType === 'insertCompositionText');
    // Paste, undo and drag-and-drop put text here too. None of them are someone asking for an emoji.
    if (!typing && !e.inputType?.startsWith('delete')) { hideDropdown(); return; }
    update(el, typing && !!e.data?.endsWith(':'));
  }

  window.addEventListener('input', (e) => {
    if (!enabled) return;
    const el = e.composedPath()[0];
    if (isEditable(el)) onTextChange(e, el);
  }, true);

  // Slate and others cancel beforeinput and write the DOM themselves, so no input event ever comes.
  window.addEventListener('beforeinput', (e) => {
    if (!enabled || !e.isTrusted) return;
    const el = e.composedPath()[0];
    setTimeout(() => {
      if (e.defaultPrevented && isEditable(el)) onTextChange(e, el);
    });
  }, true);

  // --- Picking ---

  function selectItem(index) {
    const item = matches[index];
    if (!item || !activeEl) return;

    if (isTextField(activeEl)) {
      replaceText(activeEl, null, triggerStart, activeEl.selectionStart, item.emoji);
    } else {
      const ctx = caretTextNode(activeEl);
      if (ctx) replaceText(activeEl, ctx.node, triggerStart, ctx.offset, item.emoji);
    }
    hideDropdown();
  }

  // --- Keyboard ---

  const CARET_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown']);

  // On window, in capture, because that runs before any listener the page put on the field or document.
  window.addEventListener('keydown', (e) => {
    if (!open || e.isComposing || e.keyCode === 229) return;

    const take = () => { e.preventDefault(); e.stopImmediatePropagation(); };
    const plain = !(e.shiftKey || e.ctrlKey || e.metaKey || e.altKey);

    if (CARET_KEYS.has(e.key)) hideDropdown();
    else if (e.key === 'Enter' || e.key === 'Tab') {
      // Shift+Enter is a newline and Cmd+Enter is send. Neither is a pick.
      if (plain) { take(); selectItem(selectedIndex); } else hideDropdown();
    }
    else if (e.key === 'ArrowDown') { take(); selectedIndex = (selectedIndex + 1) % matches.length; updateSelection(); }
    else if (e.key === 'ArrowUp') { take(); selectedIndex = (selectedIndex - 1 + matches.length) % matches.length; updateSelection(); }
    else if (e.key === 'Escape') { take(); dismissed = { el: activeEl, start: triggerStart }; hideDropdown(); }
  }, true);

  // --- Click outside ---

  window.addEventListener('mousedown', (e) => {
    if (open && !dropdown.contains(e.target)) hideDropdown();
  }, true);
})();
