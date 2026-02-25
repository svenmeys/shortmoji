#!/usr/bin/env python3
"""Generate Chrome Web Store promotional images for Shortmoji."""

from PIL import Image, ImageDraw, ImageFont
import math

# === Font paths ===
FONT_BOLD = "/System/Library/Fonts/HelveticaNeue.ttc"  # index 1 = Bold
FONT_REGULAR = "/System/Library/Fonts/HelveticaNeue.ttc"  # index 0 = Regular
FONT_EMOJI = "/System/Library/Fonts/Apple Color Emoji.ttc"
ARIAL_BOLD = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
ARIAL_REGULAR = "/System/Library/Fonts/Supplemental/Arial.ttf"

OUTPUT_DIR = "/Users/svenmeys/Projects/shortmoji/store"


def make_gradient(width, height, color1, color2, angle_deg=135):
    """Create a linear gradient image between two RGB colors at a given angle."""
    img = Image.new("RGBA", (width, height))
    pixels = img.load()
    angle = math.radians(angle_deg)
    cos_a = math.cos(angle)
    sin_a = math.sin(angle)

    # Project corners to find range
    corners = [(0, 0), (width, 0), (0, height), (width, height)]
    projections = [x * cos_a + y * sin_a for x, y in corners]
    min_proj = min(projections)
    max_proj = max(projections)

    for y in range(height):
        for x in range(width):
            proj = x * cos_a + y * sin_a
            t = (proj - min_proj) / (max_proj - min_proj) if max_proj != min_proj else 0
            t = max(0.0, min(1.0, t))
            r = int(color1[0] + (color2[0] - color1[0]) * t)
            g = int(color1[1] + (color2[1] - color1[1]) * t)
            b = int(color1[2] + (color2[2] - color1[2]) * t)
            pixels[x, y] = (r, g, b, 255)
    return img


def center_text(draw, text, font, y, width, fill="white"):
    """Draw text centered horizontally at the given y position."""
    bbox = draw.textbbox((0, 0), text, font=font)
    tw = bbox[2] - bbox[0]
    x = (width - tw) // 2
    draw.text((x, y), text, font=font, fill=fill)
    return bbox[3] - bbox[1]  # Return text height


EMOJI_VALID_SIZES = [20, 32, 40, 48, 64, 96, 160]


def _best_emoji_size(target):
    """Find the best valid Apple Color Emoji size for the target pixel size."""
    # Pick the smallest valid size >= target, or the largest available
    for s in EMOJI_VALID_SIZES:
        if s >= target:
            return s
    return EMOJI_VALID_SIZES[-1]


def draw_emoji(base_img, emoji_char, x, y, size):
    """Draw a color emoji onto the base image at (x, y) with given size.

    Renders at a valid bitmap size then scales to the desired size.
    """
    render_size = _best_emoji_size(size)
    emoji_font = ImageFont.truetype(FONT_EMOJI, render_size)

    # Render emoji on a small transparent canvas
    canvas = Image.new("RGBA", (render_size + 10, render_size + 10), (0, 0, 0, 0))
    cdraw = ImageDraw.Draw(canvas)
    cdraw.text((0, 0), emoji_char, font=emoji_font, embedded_color=True)

    # Crop to content
    bbox = canvas.getbbox()
    if bbox:
        canvas = canvas.crop(bbox)

    # Scale to desired size
    if canvas.width != size or canvas.height != size:
        canvas = canvas.resize((size, size), Image.LANCZOS)

    # Paste onto base image
    base_img.paste(canvas, (x, y), canvas)
    return base_img


def generate_promo_tile():
    """Generate the 440x280 small promotional tile."""
    W, H = 440, 280
    # Gradient: indigo to violet
    color1 = (99, 102, 241)   # #6366F1
    color2 = (139, 92, 246)   # #8B5CF6

    img = make_gradient(W, H, color1, color2, angle_deg=135)
    draw = ImageDraw.Draw(img)

    # Title font
    title_font = ImageFont.truetype(FONT_BOLD, 52, index=1)
    tagline_font = ImageFont.truetype(FONT_REGULAR, 16, index=0)

    # Draw title "Shortmoji" centered
    title_y = 80
    th = center_text(draw, "Shortmoji", title_font, title_y, W)

    # Tagline below
    tagline_y = title_y + th + 20
    center_text(draw, "The colon is mightier than the mouse.", tagline_font, tagline_y, W,
                fill=(255, 255, 255, 200))

    # Scatter decorative emoji
    emojis = [
        ("🚀", 30, 15, 36),
        ("✨", 370, 8, 32),
        ("🔥", 50, 210, 34),
        ("😎", 350, 220, 36),
        ("💡", 10, 130, 30),
        ("🎉", 395, 120, 32),
    ]

    for char, ex, ey, sz in emojis:
        img = draw_emoji(img, char, ex, ey, sz)

    # Add a subtle colon motif — a stylized `:` near the tagline
    draw = ImageDraw.Draw(img)
    colon_font = ImageFont.truetype(FONT_BOLD, 80, index=1)
    # Left colon
    draw.text((8, 50), ":", font=colon_font, fill=(255, 255, 255, 40))
    # Right colon
    draw.text((405, 145), ":", font=colon_font, fill=(255, 255, 255, 40))

    img = img.convert("RGB")
    out_path = f"{OUTPUT_DIR}/promo-small-440x280.png"
    img.save(out_path, "PNG")
    print(f"Saved: {out_path}")
    return img


def draw_rounded_rect(draw, xy, radius, fill=None, outline=None, width=1):
    """Draw a rounded rectangle."""
    x1, y1, x2, y2 = xy
    draw.rounded_rectangle(xy, radius=radius, fill=fill, outline=outline, width=width)


def generate_screenshot():
    """Generate the 1280x800 screenshot showing the extension in action."""
    W, H = 1280, 800

    # === Colors (Catppuccin Mocha inspired) ===
    bg_page = (243, 244, 246)        # Light gray page background
    browser_bar = (50, 50, 60)       # Dark browser bar
    browser_bar_input = (35, 35, 45) # URL bar inside browser bar
    input_bg = (255, 255, 255)       # Text input field
    input_border = (200, 200, 210)   # Input border
    dropdown_bg = (30, 30, 46)       # #1e1e2e Catppuccin Mocha base
    dropdown_item_hover = (49, 50, 68)  # #313244 Surface0
    dropdown_text = (205, 214, 244)  # #cdd6f4 Text
    dropdown_subtext = (147, 153, 178)  # #939ab7 Subtext0
    accent = (137, 180, 250)         # #89b4fa Blue accent
    text_dark = (30, 30, 40)
    text_muted = (120, 125, 140)
    cursor_color = (99, 102, 241)    # Indigo cursor

    img = Image.new("RGB", (W, H), bg_page)
    draw = ImageDraw.Draw(img)

    # === Browser bar at top ===
    bar_h = 56
    draw.rectangle([0, 0, W, bar_h], fill=browser_bar)

    # Traffic lights
    lights = [(230, 90, 90), (235, 180, 60), (100, 200, 100)]
    for i, color in enumerate(lights):
        cx = 28 + i * 26
        cy = bar_h // 2
        draw.ellipse([cx-7, cy-7, cx+7, cy+7], fill=color)

    # URL bar
    url_bar_x1, url_bar_y1 = 200, 12
    url_bar_x2, url_bar_y2 = W - 200, bar_h - 12
    draw_rounded_rect(draw, [url_bar_x1, url_bar_y1, url_bar_x2, url_bar_y2],
                      radius=8, fill=browser_bar_input)
    url_font = ImageFont.truetype(FONT_REGULAR, 15, index=0)
    draw.text((url_bar_x1 + 16, url_bar_y1 + 8), "example.com/compose", font=url_font,
              fill=(160, 165, 180))

    # === Page content area ===
    content_y = bar_h + 40
    margin = 140

    # Page title
    page_title_font = ImageFont.truetype(FONT_BOLD, 28, index=1)
    draw.text((margin, content_y), "New Message", font=page_title_font, fill=text_dark)

    # "To" field
    field_y = content_y + 55
    label_font = ImageFont.truetype(FONT_REGULAR, 16, index=0)
    draw.text((margin, field_y + 8), "To:", font=label_font, fill=text_muted)
    draw_rounded_rect(draw, [margin + 50, field_y, W - margin, field_y + 38],
                      radius=6, fill=input_bg, outline=input_border, width=1)
    value_font = ImageFont.truetype(FONT_REGULAR, 15, index=0)
    draw.text((margin + 62, field_y + 10), "team@company.com", font=value_font, fill=text_dark)

    # "Subject" field
    subj_y = field_y + 52
    draw.text((margin, subj_y + 8), "Subject:", font=label_font, fill=text_muted)
    draw_rounded_rect(draw, [margin + 80, subj_y, W - margin, subj_y + 38],
                      radius=6, fill=input_bg, outline=input_border, width=1)
    draw.text((margin + 92, subj_y + 10), "Quick update", font=value_font, fill=text_dark)

    # === Main text area (the big compose box) ===
    textarea_y = subj_y + 60
    textarea_h = 360
    draw_rounded_rect(draw, [margin, textarea_y, W - margin, textarea_y + textarea_h],
                      radius=8, fill=input_bg, outline=input_border, width=1)

    # Text inside textarea
    text_font = ImageFont.truetype(FONT_REGULAR, 17, index=0)
    lines = [
        "Hey team,",
        "",
        "Just pushed the fix for the login bug. Everything looks",
        "good on staging. Let me know if you see any issues :rock",
    ]

    line_y = textarea_y + 18
    for line in lines:
        if line == "":
            line_y += 12
            continue

        # For the last line, we need special handling for ":rock" highlight
        if ":rock" in line:
            prefix = line.split(":rock")[0]
            draw.text((margin + 18, line_y), prefix, font=text_font, fill=text_dark)
            # Calculate prefix width
            prefix_bbox = draw.textbbox((0, 0), prefix, font=text_font)
            prefix_w = prefix_bbox[2] - prefix_bbox[0]

            # Draw ":rock" with accent color
            rock_x = margin + 18 + prefix_w
            rock_text = ":rock"
            draw.text((rock_x, line_y), rock_text, font=text_font, fill=cursor_color)

            # Blinking cursor after ":rock"
            rock_bbox = draw.textbbox((0, 0), rock_text, font=text_font)
            rock_w = rock_bbox[2] - rock_bbox[0]
            cursor_x = rock_x + rock_w + 1
            draw.rectangle([cursor_x, line_y + 2, cursor_x + 2, line_y + 20],
                          fill=cursor_color)
        else:
            draw.text((margin + 18, line_y), line, font=text_font, fill=text_dark)
        line_y += 28

    # === Autocomplete dropdown (Catppuccin Mocha themed) ===
    # Position it below ":rock" in the text
    dropdown_x = margin + 18 + prefix_w - 10
    dropdown_y = line_y + 8
    dropdown_w = 280
    item_h = 44
    items = [
        ("🚀", "rocket", True),     # highlighted/selected
        ("🪨", "rock", False),
        ("🤘", "metal", False),
        ("🎸", "rock_guitar", False),
    ]
    dropdown_total_h = len(items) * item_h + 16  # padding top/bottom

    # Dropdown shadow
    shadow_offset = 4
    draw.rounded_rectangle(
        [dropdown_x + shadow_offset, dropdown_y + shadow_offset,
         dropdown_x + dropdown_w + shadow_offset, dropdown_y + dropdown_total_h + shadow_offset],
        radius=10, fill=(0, 0, 0, 60)
    )

    # Dropdown background
    draw.rounded_rectangle(
        [dropdown_x, dropdown_y, dropdown_x + dropdown_w, dropdown_y + dropdown_total_h],
        radius=10, fill=dropdown_bg
    )

    # Dropdown header
    header_font = ImageFont.truetype(FONT_REGULAR, 11, index=0)
    draw.text((dropdown_x + 14, dropdown_y + 6), "SHORTMOJI", font=header_font,
              fill=dropdown_subtext)

    # Draw items
    item_font = ImageFont.truetype(FONT_REGULAR, 16, index=0)
    code_font = ImageFont.truetype(FONT_REGULAR, 14, index=0)

    for i, (emoji, code, selected) in enumerate(items):
        iy = dropdown_y + 22 + i * item_h

        if selected:
            # Highlight background for selected item
            draw.rounded_rectangle(
                [dropdown_x + 6, iy, dropdown_x + dropdown_w - 6, iy + item_h - 4],
                radius=6, fill=dropdown_item_hover
            )
            # Left accent bar
            draw.rounded_rectangle(
                [dropdown_x + 8, iy + 6, dropdown_x + 11, iy + item_h - 10],
                radius=2, fill=accent
            )

        # Emoji (rendered via color emoji font for proper display)
        # We'll composite these after
        # For now, draw the text parts
        code_x = dropdown_x + 52
        draw.text((code_x, iy + 10), f":{code}:", font=item_font,
                  fill=dropdown_text if selected else dropdown_subtext)

    # Convert to RGBA for emoji compositing
    img = img.convert("RGBA")

    # Draw emoji in dropdown items using color emoji font
    for i, (emoji_char, code, selected) in enumerate(items):
        iy = dropdown_y + 22 + i * item_h
        emoji_x = dropdown_x + 18
        emoji_y = iy + 8
        img = draw_emoji(img, emoji_char, emoji_x, emoji_y, 28)

    # === "Shortmoji" badge in bottom-right corner ===
    draw = ImageDraw.Draw(img)
    badge_text = "Shortmoji"
    badge_font = ImageFont.truetype(FONT_BOLD, 14, index=1)
    badge_bbox = draw.textbbox((0, 0), badge_text, font=badge_font)
    badge_tw = badge_bbox[2] - badge_bbox[0]
    badge_th = badge_bbox[3] - badge_bbox[1]
    badge_pad_x, badge_pad_y = 14, 8
    badge_x = W - margin - badge_tw - badge_pad_x * 2
    badge_y = H - 50

    # Badge background (gradient-like solid purple)
    draw.rounded_rectangle(
        [badge_x, badge_y, badge_x + badge_tw + badge_pad_x * 2, badge_y + badge_th + badge_pad_y * 2],
        radius=6, fill=(99, 102, 241)
    )
    draw.text((badge_x + badge_pad_x, badge_y + badge_pad_y - 2), badge_text, font=badge_font,
              fill="white")

    img = img.convert("RGB")
    out_path = f"{OUTPUT_DIR}/screenshot-1280x800.png"
    img.save(out_path, "PNG", quality=95)
    print(f"Saved: {out_path}")
    return img


if __name__ == "__main__":
    print("Generating Shortmoji Chrome Web Store images...")
    generate_promo_tile()
    generate_screenshot()
    print("Done!")
