#!/usr/bin/env python3
"""Real-browser checks: loads the unpacked extension in headless Chromium and types with real key events.

    python3 test/e2e.py                 # every scenario, exit 1 on a failure
    python3 test/e2e.py --only undo     # scenarios whose name contains "undo"
    python3 test/e2e.py --perf          # handler timings instead of scenarios
    python3 test/e2e.py --ext DIR       # run against another unpacked copy

Needs Python Playwright. Fixture pages are served through page.route, so there is no server.
"""
import argparse, json, statistics, sys, tempfile, time
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
URL = "http://localhost/"  # secure context, so the clipboard works; page.route serves it
DD = "#shortmoji-dropdown"
TA = "<textarea id=t style='width:500px;height:120px'></textarea>"
CE = "<div id=t contenteditable style='width:500px;height:120px;border:1px solid'></div>"
MOD = "Meta" if sys.platform == "darwin" else "Control"
SCENARIOS = []
EXT = str(ROOT)


def scenario(fn):
    SCENARIOS.append(fn)
    return fn


class Fail(Exception):
    pass


def eq(actual, expected, what="value"):
    if actual != expected:
        raise Fail(f"{what}: expected {expected!r}, got {actual!r}")


def ok(cond, what):
    if not cond:
        raise Fail(what)


class T:
    """One fixture page plus the helpers the scenarios share."""

    def __init__(self, ctx, html, routes=None, wait=True):
        self.ctx, self.page = ctx, ctx.new_page()
        pages = {URL: html, **(routes or {})}
        self.page.route(URL + "**", lambda r: r.fulfill(body=pages[r.request.url], content_type="text/html; charset=utf-8"))
        self.page.goto(URL)
        if wait:
            self.page.wait_for_timeout(120)  # storage.sync.get resolves after injection

    def focus(self, sel="#t", frame=None):
        (frame or self.page).locator(sel).click()

    def type(self, text):
        self.page.keyboard.type(text)

    def press(self, key):
        self.page.keyboard.press(key)

    def value(self, sel="#t", frame=None):
        self.page.wait_for_timeout(30)  # instant replace in a rich editor waits for the editor's own turn
        return (frame or self.page).evaluate(
            "s => { const e = document.querySelector(s); return 'value' in e ? e.value : e.innerText.replace(/\\n$/, '') }", sel)

    def open(self, frame=None):
        return (frame or self.page).evaluate(
            "s => { const d = document.querySelector(s); return !!d && d.classList.contains('visible') }", DD)

    def codes(self):
        return self.page.locator(f"{DD} .shortcode").all_inner_texts()

    def box(self):
        return self.page.locator(DD).bounding_box()

    def paste(self, text):
        self.page.evaluate("t => navigator.clipboard.writeText(t)", text)
        self.press(f"{MOD}+v")

    def caret(self, sel="#t"):
        """Measured from the page side, so it cannot share a bug with the extension."""
        return self.page.evaluate(
            "s => { const r = getSelection().getRangeAt(0).getClientRects()[0]; return r && {x:r.x, top:r.top, bottom:r.bottom} }", sel)


# --- What the extension is for ---

@scenario
def textarea_instant_replace(c):
    t = T(c, TA); t.focus(); t.type("hi :fire:"); eq(t.value(), "hi 🔥"); ok(not t.open(), "dropdown still open")

@scenario
def input_instant_replace(c):
    t = T(c, "<input id=t style='width:400px'>"); t.focus(); t.type(":rocket:"); eq(t.value(), "🚀")

@scenario
def search_input_instant_replace(c):
    t = T(c, "<input id=t type=search>"); t.focus(); t.type(":tada:"); eq(t.value(), "🎉")

@scenario
def contenteditable_instant_replace(c):
    t = T(c, CE); t.focus(); t.type("hi :fire:"); eq(t.value(), "hi 🔥"); t.type(" there"); eq(t.value(), "hi 🔥 there")

@scenario
def enter_picks_from_dropdown(c):
    t = T(c, TA); t.focus(); t.type("x :rocke"); ok(t.open(), "dropdown closed"); t.press("Enter"); eq(t.value(), "x 🚀")

@scenario
def tab_picks_from_dropdown(c):
    t = T(c, CE); t.focus(); t.type(":rocke"); t.press("Tab"); eq(t.value(), "🚀")

@scenario
def arrows_then_enter_pick_second(c):
    t = T(c, TA); t.focus(); t.type(":smil"); second = t.codes()[1].strip(":")
    t.press("ArrowDown"); t.press("Enter")
    eq(t.value(), json.loads(emoji_json())[second])

@scenario
def click_picks_from_dropdown(c):
    t = T(c, TA); t.focus(); t.type(":rocke")
    t.page.locator(f"{DD} .shortmoji-item").first.click(); eq(t.value(), "🚀")
    eq(t.page.evaluate("document.activeElement.id"), "t", "focus after click")

@scenario
def pound_trigger(c):
    t = T(c, TA); t.focus(); t.type("#rocke"); ok(t.open(), "dropdown closed"); t.press("Enter"); eq(t.value(), "🚀")

@scenario
def password_is_never_touched(c):
    t = T(c, "<input id=t type=password>"); t.focus(); t.type(":fire:"); eq(t.value(), ":fire:"); t.type(" :roc"); ok(not t.open(), "dropdown on a password field")

@scenario
def undo_label_is_real_for_dropdown_pick(c):
    t = T(c, TA); t.focus(); t.type(":rocke"); t.press("Enter"); eq(t.value(), "🚀"); t.press(f"{MOD}+z"); eq(t.value(), ":rocke")

@scenario
def react_style_controlled_input_stays_in_sync(c):
    t = T(c, TA + "<script>window.seen=[];t.addEventListener('input',e=>seen.push(e.target.value))</script>")
    t.focus(); t.type(":fire:"); eq(t.page.evaluate("seen.at(-1)"), "🔥", "page saw final value")

@scenario
def toggle_off_and_auto_replace_off(c):
    t = T(c, TA)
    ext = extension_id(c)
    p = c.new_page(); p.goto(f"chrome-extension://{ext}/popup.html")
    p.locator(".switch").nth(1).click(); t.page.wait_for_timeout(100)
    t.focus(); t.type(":fire:"); eq(t.value(), ":fire:", "auto-replace off")
    t.page.evaluate("t.value=''"); t.type(":rocke"); ok(t.open(), "dropdown must still work"); t.press("Enter"); eq(t.value(), "🚀")
    p.locator(".switch").nth(1).click(); p.locator(".switch").nth(0).click(); t.page.wait_for_timeout(100)
    t.page.evaluate("t.value=''"); t.type(":fire:"); eq(t.value(), ":fire:", "disabled")
    t.page.evaluate("t.value=''"); t.type(":rocke"); ok(not t.open(), "dropdown while disabled")
    p.locator(".switch").nth(0).click(); p.close()

@scenario
def popup_switches_have_names_and_keyboard_focus(c):
    p = c.new_page(); p.goto(f"chrome-extension://{extension_id(c)}/popup.html")
    for name in ["Enabled", "Auto-replace"]:
        box = p.get_by_role("checkbox", name=name); ok(box.is_checked(), f"{name} unchecked")
    p.keyboard.press("Tab")
    ok(p.evaluate("getComputedStyle(document.querySelector('input:focus-visible + .slider')).outlineStyle") != "none", "no visible focus")
    p.close()

@scenario
def disabling_hides_an_open_dropdown(c):
    t = T(c, TA); ext = extension_id(c)
    p = c.new_page(); p.goto(f"chrome-extension://{ext}/popup.html"); t.page.bring_to_front()
    t.focus(); t.type(":rocke"); ok(t.open(), "dropdown closed")
    p.locator(".switch").nth(0).click(); t.page.wait_for_timeout(100)
    closed = not t.open()
    p.locator(".switch").nth(0).click(); p.close()
    ok(closed, "dropdown still open after disabling")


# --- Things that must not be replaced ---

@scenario
def undo_keeps_the_shortcode(c):
    t = T(c, TA); t.focus(); t.type(":fire:"); eq(t.value(), "🔥"); t.press(f"{MOD}+z"); eq(t.value(), ":fire:", "after undo")

@scenario
def undo_keeps_the_shortcode_contenteditable(c):
    t = T(c, CE); t.focus(); t.type(":fire:"); eq(t.value(), "🔥"); t.press(f"{MOD}+z"); eq(t.value(), ":fire:", "after undo")

@scenario
def paste_is_left_alone(c):
    t = T(c, TA); t.focus(); t.paste("see :fire:"); eq(t.value(), "see :fire:")

@scenario
def backspace_does_not_replace(c):
    t = T(c, TA); t.focus(); t.paste(":fire:x"); t.press("Backspace"); eq(t.value(), ":fire:")

@scenario
def object_builtins_are_not_shortcodes(c):
    t = T(c, TA); t.focus(); t.type(":constructor:"); eq(t.value(), ":constructor:")
    t.page.evaluate("t.value=''"); t.type(":__proto__:"); eq(t.value(), ":__proto__:")

@scenario
def code_with_colons_is_left_alone(c):
    for typed in ["x[a:b:", "foo:fire:", "http://x.io:100:", "std::x:"]:
        t = T(c, TA); t.focus(); t.type(typed); eq(t.value(), typed); t.page.close()

@scenario
def emoticons_do_not_open_the_dropdown(c):
    for typed in [":-p", ":-o"]:
        t = T(c, TA); t.focus(); t.type(typed); ok(not t.open(), f"dropdown opened for {typed}"); t.press("Enter"); eq(t.value(), typed + "\n"); t.page.close()

@scenario
def issue_numbers_do_not_open_the_dropdown(c):
    t = T(c, TA); t.focus(); t.type("fixes #1234"); ok(not t.open(), "dropdown opened for #1234"); t.press("Enter"); eq(t.value(), "fixes #1234\n")

@scenario
def consecutive_and_bracketed_shortcodes_still_work(c):
    t = T(c, TA); t.focus(); t.type(":fire::rocket:"); eq(t.value(), "🔥🚀")
    t.page.evaluate("t.value=''"); t.type("(:fire:"); eq(t.value(), "(🔥")
    t.page.evaluate("t.value=''"); t.type("(:rocke"); ok(t.open(), "dropdown after a bracket"); t.press("Enter"); eq(t.value(), "(🚀")


# --- Keyboard ownership ---

@scenario
def shift_enter_is_a_newline_not_a_pick(c):
    t = T(c, TA); t.focus(); t.type(":roc"); t.press("Shift+Enter"); eq(t.value(), ":roc\n"); ok(not t.open(), "dropdown still open")

@scenario
def cmd_enter_reaches_the_page(c):
    t = T(c, TA + "<script>window.sent=0;t.addEventListener('keydown',e=>{if(e.metaKey&&e.key==='Enter')sent++})</script>")
    t.focus(); t.type(":roc"); t.press("Meta+Enter"); eq(t.page.evaluate("sent"), 1, "page saw Cmd+Enter"); eq(t.value(), ":roc")

@scenario
def moving_the_caret_closes_the_dropdown(c):
    for key in ["ArrowLeft", "ArrowRight", "Home", "End"]:
        t = T(c, TA); t.focus(); t.type("abc :roc"); t.press(key); ok(not t.open(), f"open after {key}")
        t.press("Enter"); eq(t.value().replace("\n", ""), "abc :roc", f"text after {key} then Enter"); t.page.close()

@scenario
def page_never_sees_the_enter_that_picked(c):
    spy = """<script>window.keys=[];for (const o of [window,document,t])
      o.addEventListener('keydown',e=>keys.push(e.key))</script>"""
    t = T(c, TA + spy); t.focus(); t.type(":rocke"); t.page.evaluate("keys.length=0")
    t.press("Enter"); eq(t.value(), "🚀"); eq(t.page.evaluate("keys"), [], "keydowns seen by the page")

@scenario
def arrows_do_not_leak_to_page_handlers(c):
    spy = "<script>window.keys=[];t.addEventListener('keydown',e=>keys.push(e.key))</script>"
    t = T(c, TA + spy); t.focus(); t.type(":smi"); t.page.evaluate("keys.length=0")
    t.press("ArrowDown"); t.press("ArrowUp"); eq(t.page.evaluate("keys"), [], "arrow keys seen by the page")

@scenario
def escape_stays_dismissed_while_typing_on(c):
    t = T(c, TA); t.focus(); t.type(":smi"); t.press("Escape"); ok(not t.open(), "open after Escape"); t.type("l"); ok(not t.open(), "reopened after Escape")
    t.type(" :roc"); ok(t.open(), "a new shortcode must open again")

@scenario
def escape_also_keeps_the_shortcode_literal(c):
    t = T(c, TA); t.focus(); t.type(":smi"); t.press("Escape"); t.type("le:"); eq(t.value(), ":smile:")

@scenario
def composition_is_not_interrupted(c):
    t = T(c, TA); t.focus(); s = c.new_cdp_session(t.page)
    s.send("Input.imeSetComposition", {"text": ":fire:", "selectionStart": 6, "selectionEnd": 6})
    eq(t.value(), ":fire:", "mid composition"); ok(not t.open(), "dropdown during composition")

@scenario
def enter_during_composition_is_not_a_pick(c):
    t = T(c, TA); t.focus(); s = c.new_cdp_session(t.page)
    t.type(":roc"); ok(t.open(), "dropdown closed")
    t.page.evaluate("window.shortmojiProbe = 0")
    s.send("Input.imeSetComposition", {"text": "け", "selectionStart": 1, "selectionEnd": 1})
    ok(not t.open(), "dropdown open while composing")

@scenario
def focus_moving_away_closes_the_dropdown(c):
    t = T(c, TA + "<input id=other>"); t.focus(); t.type(":roc"); t.page.evaluate("other.focus()")
    t.page.wait_for_timeout(30); ok(not t.open(), "open after focus moved"); t.type("x"); t.press("Enter"); eq(t.value(), ":roc")


# --- Where the dropdown lands ---

@scenario
def plain_textarea_dropdown_sits_under_the_caret(c):
    t = T(c, "<body style='margin:20px'><textarea id=t rows=5 cols=40></textarea><div style='height:2000px'></div>")
    t.focus(); t.type("hi\n:roc"); ok(t.open(), "dropdown closed"); b = t.box(); r = t.page.locator("#t").bounding_box()
    ok(b["y"] >= r["y"] and b["y"] < r["y"] + r["height"], f"dropdown y={b['y']} outside textarea {r['y']}..{r['y']+r['height']}")
    ok(abs(b["x"] - r["x"]) < 40, f"dropdown x={b['x']} not at caret, textarea x={r['x']}")

@scenario
def long_single_line_input_dropdown_is_inside_the_field(c):
    t = T(c, "<body style='margin:20px'><input id=t style='width:300px'>")
    t.focus(); t.type("word " * 40 + ":roc"); ok(t.open(), "dropdown closed"); b = t.box(); r = t.page.locator("#t").bounding_box()
    ok(abs(b["y"] - (r["y"] + r["height"])) < 12, f"dropdown y={b['y']} not under the input bottom {r['y']+r['height']}")
    ok(r["x"] <= b["x"] <= r["x"] + r["width"], f"dropdown x={b['x']} outside input {r['x']}..{r['x']+r['width']}")

@scenario
def dropdown_near_the_bottom_flips_without_covering_the_line(c):
    t = T(c, "<body style='margin:0'><div style='height:calc(100vh - 40px)'></div><div id=t contenteditable style='height:30px;line-height:30px;font-size:16px'></div>")
    t.focus(); t.type(":roc"); ok(t.open(), "dropdown closed"); b = t.box(); line = t.page.locator("#t").bounding_box()
    ok(b["y"] + b["height"] <= line["y"] + 8, f"dropdown bottom {b['y']+b['height']} covers the line at {line['y']}")

@scenario
def short_window_never_covers_the_line_being_typed(c):
    t = T(c, "<body style='margin:0'><div style='height:100px'></div><div id=t contenteditable style='height:24px;font-size:16px'></div>")
    t.page.set_viewport_size({"width": 700, "height": 260})
    t.focus(); t.type(":smi"); ok(t.open(), "dropdown closed"); b = t.box(); line = t.page.locator("#t").bounding_box()
    t.page.set_viewport_size({"width": 1280, "height": 720})
    ok(b["y"] >= line["y"] + line["height"] - 4 or b["y"] + b["height"] <= line["y"] + 4, f"dropdown {b} covers the line {line}")
    ok(b["y"] + b["height"] <= 260, f"dropdown bottom {b['y'] + b['height']} past the window")

@scenario
def resting_pointer_does_not_look_like_a_choice(c):
    t = T(c, "<body style='margin:20px'><div id=t contenteditable style='height:30px'></div>")
    t.focus(); t.page.mouse.move(120, 170); t.type(":smi"); ok(t.open(), "dropdown closed")
    bg = "[...document.querySelectorAll('.shortmoji-item')].map(r => getComputedStyle(r).backgroundColor)"
    t.page.wait_for_timeout(150); colors = t.page.evaluate(bg)
    eq(len({*colors[1:]}), 1, "unselected rows should look the same"); ok(colors[0] != colors[1], "first row should stand out")
    first = t.codes()[0]; t.press("Enter"); ok(":smi" not in t.value(), "not picked")

@scenario
def moving_the_pointer_selects_the_row_under_it(c):
    t = T(c, TA); t.focus(); t.type(":smi")
    third = t.page.locator(f"{DD} .shortmoji-item").nth(2); box = third.bounding_box()
    t.page.mouse.move(box["x"] + 20, box["y"] + 5); t.page.mouse.move(box["x"] + 30, box["y"] + 6)
    eq(t.page.locator(f"{DD} [aria-selected=true] .shortcode").inner_text(), third.locator(".shortcode").inner_text(), "selected row")

@scenario
def dropdown_follows_the_page_when_it_scrolls(c):
    t = T(c, "<body style='margin:20px'><div id=t contenteditable style='height:40px;border:1px solid'></div><div style='height:3000px'></div>")
    t.focus(); t.type(":roc"); y0 = t.box()["y"]; t.page.evaluate("scrollTo(0,10)"); t.page.wait_for_timeout(60)
    ok(not t.open() or abs(t.box()["y"] - (y0 - 10)) < 2, f"dropdown stuck at {t.box()['y']} after scrolling 10px from {y0}")

@scenario
def exact_match_is_first(c):
    for q in ["ok", "car", "cat", "man"]:
        t = T(c, TA); t.focus(); t.type(":" + q); eq(t.codes()[0], f":{q}:", f"first result for :{q}"); t.page.close()

@scenario
def dropdown_has_listbox_semantics(c):
    t = T(c, TA); t.focus(); t.type(":smi")
    eq(t.page.evaluate("document.querySelector('#shortmoji-dropdown').getAttribute('role')"), "listbox")
    eq(t.page.locator(f"{DD} [role=option][aria-selected=true]").count(), 1, "selected options")


# --- Where it has to reach ---

@scenario
def textarea_in_open_shadow_root(c):
    t = T(c, "<div id=h></div><script>h.attachShadow({mode:'open'}).innerHTML=`" + TA + "`</script>")
    t.page.locator("#t").click(); t.type(":fire:")
    eq(t.page.evaluate("h.shadowRoot.querySelector('#t').value"), "🔥")

@scenario
def contenteditable_in_open_shadow_root(c):
    t = T(c, "<div id=h></div><script>h.attachShadow({mode:'open'}).innerHTML=`" + CE + "`</script>")
    t.page.locator("#t").click(); t.type("yo :fire:")
    t.page.wait_for_timeout(30); eq(t.page.evaluate("h.shadowRoot.querySelector('#t').innerText"), "yo 🔥")

@scenario
def dropdown_pick_in_open_shadow_root(c):
    t = T(c, "<div id=h></div><script>h.attachShadow({mode:'open'}).innerHTML=`" + CE + "`</script>")
    t.page.locator("#t").click(); t.type(":rocke"); ok(t.open(), "dropdown closed"); t.press("Enter")
    eq(t.page.evaluate("h.shadowRoot.querySelector('#t').innerText"), "🚀")

@scenario
def about_blank_iframe_editor(c):
    t = T(c, "<iframe id=f></iframe><script>addEventListener('load',()=>{f.contentDocument.body.innerHTML=`<div id=t contenteditable style='height:80px'></div>`})</script>")
    fr = t.page.frames[1]; t.page.wait_for_timeout(150); fr.locator("#t").click(); t.type(":fire:"); eq(t.value(frame=fr), "🔥")

@scenario
def design_mode_iframe_editor(c):
    t = T(c, "<iframe id=f width=400 height=200></iframe><script>addEventListener('load',()=>{f.contentDocument.designMode='on'})</script>")
    t.page.wait_for_timeout(150); fr = t.page.frames[1]; fr.locator("body").click(); t.type("yo :fire:")
    t.page.wait_for_timeout(30); eq(fr.evaluate("document.body.innerText").strip(), "yo 🔥")

@scenario
def srcdoc_iframe_textarea(c):
    t = T(c, "<iframe id=f srcdoc=\"" + TA.replace("'", "&#39;") + "\"></iframe>")
    t.page.wait_for_timeout(150); fr = t.page.frames[1]; fr.locator("#t").click(); t.type(":fire:"); eq(t.value(frame=fr), "🔥")

@scenario
def same_origin_iframe(c):
    t = T(c, f"<iframe src='{URL}frame'></iframe>", {f"{URL}frame": TA}); t.page.wait_for_timeout(150)
    fr = t.page.frames[1]; fr.locator("#t").click(); t.type(":fire:"); eq(t.value(frame=fr), "🔥")

@scenario
def nested_rich_text_in_one_node(c):
    t = T(c, "<div id=t contenteditable><p><strong><span id=s>x</span></strong></p></div>"); t.focus(); t.press("End"); t.type(" :fire:")
    ok("🔥" in t.value() and ":fire:" not in t.value(), f"got {t.value()!r}")

@scenario
def caret_parked_on_an_element_not_a_text_node(c):
    t = T(c, "<div id=t contenteditable><p><strong><span id=s>:fir</span></strong></p></div>")
    t.page.evaluate("""() => { t.focus(); const r=document.createRange(); const p=t.firstChild; r.setStart(p,1); r.collapse(true);
        const s=getSelection(); s.removeAllRanges(); s.addRange(r) }""")
    t.type("e"); ok(t.open() or "🔥" in t.value(), f"no dropdown, value {t.value()!r}")

INTERCEPT = """<div id=t contenteditable><p><strong><span id=s></span></strong></p></div><script>
  t.addEventListener('beforeinput', (e) => {
    e.preventDefault();
    const sel = getSelection(), r = sel.getRangeAt(0);
    r.deleteContents();
    if (e.inputType === 'insertText') r.insertNode(document.createTextNode(e.data));
    t.normalize();
    const node = s.firstChild || s;
    sel.collapse(s, s.childNodes.length);  // caret parked on an element, as Slate-style editors can leave it
  });
</script>"""

@scenario
def editor_that_cancels_beforeinput_and_writes_the_dom_itself(c):
    t = T(c, INTERCEPT); t.page.locator("#s").evaluate("""s => { s.textContent = 'hi '; t.focus(); getSelection().collapse(s, 1) }""")
    t.type(":fire:"); ok("🔥" in t.value() and ":fire:" not in t.value(), f"got {t.value()!r}")

@scenario
def intercepting_editor_shortcuts_do_not_rerun_triggers(c):
    t = T(c, INTERCEPT); t.page.locator("#s").evaluate("""s => { s.textContent = ':roc'; t.focus(); getSelection().collapse(s, 1) }""")
    t.press(f"{MOD}+a"); ok(not t.open(), "dropdown opened by Cmd+A")

@scenario
def email_field_does_not_throw(c):
    t = T(c, "<input id=t type=email>"); errors = []; t.page.on("pageerror", lambda e: errors.append(str(e)))
    t.focus(); t.type("a@b.c :fire:"); eq(errors, [], "page errors")


# --- Plumbing ---

def emoji_json():
    src = (ROOT / "emoji-data.js").read_text()
    body = src[src.index("{"): src.rindex("}") + 1]
    import re
    return json.dumps({m[0]: m[1] for m in re.findall(r"'([^']+)': '([^']+)'", body)})


def extension_id(ctx):
    """Chrome derives an unpacked extension's id from its path, and there is no worker to read it from."""
    import hashlib
    digest = hashlib.sha256(str(Path(EXT).resolve()).encode()).hexdigest()[:32]
    return "".join(chr(ord("a") + int(c, 16)) for c in digest)


def launch(pw, ext, profile, video=None):
    args = ["--disable-gpu"]
    if ext:
        args += [f"--disable-extensions-except={ext}", f"--load-extension={ext}"]
    kw = {"record_video_dir": video, "record_video_size": {"width": 900, "height": 500}, "viewport": {"width": 900, "height": 500}} if video else {}
    ctx = pw.chromium.launch_persistent_context(str(profile), channel="chromium", headless=True, args=args, **kw)
    ctx.grant_permissions(["clipboard-read", "clipboard-write"], origin=URL)
    return ctx


def run_scenarios(pw, ext, only):
    fails = []
    with tempfile.TemporaryDirectory(prefix="shortmoji-") as profile:
        ctx = launch(pw, ext, profile)
        for fn in SCENARIOS:
            if only and only not in fn.__name__:
                continue
            try:
                fn(ctx)
                print(f"PASS {fn.__name__}")
            except Exception as e:
                msg = str(e).split("\n")[0][:170]
                fails.append(fn.__name__)
                print(f"FAIL {fn.__name__}: {msg}")
            for p in list(ctx.pages):
                if not p.is_closed() and p.url != "about:blank":
                    p.close()
        ctx.close()
    print(f"\n{len(fails)} failed" if fails else "\nall passed")
    return 1 if fails else 0


# --- Performance: the time synchronous handlers add, measured between window capture and window bubble ---

SPY = """<script>
window.cost = {input: [], keyup: [], keydown: []};
for (const k of Object.keys(cost)) {
  let t0;
  addEventListener(k, () => { t0 = performance.now() }, true);
  addEventListener(k, () => { cost[k].push(performance.now() - t0) });
}
</script>"""


def bigtext(mb):
    line = "the quick brown fox: jumps over #the lazy dog and keeps going until the line wraps around at least once ok\n"
    return line * int(mb * 1_000_000 / len(line))


def measure(ctx, html, keys, setup=None):
    p = ctx.new_page()
    p.route(URL, lambda r: r.fulfill(body=html + SPY, content_type="text/html; charset=utf-8"))
    p.goto(URL); p.wait_for_timeout(150)
    p.locator("#t").click()
    if setup:
        p.evaluate(setup); p.wait_for_timeout(200)
    p.evaluate("Object.values(cost).forEach(a => a.length = 0)")
    for k in keys:
        p.keyboard.press(k)
    c = p.evaluate("cost")
    p.close()
    return {k: {"median": round(statistics.median(v), 2), "mean": round(statistics.mean(v), 2), "max": round(max(v), 2)} for k, v in c.items() if v}


def load_cost(ctx, frames):
    html = "<p>x</p>" + f"<iframe src='{URL}f' width=10 height=10></iframe>" * frames
    samples = []
    for _ in range(9):
        p = ctx.new_page()
        p.route(URL, lambda r: r.fulfill(body=html, content_type="text/html"))
        p.route(URL + "f", lambda r: r.fulfill(body="<p>f</p>", content_type="text/html"))
        s = ctx.new_cdp_session(p); s.send("Performance.enable")
        p.goto(URL); p.wait_for_timeout(400)
        m = {x["name"]: x["value"] for x in s.send("Performance.getMetrics")["metrics"]}
        samples.append((m["ScriptDuration"] * 1000, m["TaskDuration"] * 1000, m["JSHeapUsedSize"] / 1e6))
        p.close()
    return {name: round(statistics.median(x[i] for x in samples), 2) for i, name in enumerate(["script_ms", "task_ms", "heap_mb"])}


def run_perf(pw, ext, out):
    plain = list("abcdefghijklmnopqrstuvwxyz abcdefghijklmnopqrstuvwxyz")
    trig = [":", "s", "m", "i", "l", "Backspace", "Backspace", "Backspace", "Backspace"] * 5
    heavy = TA + "<div>" + "<div><span>node</span></div>" * 20000 + "</div>"
    big = f"t.value = {json.dumps(bigtext(1))}; t.selectionStart = t.selectionEnd = t.value.length"
    bigce = f"t.textContent = {json.dumps(bigtext(0.2).replace(chr(10), ' '))}; getSelection().selectAllChildren(t); getSelection().collapseToEnd()"
    results = {}
    cases = {
        "small textarea, plain typing": (TA, plain, None),
        "small textarea, typing a shortcode": (TA, trig, None),
        "1 MB textarea, plain typing": (TA, plain, big),
        "1 MB textarea, typing a shortcode": (TA, trig, big),
        "200 KB contenteditable, plain typing": (CE, plain, bigce),
        "200 KB contenteditable, typing a shortcode": (CE, trig, bigce),
        "20k-node page, small textarea, typing a shortcode": (heavy, trig, None),
        "no editable focused, keys only": ("<p id=t tabindex=0>page</p>", plain, None),
    }
    for label, e in (("none", None), ("extension", ext)):
        with tempfile.TemporaryDirectory(prefix="shortmoji-") as profile:
            ctx = launch(pw, e, profile)
            for name, (html, keys, setup) in cases.items():
                results.setdefault(name, {})[label] = measure(ctx, html, keys, setup)
            for n in (0, 20, 100):
                results.setdefault(f"page load with {n} iframes", {})[label] = load_cost(ctx, n)
            ctx.close()
    print(json.dumps(results, indent=1))
    if out:
        Path(out).write_text(json.dumps(results, indent=1))
    return 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ext", default=str(ROOT))
    ap.add_argument("--only")
    ap.add_argument("--perf", action="store_true")
    ap.add_argument("--out")
    a = ap.parse_args()
    global EXT
    EXT = a.ext
    with sync_playwright() as pw:
        return run_perf(pw, a.ext, a.out) if a.perf else run_scenarios(pw, a.ext, a.only)


if __name__ == "__main__":
    sys.exit(main())
