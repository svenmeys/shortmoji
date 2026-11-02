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

  const isTextField = (el) => el.localName === 'textarea' || el.localName === 'input'; // tagName is lowercase in XHTML

  // Email fields stay out: they report selectionStart as null, so nothing can be replaced in them.
  function isEditable(el) {
    if (!el || !el.localName) return false;
    if (el.localName === 'textarea') return true;
    if (el.localName === 'input') return /^(|text|search|url)$/.test(el.type);
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

  // Styles are inline, in a shadow root: a page's own .selected or span rules cannot reach them, and CSP does not apply.
  const HOST_CSS = `all:initial!important;display:block!important;position:fixed!important;z-index:2147483647!important;
    box-sizing:border-box!important;margin:0!important;inset:auto!important;width:auto!important;height:auto!important;
    min-width:220px!important;max-width:calc(100vw - 16px)!important;max-height:280px!important;overflow-y:auto!important;
    padding:4px!important;background:#1e1e2e!important;border:1px solid #45475a!important;border-radius:8px!important;
    box-shadow:0 8px 24px rgba(0,0,0,.4)!important;
    font:14px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif!important;color:#cdd6f4!important;`;
  const ROW_CSS = 'display:flex;align-items:center;gap:10px;padding:6px 10px;border-radius:6px;cursor:pointer;';
  // The outline is what survives Windows high contrast, which drops the background.
  const SELECTED_CSS = 'background:#313244;outline:1px solid #89b4fa;outline-offset:-1px;';
  const EMOJI_CSS = 'font-size:20px;width:28px;text-align:center;flex-shrink:0;';
  const CODE_CSS = 'color:#a6adc8;font-size:12px;';

  // Top layer elements (modal dialogs, fullscreen, popovers) cover everything outside them, and a modal makes the rest
  // of the page inert. The list has to live inside whichever one holds the field.
  function dropdownParent(el) {
    for (let n = el; n; n = n.parentNode || n.host) {
      if (n.matches && n.matches('dialog[open], [popover], :fullscreen')) return n;
    }
    return document.documentElement;
  }

  function connectDropdown(el) {
    if (!dropdown) {
      dropdown = document.createElement('div');
      dropdown.id = 'shortmoji-dropdown';
      dropdown.setAttribute('role', 'listbox');
      dropdown.setAttribute('aria-label', 'Emoji');
      dropdown.setAttribute('popover', 'manual');
      dropdown.style.cssText = HOST_CSS;
      dropdown.attachShadow({ mode: 'open' });
      // A press on the padding or scrollbar must not take focus from the field, which would close the list.
      dropdown.addEventListener('mousedown', (e) => e.preventDefault());
    }
    if (dropdown.isConnected) return;
    dropdownParent(el).appendChild(dropdown);
    dropdown.showPopover?.();
  }

  function renderDropdown() {
    dropdown.shadowRoot.replaceChildren(...matches.map((item, i) => {
      const row = document.createElement('div');
      row.style.cssText = ROW_CSS + (i === selectedIndex ? SELECTED_CSS : '');
      row.setAttribute('role', 'option');
      row.setAttribute('aria-selected', String(i === selectedIndex));
      const emoji = document.createElement('span');
      emoji.style.cssText = EMOJI_CSS;
      emoji.textContent = item.emoji;
      const code = document.createElement('span');
      code.style.cssText = CODE_CSS;
      code.textContent = `:${item.shortcode}:`;
      row.append(emoji, code);
      row.addEventListener('mousedown', (e) => { e.preventDefault(); selectItem(i); });
      // Only real movement counts: browsers send a still mousemove when the list scrolls under a resting pointer.
      row.addEventListener('mousemove', (e) => {
        if ((e.movementX || e.movementY) && selectedIndex !== i) { selectedIndex = i; updateSelection(); }
      });
      return row;
    }));
  }

  const ONE_ROW = 52;

  function placeDropdown() {
    dropdown.style.setProperty('max-height', '280px', 'important');
    const width = dropdown.offsetWidth, height = dropdown.offsetHeight;
    dropdown.style.setProperty('left', Math.max(8, Math.min(anchor.x, window.innerWidth - width - 8)) + 'px', 'important');
    // Never over the line being typed: take the roomier side and scroll inside it if the list does not fit.
    const below = window.innerHeight - anchor.bottom - 12, above = anchor.top - 12;
    const useBelow = height <= below || below >= above;
    const shown = Math.min(height, useBelow ? below : above);
    // Less than a row in view, as in a short iframe or a field scrolled away: no list, so the keys stay the page's.
    if (shown < Math.min(height, ONE_ROW)) { hideDropdown(); return; }
    dropdown.style.setProperty('max-height', shown + 'px', 'important');
    dropdown.style.setProperty('top', (useBelow ? anchor.bottom + 4 : anchor.top - shown - 4) + 'px', 'important');
  }

  // A shortcode can wrap to the next line while it is typed, so normally this measures on every key.
  // pa-lean: in a long textarea measuring takes tens of milliseconds, so it happens once per shortcode there.
  // Ceiling: the list can sit one line off if the shortcode wraps. Upgrade path: an incremental layout cache.
  const CHEAP_TO_MEASURE = 20000;
  function showDropdown(el, node, start, offset) {
    const key = node || el;
    const same = anchorFor && anchorFor.key === key && anchorFor.start === start;
    if (!same || node || el.value.length <= CHEAP_TO_MEASURE) {
      anchor = measureAnchor(el, node, start, offset);
      anchorFor = { key, start };
    }
    if (!anchor) { hideDropdown(); return; }
    connectDropdown(el);
    renderDropdown();
    if (!open) {
      open = true;
      window.addEventListener('scroll', remeasure, { capture: true, passive: true });
      window.addEventListener('resize', remeasure);
      window.addEventListener('focusout', hideDropdown, true);
    }
    placeDropdown();
  }

  function hideDropdown() {
    if (open) {
      open = false;
      dropdown.remove(); // nothing of ours stays in the page while the list is closed
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
    const rows = dropdown.shadowRoot.children;
    [...rows].forEach((row, i) => {
      row.style.cssText = ROW_CSS + (i === selectedIndex ? SELECTED_CSS : '');
      row.setAttribute('aria-selected', String(i === selectedIndex));
    });
    rows[selectedIndex]?.scrollIntoView({ block: 'nearest' });
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

  const MIRRORED = ['font-family', 'font-size', 'font-weight', 'font-style', 'font-variant', 'font-stretch', 'line-height',
    'letter-spacing', 'word-spacing', 'text-indent', 'text-transform', 'tab-size', 'direction', 'text-align',
    'padding-top', 'padding-right', 'padding-bottom', 'padding-left'];

  function measureTextField(el, start) {
    const cs = getComputedStyle(el);
    const box = el.getBoundingClientRect();
    const single = el.localName === 'input';
    // Same defence as the list: a page rule on div or span must not change what gets measured.
    const mirror = document.createElement('div');
    mirror.style.cssText = `all:initial!important;display:block!important;position:fixed!important;left:-9999px!important;
      top:0!important;visibility:hidden!important;box-sizing:border-box!important;width:${el.clientWidth}px!important;
      white-space:${single ? 'pre' : 'pre-wrap'}!important;overflow-wrap:break-word!important;`;
    for (const prop of MIRRORED) mirror.style.setProperty(prop, cs.getPropertyValue(prop), 'important');
    const root = mirror.attachShadow({ mode: 'open' });
    root.textContent = el.value.substring(0, start);
    // The whole word, because it decides which line the shortcode wraps to.
    const marker = document.createElement('span');
    marker.textContent = el.value.substring(start).match(/^\S*/)[0] || '\u200b';
    root.appendChild(marker);
    document.documentElement.appendChild(mirror);
    const from = mirror.getBoundingClientRect(), to = marker.getClientRects()[0];
    mirror.remove();

    // The box is on screen and the mirror is not, so a CSS transform on the field has to be applied by hand.
    const scaleX = box.width / el.offsetWidth || 1, scaleY = box.height / el.offsetHeight || 1;
    const x = box.left + scaleX * (el.clientLeft + (to.left - from.left) - el.scrollLeft);
    const clampedX = Math.max(box.left, Math.min(x, box.right));
    // A single-line field centers its text, so the field itself is the useful edge.
    if (single) return { x: clampedX, top: box.top, bottom: box.bottom };
    const top = box.top + scaleY * (el.clientTop + (to.top - from.top) - el.scrollTop);
    return { x: clampedX, top, bottom: top + scaleY * to.height };
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
    // A list that lost its field, or that the page removed, must not keep answering keys nobody can see it for.
    if (!dropdown.isConnected || !e.composedPath().includes(activeEl)) { hideDropdown(); return; }
    // Cmd+A, Ctrl+Enter and the like are the page's. AltGr reports as Ctrl on Windows and still types characters.
    if ((e.ctrlKey || e.metaKey) && !e.getModifierState('AltGraph')) { hideDropdown(); return; }

    const take = () => { e.preventDefault(); e.stopImmediatePropagation(); };
    const plain = !(e.shiftKey || e.altKey);

    if (CARET_KEYS.has(e.key)) hideDropdown();
    else if (e.key === 'Enter' || e.key === 'Tab') {
      // Shift+Enter is a newline, not a pick.
      if (plain) { take(); selectItem(selectedIndex); } else hideDropdown();
    }
    else if (e.key === 'ArrowDown') { take(); selectedIndex = (selectedIndex + 1) % matches.length; updateSelection(); }
    else if (e.key === 'ArrowUp') { take(); selectedIndex = (selectedIndex - 1 + matches.length) % matches.length; updateSelection(); }
    else if (e.key === 'Escape') { take(); dismissed = { el: activeEl, start: triggerStart }; hideDropdown(); }
  }, true);

  // --- Click outside ---

  window.addEventListener('mousedown', (e) => {
    if (open && !e.composedPath().includes(dropdown)) hideDropdown();
  }, true);
})();
