#!/usr/bin/env python3
"""
KashRoot — NewGen IEDC, University of Kashmir (RUSA 2.0 Seed Grant) pitch deck.

Run from the project root:  KR_DECK_PHONE="+91-XXXXXXXXXX" python3 scripts/generate_ku_pitch_deck.py
Writes KashRoot_NewGen_IEDC_University_of_Kashmir_Pitch_Deck.pptx (11 slides, 16:9, speaker notes on each).
Needs: pip install python-pptx
"""
from pathlib import Path

from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import MSO_ANCHOR, PP_ALIGN
from pptx.util import Emu, Inches, Pt

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "KashRoot_NewGen_IEDC_University_of_Kashmir_Pitch_Deck.pptx"
IMG_3D = ROOT / "scripts" / "assets" / "ku-deck-3d.png"

def rgb(h): return RGBColor.from_string(h.lstrip("#").upper())

GREEN, PINE, GOLD, MINT, WHITE, INK = "174C3C", "12382E", "C6A45B", "EAF3EE", "FFFFFF", "1E2D28"
EMERALD, SAPPHIRE, AMBER, VIOLET, RUBY = "10B981", "2563EB", "D97706", "7C3AED", "E11D48"
MUTED, LINE = "5B6B65", "D5E3DB"
SERIF, SANS = "Georgia", "Calibri"
import os

FOUNDER, EMAIL, SITE = "Waseem Mushtaq Mir", "waseemmushtaq173@gmail.com", "https://kashroot-web.vercel.app"
# The phone number is not stored in the repository: set it when you build, e.g. KR_DECK_PHONE="+91-XXXXXXXXXX".
PHONE = os.environ.get("KR_DECK_PHONE", "+91-XXXXXXXXXX")

prs = Presentation()
prs.slide_width, prs.slide_height = Inches(13.333), Inches(7.5)
BLANK = prs.slide_layouts[6]

# ───────────────────────── helpers ─────────────────────────
def box(s, x, y, w, h, fill=WHITE, line=None, round_=0.06, shadow=False):
    sh = s.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE if round_ else MSO_SHAPE.RECTANGLE, Inches(x), Inches(y), Inches(w), Inches(h))
    if round_:
        sh.adjustments[0] = min(0.5, round_ * 1.0 / max(0.3, min(w, h)) * 1.0)
    if fill: sh.fill.solid(); sh.fill.fore_color.rgb = rgb(fill)
    else: sh.fill.background()
    if line: sh.line.color.rgb = rgb(line); sh.line.width = Pt(1)
    else: sh.line.fill.background()
    sh.shadow.inherit = False
    return sh

def text(s, x, y, w, h, t, size=14, color=INK, bold=False, font=SANS, align="l", anchor="t", italic=False, spacing=None):
    tb = s.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    tf = tb.text_frame; tf.word_wrap = True
    tf.margin_left = tf.margin_right = Inches(0.04); tf.margin_top = tf.margin_bottom = Inches(0.02)
    tf.vertical_anchor = {"t": MSO_ANCHOR.TOP, "m": MSO_ANCHOR.MIDDLE, "b": MSO_ANCHOR.BOTTOM}[anchor]
    lines = t if isinstance(t, list) else [t]
    for i, ln in enumerate(lines):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.alignment = {"l": PP_ALIGN.LEFT, "c": PP_ALIGN.CENTER, "r": PP_ALIGN.RIGHT}[align]
        if spacing: p.space_after = Pt(spacing)
        runs = ln if isinstance(ln, list) else [(ln, {})]
        for rt, st in runs:
            r = p.add_run(); r.text = rt
            f = r.font; f.name = st.get("font", font); f.size = Pt(st.get("size", size))
            f.bold = st.get("bold", bold); f.italic = st.get("italic", italic); f.color.rgb = rgb(st.get("color", color))
    return tb

def pill(s, x, y, w, h, t, fill, color=WHITE, size=12, bold=True):
    b = box(s, x, y, w, h, fill=fill, round_=h / 2)
    tf = b.text_frame; tf.margin_left = tf.margin_right = Inches(0.08); tf.margin_top = tf.margin_bottom = 0
    tf.vertical_anchor = MSO_ANCHOR.MIDDLE; tf.word_wrap = True
    p = tf.paragraphs[0]; p.alignment = PP_ALIGN.CENTER
    r = p.add_run(); r.text = t; r.font.size = Pt(size); r.font.bold = bold; r.font.name = SANS; r.font.color.rgb = rgb(color)
    return b

def mountains(s, y0, color, alpha_tone):
    """A quiet Himalayan skyline along the bottom edge."""
    for x, w, h in [(-0.6, 4.2, 1.5), (2.4, 5.0, 2.1), (6.4, 4.6, 1.7), (9.6, 4.6, 2.3)]:
        t = s.shapes.add_shape(MSO_SHAPE.ISOSCELES_TRIANGLE, Inches(x), Inches(y0 - h), Inches(w), Inches(h))
        t.fill.solid(); t.fill.fore_color.rgb = rgb(alpha_tone if h > 2 else color); t.line.fill.background(); t.shadow.inherit = False

def slide(notes, dark=False, tag=None, title=None, n=None):
    s = prs.slides.add_slide(BLANK)
    bg = s.background.fill; bg.solid(); bg.fore_color.rgb = rgb(PINE if dark else MINT)
    if n is not None:
        box(s, 0, 0, 0.18, 7.5, fill=GOLD, round_=0)
        if tag: text(s, 0.55, 0.32, 8, 0.3, tag, 12, GOLD if dark else GREEN, True)
        if title: text(s, 0.55, 0.62, 12.2, 0.8, title, 30, WHITE if dark else PINE, True, SERIF)
        text(s, 0.55, 7.05, 9, 0.3, "KASHROOT  ·  NewGen IEDC, University of Kashmir  ·  RUSA 2.0 Seed Grant", 10, "9DB8AD" if dark else MUTED)
        text(s, 12.0, 7.05, 0.8, 0.3, f"{n} / 11", 10, "9DB8AD" if dark else MUTED, align="r")
    s.notes_slide.notes_text_frame.text = notes
    return s

def card(s, x, y, w, h, head=None, head_color=GREEN, fill=WHITE, bar=None):
    box(s, x, y, w, h, fill=fill, line=LINE)
    if bar: box(s, x, y + 0.12, 0.09, h - 0.24, fill=bar, round_=0)
    if head: text(s, x + 0.2, y + 0.12, w - 0.4, 0.35, head, 13, head_color, True)

def kpi(s, x, y, w, h, big, small, color=GREEN, big_size=34):
    card(s, x, y, w, h, bar=color)
    text(s, x + 0.25, y + 0.1, w - 0.4, h * 0.55, big, big_size, color, True, SERIF, anchor="m")
    text(s, x + 0.25, y + h * 0.58, w - 0.4, h * 0.4, small, 12.5, INK)

# ───────────────────────── 1 · Cover ─────────────────────────
s = slide("""Good morning. I am Waseem Mushtaq Mir from Shopian. KashRoot is a live platform that helps Kashmir's apple growers sell directly, store fruit in shared cold-store bins, and move it to buyers on one truck. It is MSME approved, incorporation at MCA is under way, and it is already running in production, so this is not just an idea. In five minutes I will show the problem, the product, the money, and what we will do with the grant.""", dark=True)
mountains(s, 7.5, "1B5A47", "174C3C")
pill(s, 0.6, 0.45, 6.9, 0.42, "NEWGEN IEDC · UNIVERSITY OF KASHMIR  |  RUSA 2.0 SEED GRANT PITCH", GOLD, PINE, 12)
text(s, 0.6, 1.1, 8, 1.3, [[("KASH", {"color": WHITE}), ("ROOT", {"color": GOLD})]], 78, WHITE, True, SERIF)
text(s, 0.6, 2.45, 8.6, 1.2, "Digital apple trade, shared 3D cold storage and offline-ready transport for Jammu & Kashmir and the Himalayan belt", 21, "DCEBE4")
for i, t in enumerate(["✅  Approved & Certified by MSME (Govt. of India)", "🏛️  Company Incorporation Underway at MCA (NSWS)", "🚀  100% Built & Live in Production"]):
    pill(s, 0.6 + i * 4.1, 3.95, 3.95, 0.5, t, [EMERALD, AMBER, SAPPHIRE][i], WHITE, 12.5)
text(s, 0.6, 4.75, 12, 0.35, [[(FOUNDER, {"bold": True, "color": GOLD}), ("  ·  Founder & Lead Architect  ·  Shopian, J&K", {})]], 15, WHITE)
text(s, 0.6, 5.1, 12, 0.35, f"{EMAIL}   |   {PHONE}   |   Live app: {SITE}", 14, "B8D3C8")
box(s, 0.6, 5.65, 9.0, 1.05, fill="0E2E25", line=GOLD)
text(s, 0.8, 5.72, 8.7, 0.95, "“Helping 7 lakh Kashmiri orchard families keep 100% of their harvest value: 0% fee for the farmer, shared 3D cold-store bins, hub pickup within 10 km, and apps that work offline in the mountains.”", 14.5, WHITE, italic=True, anchor="m")

# ───────────────────────── 2 · Problem ─────────────────────────
s = slide("""Who is affected: about 7 lakh orchard families in Shopian, Pulwama, Sopore, Kulgam, Anantnag and the high mountain belts. They grow about 2.1 million tonnes of apples, a business of more than 10,000 crore rupees. What goes wrong: middlemen take 8 to 15 percent, and money arrives after 60 to 90 days. Small growers with 15 to 40 crates cannot rent cold storage because stores rent 100-crate bins. Small orders cannot fill a 2,000-box truck. Fake pesticides damage trees, and there is no network in upper orchards. In our interviews in Shopian, Chitragam and IGC Lassipora, growers told us they lose 25 to 30 percent of their net income. Be ready to say these interviews are our own field conversations.""", tag="01 · THE PROBLEM", title="Small apple growers lose a quarter of their income", n=2)
card(s, 0.55, 1.65, 3.5, 4.45, "WHO IS AFFECTED", bar=GREEN)
text(s, 0.8, 2.1, 3.15, 0.75, "7,00,000+", 32, GREEN, True, SERIF, anchor="m")
text(s, 0.8, 2.9, 3.15, 0.9, "orchard families in Shopian, Pulwama, Sopore, Kulgam, Anantnag and the high mountains", 12.5)
text(s, 0.8, 3.95, 3.15, 0.55, "2.1 million MT", 22, PINE, True, SERIF, anchor="m")
text(s, 0.8, 4.5, 3.15, 0.4, "of apples every year", 12.5)
text(s, 0.8, 4.98, 3.15, 0.55, "₹10,000+ Cr", 22, PINE, True, SERIF, anchor="m")
text(s, 0.8, 5.5, 3.1, 0.4, "apple economy", 12.5)
text(s, 4.3, 1.62, 5, 0.3, "WHAT GOES WRONG", 13, RUBY, True)
for i, (big, small, c) in enumerate([("8–15%", "taken by middlemen as commission", RUBY), ("60–90 days", "wait to get paid", AMBER), ("85%", "of small growers cannot rent cold storage (bins are 100 crates)", VIOLET), ("2,000 boxes", "needed to fill a highway truck; small orders are stranded", SAPPHIRE)]):
    x, y = 4.3 + (i % 2) * 2.7, 2.0 + (i // 2) * 2.15
    card(s, x, y, 2.55, 2.0, bar=c)
    text(s, x + 0.22, y + 0.12, 2.25, 0.6, big, 21, c, True, SERIF, anchor="m")
    text(s, x + 0.22, y + 0.78, 2.25, 1.15, small, 12.5)
card(s, 9.8, 1.65, 3.0, 4.45, "FIELD EVIDENCE", AMBER, bar=AMBER)
text(s, 10.05, 2.1, 2.65, 0.8, "25–30%", 32, AMBER, True, SERIF, anchor="m")
text(s, 10.05, 2.95, 2.6, 1.0, "of net post-harvest income lost to commission, distress sales and fake inputs", 12.5)
text(s, 10.05, 4.15, 2.6, 1.4, ["Interviews in:", "• Shopian", "• Chitragam", "• IGC Lassipora"], 13, INK, spacing=2)
box(s, 0.55, 6.3, 12.25, 0.6, fill=PINE)
text(s, 0.8, 6.3, 11.8, 0.6, "Also: fake pesticides harm the trees, and upper Himalayan orchards often have no mobile internet.", 14, WHITE, anchor="m")

# ───────────────────────── 3 · Innovation ─────────────────────────
s = slide("""Our idea is one platform that connects orchards, cold stores, local hubs, trucks and buyers, and it keeps working when the network is weak. On the left are five free tools anyone can use without signing in: a voice assistant in Kashmiri, Urdu, Hindi and English, TrueScan to check fertiliser and pesticide labels against government lists, live mandi prices and weather, a price comparison across 13 categories, and a pay-after-delivery calculator. In the middle are the nine portals, each with its own sign-in. The picture on the right is a real screenshot from our live app: a cold store built from the owner's own measurements. Farmers pick bins like airline seats, and several small farmers can share one bin. To our knowledge, nobody offers this in J&K today.""", tag="02 · OUR INNOVATION", title="One platform, from orchard gate to buyer", n=3)
text(s, 0.55, 1.5, 12.2, 0.4, "Orchards, cold stores, hubs, trucks and buyers in one place, in four languages.", 15, MUTED)
card(s, 0.55, 2.0, 3.55, 4.85, "5 FREE TOOLS · NO SIGN-IN", bar=EMERALD)
for i, (a, b) in enumerate([("Voice AI", "Kashmiri, Urdu, Hindi, English"), ("TrueScan", "Checks fertiliser & pesticide labels"), ("Mandi & weather", "Live rates and spray alerts"), ("Price compare", "13 categories"), ("Escrow calculator", "Pay-after-delivery payout")]):
    y = 2.55 + i * 0.84
    box(s, 0.8, y + 0.04, 0.12, 0.62, fill=EMERALD, round_=0)
    text(s, 1.0, y, 3.0, 0.32, a, 14, PINE, True); text(s, 1.0, y + 0.32, 3.0, 0.32, b, 11.5, MUTED)
text(s, 4.3, 1.98, 4.5, 0.3, "9 PORTALS · EACH WITH ITS OWN SIGN-IN", 13, GREEN, True)
portals = [("Farmer", "0% fee, GPS-stamped lots", EMERALD), ("Buyer", "10 km polling, 1% fee", SAPPHIRE), ("Cold Storage", "2D + 3D bin booking", "0E7490"), ("Kisan Tools", "Verified equipment", AMBER), ("Tracking", "Live GPS, NH-44", RUBY), ("Agro-dealer", "Licence-checked inputs", VIOLET), ("Agronomist", "SKUAST-aligned advice", "15803D"), ("Mandi Helpers", "Grading & loading crews", "A16207"), ("Admin", "10 modules, 8 staff roles", "334155")]
for i, (n_, d, c) in enumerate(portals):
    x, y = 4.3 + (i % 3) * 1.5, 2.4 + (i // 3) * 1.5
    box(s, x, y, 1.4, 1.4, fill=c, round_=0.08)
    text(s, x + 0.07, y + 0.1, 1.26, 0.55, n_, 14, WHITE, True, anchor="m", align="c")
    text(s, x + 0.07, y + 0.68, 1.26, 0.7, d, 10.5, "F3F7F5", align="c")
card(s, 8.9, 2.0, 3.9, 4.85)
if IMG_3D.exists():
    s.shapes.add_picture(str(IMG_3D), Inches(9.0), Inches(2.1), width=Inches(3.7))
text(s, 9.05, 4.15, 3.6, 0.3, "Live app screenshot (sample store)", 10.5, MUTED, italic=True)
text(s, 9.05, 4.5, 3.6, 0.3, "3D cold store walk-inside", 15, PINE, True)
text(s, 9.05, 4.85, 3.6, 1.9, ["• Built from the owner's real sizes", "• Farmers pick bins like airline seats", "• 3 small farmers can share 1 bin, each seeing only their own boxes", "• Nothing is assumed or made up"], 12, INK, spacing=2)

# ───────────────────────── 4 · Market + offline ─────────────────────────
s = slide("""The demand is local and real. There are about 7 lakh grower households and 65-plus controlled-atmosphere cold stores in J&K. In our grower conversations, 88 percent said they would use a service with no grower fee, doorstep pickup and shared cold bins. We have five pilot hubs ready: Shopian Aglar, IGC Lassipora, Sopore, Kulgam and Anantnag. The mountains need an offline version. Step one: the phone saves your orders and bin passes when there is no signal. Step two: when the network returns, everything syncs once, with no double entries. Step three: pickup codes and payment confirmations also work by SMS. Step four: the 3D cold store becomes a light 2D drawing on slow 2G, and the voice assistant speaks Kashmiri and Urdu. Part of this is built; the full Himalayan version is Milestone 1 of the grant.""", tag="03 · MARKET DEMAND & LOCAL FIT", title="Built for J&K first, ready for the mountains", n=4)
kpi(s, 0.55, 1.6, 4.0, 1.5, "7,00,000+", "grower households · 65+ CA cold stores in J&K", GREEN)
kpi(s, 4.75, 1.6, 4.0, 1.5, "88%", "growers willing to use it (no fee, pickup, shared bins)", EMERALD)
kpi(s, 8.95, 1.6, 3.85, 1.5, "5 hubs", "ready: Shopian Aglar, Lassipora, Sopore, Kulgam, Anantnag", AMBER, 32)
text(s, 0.55, 3.4, 9, 0.4, "OFFLINE-FIRST FOR THE HIMALAYAS AND ALL UPPER REGIONS", 14, GREEN, True)
pill(s, 9.2, 3.38, 3.6, 0.36, "Grant Milestone M1 · part built today", GOLD, PINE, 11.5)
for i, (h, d, c) in enumerate([("1  Save on the phone", "Profiles, lots, bin passes and orders stay on the device with no signal.", SAPPHIRE), ("2  Sync by itself", "When the network returns, orders upload once. No double entries.", EMERALD), ("3  SMS backup", "Pickup codes and payment confirmations also work by SMS.", AMBER), ("4  Light and local", "3D store becomes a simple 2D plan on 2G. Voice in Kashmiri & Urdu.", VIOLET)]):
    x = 0.55 + i * 3.1
    card(s, x, 3.95, 2.95, 2.05, bar=c)
    text(s, x + 0.25, 4.05, 2.6, 0.55, h, 15, c, True, anchor="m")
    text(s, x + 0.25, 4.65, 2.6, 1.3, d, 13, INK)
box(s, 0.55, 6.2, 12.25, 0.65, fill=PINE)
text(s, 0.8, 6.2, 11.8, 0.65, "Next: a full offline version for the Himalayas and every upper region where the network is weak.", 14.5, GOLD, True, anchor="m")

# ───────────────────────── 5 · Business model ─────────────────────────
s = slide("""Here is how the 10 kilometre pool works. A buyer places the first order and sets a cluster anchor. The buyer sees the distance to nearby growers and fills a 2,000-box truck bar. Our local pickup vehicle collects boxes from each grower's gate, using a 6-digit handover code, brings them to the nearest KashRoot hub, and the full truck goes straight to the buyer. Revenue has three streams: the buyer pays a 1 percent escrow fee plus freight, which is 45 percent of revenue; cold stores pay 2,500 rupees a month plus 2 rupees a crate, 40 percent; and TrueScan and fleet verification subscriptions, 15 percent. The farmer pays nothing. On a 1,50,000 rupee lot, the old mandi takes about 18,000. With KashRoot the farmer keeps all of it and the buyer pays 1,500. Break-even is Month 8. These are our planning numbers and we will refine them in the pilot.""", tag="04 · BUSINESS MODEL", title="Farmer pays 0%. Buyer pays 1%.", n=5)
for i, t in enumerate(["Buyer's 1st order", "10 km cluster", "Fill 2,000-box truck", "Pickup at orchard gate", "Nearest hub → buyer"]):
    x = 0.55 + i * 2.47
    ch = s.shapes.add_shape(MSO_SHAPE.CHEVRON if i else MSO_SHAPE.PENTAGON, Inches(x), Inches(1.55), Inches(2.5), Inches(0.9))
    ch.fill.solid(); ch.fill.fore_color.rgb = rgb([GREEN, "1B6B55", "0E7490", SAPPHIRE, VIOLET][i]); ch.line.fill.background(); ch.shadow.inherit = False
    tf = ch.text_frame; tf.margin_left = Inches(0.35 if i else 0.15); tf.margin_right = Inches(0.25); tf.word_wrap = True; tf.vertical_anchor = MSO_ANCHOR.MIDDLE
    p = tf.paragraphs[0]; p.alignment = PP_ALIGN.CENTER; r = p.add_run(); r.text = t; r.font.size = Pt(12.5); r.font.bold = True; r.font.name = SANS; r.font.color.rgb = rgb(WHITE)
text(s, 0.55, 2.55, 12, 0.3, "6-digit handover code at every gate · buyer sees the exact km to each grower", 12, MUTED, italic=True)
text(s, 0.55, 3.0, 5, 0.3, "3 REVENUE STREAMS", 13, GREEN, True)
for i, (pct, h, d, c) in enumerate([("45%", "Buyer escrow fee", "1% of the order + freight", SAPPHIRE), ("40%", "Cold-store 3D SaaS", "₹2,500 / month + ₹2 / crate", EMERALD), ("15%", "TrueScan & fleet checks", "Yearly verification fee", VIOLET)]):
    y = 3.4 + i * 1.18
    card(s, 0.55, y, 5.6, 1.07, bar=c)
    text(s, 0.8, y + 0.05, 1.3, 0.95, pct, 28, c, True, SERIF, anchor="m")
    text(s, 2.1, y + 0.14, 3.9, 0.4, h, 15, PINE, True); text(s, 2.1, y + 0.55, 3.9, 0.4, d, 12.5)
text(s, 6.45, 3.0, 6, 0.3, "ONE ₹1,50,000 LOT OF 100 BOXES", 13, GREEN, True)
card(s, 6.45, 3.4, 3.05, 2.35, "TRADITIONAL MANDI", RUBY, bar=RUBY)
text(s, 6.7, 3.9, 2.7, 0.6, "−₹18,000", 28, RUBY, True, SERIF); text(s, 6.7, 4.55, 2.7, 1.1, "12% lost · paid in 60–90 days", 12.5)
card(s, 9.7, 3.4, 3.1, 2.35, "WITH KASHROOT", EMERALD, bar=EMERALD)
text(s, 9.95, 3.9, 2.8, 0.6, "₹1,50,000", 28, EMERALD, True, SERIF); text(s, 9.95, 4.55, 2.8, 1.1, "100% to farmer, paid on delivery. Buyer pays ₹1,500 (1%).", 12.5)
for i, (a, b, c) in enumerate([("₹350", "to win a user (CAC)", AMBER), ("₹14,500", "lifetime value (LTV)", SAPPHIRE), ("Month 8", "break-even", GREEN)]):
    box(s, 6.45 + i * 2.15, 5.95, 2.05, 0.95, fill=c, round_=0.08)
    text(s, 6.45 + i * 2.15, 5.98, 2.05, 0.5, a, 20, WHITE, True, SERIF, align="c", anchor="m"); text(s, 6.45 + i * 2.15, 6.48, 2.05, 0.35, b, 11, "F3F7F5", align="c")

# ───────────────────────── 6 · Scale ─────────────────────────
s = slide("""We grow in three steps. Year 1 is the pilot in South Kashmir: Shopian Mega Mandi and the IGC Lassipora cold-chain estate, with 5 cold stores, 500 growers and about 12 crore rupees of trade. Year 2 covers all J&K districts and the high-altitude orchard zones: 25 cold stores, 3,500 growers and about 85 crore rupees. Year 3 takes the offline-first engine to Himachal's Shimla and Kinnaur, Uttarakhand and upper Ladakh: 80 cold stores, 15,000 growers and about 320 crore rupees. The software is built once and reused in every region, so each new region mostly needs people on the ground. These are projections, not results.""", tag="05 · SCALABILITY & GROWTH", title="From Shopian to the whole Himalayan belt", n=6)
for i, (yr, area, st, gp, gv, c) in enumerate([("YEAR 1 · PILOT", "South Kashmir", "Shopian Mega Mandi hub + IGC Lassipora cold-chain estate", "5 cold stores\n500 orchardists", "₹12 Cr", EMERALD), ("YEAR 2 · REGIONAL", "All J&K districts + upper reaches", "Sopore, Baramulla, Kulgam, Anantnag, Budgam and high-altitude zones", "25 cold stores\n3,500 orchardists", "₹85 Cr", SAPPHIRE), ("YEAR 3 · HIMALAYAN BELT", "Offline-first expansion", "J&K, Himachal (Shimla, Kinnaur), Uttarakhand, upper Ladakh", "80 cold stores\n15,000 growers", "₹320 Cr", VIOLET)]):
    x = 0.55 + i * 4.15
    top = 3.3 - i * 0.55
    box(s, x, top, 3.95, 6.85 - top, fill=WHITE, line=LINE)
    box(s, x, top, 3.95, 0.5, fill=c, round_=0)
    text(s, x + 0.2, top + 0.02, 3.6, 0.46, yr, 14, WHITE, True, anchor="m")
    text(s, x + 0.2, top + 0.62, 3.6, 0.35, area, 14.5, PINE, True)
    text(s, x + 0.2, top + 1.0, 3.6, 0.8, st, 11.5, MUTED)
    text(s, x + 0.2, top + 1.85, 3.6, 0.75, gp.split("\n"), 14, INK, True, spacing=0)
    text(s, x + 0.2, 6.85 - 0.95, 3.6, 0.8, [[(gv, {"size": 28, "color": c, "bold": True, "font": SERIF}), ("  yearly trade", {"size": 12, "color": MUTED})]], 28, c, anchor="m")
text(s, 0.55, 1.6, 3.9, 1.3, "Build once, reuse in every valley. Same app, same offline engine.", 16, GREEN, True, SERIF)

# ───────────────────────── 7 · Impact ─────────────────────────
s = slide("""Our impact has three headline numbers. First, 25-plus direct jobs in J&K: hardware technicians, hub coordinators, software engineers and field onboarding staff. Second, more than 1,500 indirect livelihoods: pickup drivers, graded mandi helpers and verified agro-dealers. Third, more than 9 crore rupees a year of grower income kept in the valley by Year 2, which is the 12 percent middleman cut on about 85 crore rupees of trade, with a 0 percent farmer fee. Beyond the numbers, a grower with only 15 crates can finally use a cold store, TrueScan keeps fake pesticide out of orchards, and digital trade reaches offline villages.""", tag="06 · JOBS & SOCIO-ECONOMIC IMPACT", title="Jobs for our youth, income kept by our growers", n=7)
for i, (big, h, d, c) in enumerate([("25+", "Direct jobs", "Sensor technicians, hub coordinators, software engineers and field staff in J&K", EMERALD), ("1,500+", "Indirect livelihoods", "Pickup drivers, graded mandi helpers and verified agro-dealers", SAPPHIRE), ("₹9 Cr+", "Income kept each year", "By Year 2: the 12% middleman cut on about ₹85 Cr of trade, with 0% farmer fee", AMBER)]):
    x = 0.55 + i * 4.15
    card(s, x, 1.7, 3.95, 3.5, bar=c)
    text(s, x + 0.3, 1.9, 3.5, 1.1, big, 50, c, True, SERIF, anchor="m")
    text(s, x + 0.3, 3.05, 3.5, 0.4, h, 17, PINE, True); text(s, x + 0.3, 3.55, 3.5, 1.5, d, 13.5)
text(s, 0.55, 5.45, 5, 0.3, "WHAT CHANGES ON THE GROUND", 13, GREEN, True)
for i, (t, c) in enumerate([("15-crate growers can use cold storage", EMERALD), ("Fake pesticides caught by TrueScan", RUBY), ("Offline villages join digital trade", VIOLET)]):
    pill(s, 0.55 + i * 4.15, 5.9, 3.95, 0.6, t, c, WHITE, 13.5)

# ───────────────────────── 8 · Budget ─────────────────────────
s = slide("""We are asking for 5 lakh rupees. Important: the full cloud software and the 3D engine are already built, so no money goes on basic coding. Twenty percent, 1 lakh, builds the offline Himalayan sync engine, the SMS gateway and cloud scaling. Forty percent, 2 lakh, buys industrial temperature, humidity, oxygen and CO2 sensors for five pilot chambers plus QR gate kiosks for the hubs. Twenty-five percent, 1.25 lakh, pays hub pickup coordinators and field onboarding in Shopian and Lassipora. Ten percent, 50,000, goes to grower workshops and mandi demos. Five percent, 25,000, is a safety reserve for security audits and hardware spares. Every rupee is linked to a milestone on the next slide.""", tag="07 · FUND UTILIZATION & BUDGET", title="₹5,00,000 grant: nothing wasted on basic coding", n=8)
box(s, 0.55, 1.5, 12.25, 0.6, fill=PINE)
text(s, 0.8, 1.5, 11.8, 0.6, "The cloud software and 3D engine are ALREADY BUILT. Every rupee goes to the field.", 15.5, GOLD, True, anchor="m")
rows = [("Budget item", "Amount (₹)", "% of total", "Milestone"),
        ("Product: offline Himalayan sync engine, SMS gateway, cloud scaling", "1,00,000", "20%", "M1"),
        ("Equipment: temp / humidity / O₂ / CO₂ sensors for 5 CA chambers, QR hub kiosks", "2,00,000", "40%", "M1 & M2"),
        ("Operations: Shopian & Lassipora hub pickup coordinators, field onboarding", "1,25,000", "25%", "M2"),
        ("Marketing: grower workshops, mandi demos, multilingual onboarding", "50,000", "10%", "M3"),
        ("Contingency: security audits, hardware spares", "25,000", "5%", "–"),
        ("TOTAL", "5,00,000", "100%", "")]
gt = s.shapes.add_table(len(rows), 4, Inches(0.55), Inches(2.3), Inches(12.25), Inches(4.5))
tbl = gt.table
for j, w in enumerate([7.4, 1.8, 1.5, 1.55]): tbl.columns[j].width = Inches(w)
for i, r in enumerate(rows):
    tbl.rows[i].height = Inches(0.64)
    for j, v in enumerate(r):
        c = tbl.cell(i, j); c.fill.solid()
        c.fill.fore_color.rgb = rgb(GREEN if i == 0 else PINE if i == len(rows) - 1 else (WHITE if i % 2 else "F4F9F6"))
        c.vertical_anchor = MSO_ANCHOR.MIDDLE; c.margin_left = c.margin_right = Inches(0.15)
        tf = c.text_frame; tf.word_wrap = True; p = tf.paragraphs[0]; p.alignment = PP_ALIGN.LEFT if j == 0 else PP_ALIGN.CENTER
        run = p.add_run(); run.text = v; run.font.name = SANS; run.font.size = Pt(13.5 if j == 0 else 15)
        run.font.bold = i in (0, len(rows) - 1) or j in (1, 2)
        run.font.color.rgb = rgb(WHITE if i in (0, len(rows) - 1) else (GREEN if j in (1, 2) else INK))

# ───────────────────────── 9 · Milestones ─────────────────────────
s = slide("""The plan is twelve months in three milestones. Milestone 1, months 0 to 3, 2.25 lakh rupees: install sensor nodes in five pilot cold-store chambers in IGC Lassipora and Shopian, and release the offline app with SMS fallback for upper orchards. Milestone 2, months 4 to 8, 1.75 lakh: open the Shopian and Lassipora consolidation hubs, set up QR gate kiosks, and sign up the first 500 growers and 5 cold stores with real 2,000-box truck pooling. Milestone 3, months 9 to 12, 1 lakh: grow to 10-plus cold stores and 50-plus institutional buyers, pass 15 lakh rupees of platform revenue, and reach break-even. We will report to the committee at the end of each milestone.""", tag="08 · MILESTONES TIED TO FUNDING", title="12 months, 3 milestones, every rupee tracked", n=9)
ln = box(s, 0.9, 2.45, 11.5, 0.08, fill=GOLD, round_=0)
for i, (m, mo, fund, items, c) in enumerate([("M1", "MONTH 0–3", "₹2,25,000", ["Sensors in 5 pilot CA chambers (Lassipora, Shopian)", "Offline app + SMS fallback for upper orchards"], EMERALD), ("M2", "MONTH 4–8", "₹1,75,000", ["Shopian & Lassipora hubs open, QR gate kiosks", "First 500 growers + 5 cold stores", "Live 2,000-box truck pooling"], SAPPHIRE), ("M3", "MONTH 9–12", "₹1,00,000", ["10+ cold stores, 50+ institutional buyers", "₹15 Lakh+ platform revenue", "Break-even"], VIOLET)]):
    x = 0.55 + i * 4.15
    dot = s.shapes.add_shape(MSO_SHAPE.OVAL, Inches(x + 0.15), Inches(2.22), Inches(0.55), Inches(0.55)); dot.fill.solid(); dot.fill.fore_color.rgb = rgb(c); dot.line.color.rgb = rgb(WHITE); dot.line.width = Pt(3); dot.shadow.inherit = False
    text(s, x + 0.15, 2.22, 0.55, 0.55, m, 12, WHITE, True, align="c", anchor="m")
    text(s, x + 0.85, 2.0, 3, 0.35, mo, 13, c, True)
    card(s, x, 3.1, 3.95, 3.75, bar=c)
    text(s, x + 0.3, 3.25, 3.5, 0.7, fund, 30, c, True, SERIF, anchor="m")
    text(s, x + 0.3, 3.95, 3.5, 0.3, "grant funds", 11.5, MUTED)
    text(s, x + 0.3, 4.4, 3.5, 2.4, [f"• {t}" for t in items], 13.5, INK, spacing=5)
text(s, 0.55, 1.5, 12, 0.35, "Report to the committee at the end of each milestone.", 14, MUTED, italic=True)

# ───────────────────────── 10 · Team ─────────────────────────
s = slide("""The founder, Waseem Mushtaq Mir, built the whole Next.js, TypeScript, Supabase and Three.js platform himself and comes from a Shopian horticulture family. Next to him are a field and hub operations team in Shopian and Lassipora who will handle cold-store onboarding, orchard pickups and grower support, and an advisory panel of post-harvest and SKUAST-aligned experts. On the legal side, MSME Udyam is approved and certified by the Government of India, and company incorporation is under way at the Ministry of Corporate Affairs through the National Single Window System. Our three-year vision is to be the operating system for every orchard, cold store and transport hub in J&K and the Himalayan belt. Have the Udyam certificate and the NSWS application number ready for questions.""", tag="09 · TEAM & COMMITMENT", title="Built by a Shopian grower's son, backed by the field", n=10)
for i, (nm, role, d, c) in enumerate([(FOUNDER, "Founder & Lead Full-Stack / 3D Architect ✓", "Built the whole platform: Next.js, TypeScript, Supabase, Three.js. From a Shopian horticulture family.", EMERALD), ("Field & Hub Operations", "Shopian & Lassipora · Full-time ✓", "Cold-store onboarding, 10 km orchard pickup, grower support.", SAPPHIRE), ("Advisory Panel", "Domain mentors ✓", "Post-harvest CA storage and SKUAST-aligned crop advice.", VIOLET)]):
    x = 0.55 + i * 4.15
    card(s, x, 1.7, 3.95, 2.85, bar=c)
    text(s, x + 0.3, 1.85, 3.5, 0.45, nm, 17, PINE, True, SERIF); text(s, x + 0.3, 2.35, 3.5, 0.6, role, 12.5, c, True); text(s, x + 0.3, 3.0, 3.5, 1.5, d, 13)
box(s, 0.55, 4.8, 7.4, 2.05, fill=PINE)
text(s, 0.85, 4.9, 6.9, 0.35, "LEGAL & REGULATORY READINESS", 13, GOLD, True)
text(s, 0.85, 5.35, 6.9, 1.4, ["✅  MSME (Udyam): approved & certified by Govt. of India", "🏛️  MCA incorporation underway through NSWS", "🚀  Product live in production today"], 14.5, WHITE, spacing=6)
box(s, 8.2, 4.8, 4.6, 2.05, fill=GOLD)
text(s, 8.45, 4.9, 4.1, 0.35, "3-YEAR VISION", 13, PINE, True)
text(s, 8.45, 5.3, 4.1, 1.5, "The operating system for every orchard, cold store and transport hub in J&K and the Himalayan belt.", 16, PINE, True, SERIF)

# ───────────────────────── 11 · Why us / Ask ─────────────────────────
s = slide("""To close: six reasons to back KashRoot. One, it is an original answer to a real problem: shared 3D cold-store bins, 10 km hub pickup and TrueScan, which we believe is a first in J&K. Two, it fits local demand and works offline for the Himalayas. Three, MSME is approved, MCA is under way and the product is live today. Four, the model is farmer-first: 0 percent for growers, 1 percent for buyers, break-even in Month 8. Five, impact: more than 9 crore rupees of income kept by Year 2 and 25-plus jobs. Six, the grant is tied to clear milestones. Our ask is 5 lakh rupees from the RUSA 2.0 Seed Grant. Thank you, and we welcome your questions. Keep the live app open on kashroot-web.vercel.app for the demo.""", dark=True, tag="10 · WHY US, WHY NOW · THE ASK", title="Why KashRoot, why now", n=11)
checks = [("Original & real", "Shared 3D cold bins + 10 km hub pickup + TrueScan: a first of its kind in J&K"), ("Local & offline-ready", "Kashmiri / Urdu voice; auto-sync for Himalayan gaps"), ("Legal & live", "MSME approved · MCA underway · running at kashroot-web.vercel.app"), ("Farmer-first model", "0% farmer, 1% buyer, break-even in Month 8"), ("Real impact", "₹9 Cr+ kept by Year 2 · 25+ direct jobs"), ("Milestone-linked", "Sensors, hub kiosks, field onboarding")]
for i, (h, d) in enumerate(checks):
    x, y = 0.55 + (i % 3) * 4.15, 1.6 + (i // 3) * 1.55
    box(s, x, y, 3.95, 1.4, fill="0E2E25", line="2C5E4D")
    text(s, x + 0.2, y + 0.1, 0.5, 0.5, "✅", 18, WHITE)
    text(s, x + 0.75, y + 0.12, 3.1, 0.4, h, 15, GOLD, True); text(s, x + 0.75, y + 0.55, 3.1, 0.8, d, 11.5, "DCEBE4")
box(s, 0.55, 4.85, 12.25, 1.35, fill=GOLD)
text(s, 0.85, 4.9, 2.0, 1.25, "THE ASK", 16, PINE, True, anchor="m")
text(s, 2.6, 4.9, 10.0, 1.25, "₹5,00,000 RUSA 2.0 Seed Grant", 30, PINE, True, SERIF, anchor="m", align="r")
text(s, 0.55, 6.45, 12.25, 0.4, [[("Thank you", {"bold": True, "color": GOLD}), (f"   |   {FOUNDER}   |   {EMAIL}   |   {PHONE}   |   {SITE}", {})]], 13, WHITE, align="c")

prs.save(OUT)
print(f"Saved {OUT.name}: {len(prs.slides)} slides, {OUT.stat().st_size / 1024:.0f} KB")
