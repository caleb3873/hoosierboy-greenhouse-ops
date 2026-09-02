"""Customer-facing sales sheet for the House 13 Spring 2027 perennial program.

Usage: python3 sales_build.py <data_dir> <out_html>
Reads h13.json + combos.json (same exports the supplier page uses). No suppliers,
brokers, trays, costs or bench codes appear — customers see varieties, colours,
sizes, quantities and the week they're ready.
"""
import json, re, sys, html
from datetime import date, timedelta

S, OUT = sys.argv[1], sys.argv[2]
def load(name):
    t = open(f"{S}/{name}").read(); return json.loads(t[t.index("{"):])["rows"]
rows = [r for r in load("h13.json") if r["prop_method"] in ("URC", "PLUG", "BAREROOT") and r["pots"] > 0]
combos = load("combos.json")

def iso_monday(y, w):
    d = date(y, 1, 4); d -= timedelta(days=d.isoweekday() - 1); return d + timedelta(weeks=w - 1)
MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
def wk_label(w):
    d = iso_monday(2027, w); return f"{MON[d.month-1]} {d.day}"

def tc(s):
    out = []
    for w in re.sub(r"\s+", " ", s.strip()).split(" "):
        if w in ("(A)", "(S)") or re.fullmatch(r"[A-Z]{1,2}\.|&", w): out.append(w); continue
        out.append(re.sub(r"(^|['\-])([a-z])", lambda m: m.group(1) + m.group(2).upper(), w.lower()))
    return " ".join(out).replace("(A)", "").replace("(S)", "")
def clean(v):
    v = re.sub(r"^(Salvia Species Sage|Salvia Sage)", "Salvia", v); v = re.sub(r"^Allium Species Allium", "Allium", v)
    v = v.replace("Imp.", "Improved").replace("™", "").replace("®", "").replace("Chartreus", "Chartreuse")
    return re.sub(r"\s{2,}", " ", v).strip()

SWATCH = [("terracotta","#c2703e"),("raspberry","#b3235c"),("magenta","#c2187a"),("burgundy","#7a1f3d"),("coral","#f08a6a"),("rose","#e07a9a"),("pink","#f2a6c0"),
          ("lilac","#c3a4e0"),("lavender","#b7a2d8"),("mauve","#b48ab8"),("violet","#7a4fb5"),("purple","#6b3fa0"),("blue","#4a6fb5"),("sky","#8ab4e8"),
          ("white","#f4f1ea"),("snow","#f4f1ea"),("lemon","#f2e36a"),("yellow","#f0d43c"),("gold","#e0b032"),("saffron","#e39a2e"),("orange","#e8802e"),
          ("red","#c8352e"),("scarlet","#d23a2f"),("bronze","#a8643c"),("caramel","#c78a4e"),("toffee","#a86b3c"),("espresso","#4a2e22"),("lime","#b7d55a"),
          ("chartreuse","#c6d94a"),("green","#5e9c4a"),("tea","#8fae7a"),("forest","#2f5f3a"),("silver","#c9ccc7"),("jersey","#7b4d8a"),("arizona","#b5673e"),
          ("frost","#c8b8d8"),("blush","#f3c4cf"),("dark matter","#3b2a4a"),("midnight","#3a2a5a"),("night","#3a2a5a"),("passion","#6b3fa0"),("emotion","#e07a9a")]
def swatch(name):
    n = name.lower()
    for k, c in SWATCH:
        if k in n: return c
    return None

# ── group quarts + baskets by genus ─────────────────────────────────────────
items = []
for r in rows:
    n = r["item_name"]; size = "Quart" if n.startswith("1 QT") else '9" hanging basket'
    body = re.sub(r'^(1 QT|HB 9")\s+', "", n)
    genus = body.split(" ")[0].title()
    v = clean(tc(body))
    is_lav = genus == "Lavandula"
    typ = "English" if "(A)" in n else ("Spanish" if "(S)" in n else "")
    items.append(dict(genus="Lavender" if is_lav else genus, size=size, name=v, typ=typ, pots=r["pots"], ready=r["ready_wk"], price=r.get("price")))
by = {}
for it in items: by.setdefault(it["genus"], []).append(it)
order = sorted(by, key=lambda g: g.lower())

GENUS_NOTE = {
    "Achillea": "Yarrow · full sun · pollinator favourite, drought tolerant once established",
    "Agastache": "Hummingbird mint · full sun · fragrant foliage, blooms all summer",
    "Ajuga": "Bugleweed · sun to shade · colourful groundcover",
    "Allium": "Ornamental onion · full sun · late-summer globes, deer resistant",
    "Buddleia": "Butterfly bush · full sun · compact, non-invasive",
    "Coreopsis": "Tickseed · full sun · long bloom, easy care",
    "Dianthus": "Pinks · full sun · fragrant, reblooming",
    "Gaillardia": "Blanket flower · full sun · heat and drought tough",
    "Gaura": "Wand flower · full sun · airy, blooms to frost",
    "Heuchera": "Coral bells · part shade · foliage colour all season. Fyre Wing is Terra Nova's new premium series",
    "Lamium": "Dead nettle · shade · silver-leaf groundcover",
    "Lavender": "Full sun · fragrant · English types are hardiest; Spanish bloom earliest",
    "Leucanthemum": "Shasta daisy · full sun · classic white cut flower",
    "Monarda": "Bee balm · sun to part shade · mildew resistant, pollinator magnet",
    "Nepeta": "Catmint · full sun · long blue bloom, deer resistant",
    "Penstemon": "Beardtongue · full sun · hummingbird favourite",
    "Salvia": "Sage · full sun · repeat bloom with a trim",
    "Scabiosa": "Pincushion flower · full sun · blooms spring to fall",
    "Stachys": "Lamb's ear · full sun · soft silver foliage",
    "Veronica": "Speedwell · full sun · upright spikes, reblooms",
}

def card(g, its):
    its = sorted(its, key=lambda i: (i["size"] != "Quart", i["typ"], i["name"]))
    pots = sum(i["pots"] for i in its)
    ready = min(i["ready"] for i in its if i["ready"]) if any(i["ready"] for i in its) else None
    ready = max(ready or 12, 12)
    rows_html = []
    for i in its:
        nm = re.sub(rf"^{g}\s+", "", i["name"]) if g != "Lavender" else re.sub(r"^Lavandula\s+", "", i["name"])
        sw = swatch(nm); dot = f'<i class="dot" style="background:{sw}"></i>' if sw else '<i class="dot none"></i>'
        typ = f'<span class="typ">{i["typ"]}</span>' if i["typ"] else ""
        sz = "" if i["size"] == "Quart" else f'<span class="typ">{i["size"]}</span>'
        pr = f'<span class="price">${float(i["price"]):.2f}</span>' if i.get("price") else ""
        rows_html.append(f'<li>{dot}<span class="nm">{html.escape(nm)}</span>{typ}{sz}{pr}<span class="qty">{i["pots"]:,}</span></li>')
    note = GENUS_NOTE.get(g, "")
    return f'''<article class="card">
  <header><h3>{html.escape(g)}</h3><span class="ready">Ready {wk_label(ready)}</span></header>
  {f'<p class="note">{html.escape(note)}</p>' if note else ''}
  <ul>{''.join(rows_html)}</ul>
  <footer>{len(its)} {"variety" if len(its)==1 else "varieties"} · {pots:,} available</footer>
</article>'''

cards = "\n".join(card(g, by[g]) for g in order)

# combos
bycombo = {}
for c in combos: bycombo.setdefault(c["combo"], []).append(c)
combo_cards = []
for name, comps in bycombo.items():
    pots = int(comps[0]["pots"]); per = sum(int(c["ppp"]) for c in comps)
    pretty = clean(tc(name.replace('11" ', "")))
    parts = "".join(f'<li>{"<i class=\"dot\" style=\"background:%s\"></i>" % swatch(c["variety"]) if swatch(c["variety"]) else "<i class=\"dot none\"></i>"}<span class="nm">{html.escape(c["crop_name"].title()+" "+c["variety"])}</span><span class="qty">×{c["ppp"]}</span></li>' for c in sorted(comps, key=lambda c: c["crop_name"].lower()))
    combo_cards.append(f'''<article class="card combo">
  <header><h3>{html.escape(pretty)}</h3><span class="ready">Ready {wk_label(int(comps[0]["ready_wk"]))}</span></header>
  <p class="note">11" deco patio pot · {per} plants · perennial combination{(" · $%.2f" % float(comps[0]["price"])) if comps[0].get("price") else ""}</p>
  <ul>{parts}</ul>
  <footer>{pots} available</footer>
</article>''')

TOT_Q = sum(i["pots"] for i in items if i["size"] == "Quart"); TOT_B = sum(i["pots"] for i in items if i["size"] != "Quart"); TOT_C = sum(int(c[0]["pots"]) for c in bycombo.values())
n_var = len(items)

page = f'''<title>Hoosier Boy Spring Perennials</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;0,600;1,400&family=Geist:wght@300;400;500;600&display=swap">
<style>
:root{{--paper:#faf8f5;--card:#ffffff;--ink:#22302a;--stone:#6b7570;--border:#e8e2da;--pine:#16403A;--forest:#1a4731;--terra:#c2703e;--tint:#eef3ee;--rule:#d9d2c8}}
@media (prefers-color-scheme: dark){{:root:not([data-theme="light"]){{--paper:#121d19;--card:#182823;--ink:#e6e2da;--stone:#9aa69f;--border:#2b3c35;--pine:#9fcdb4;--forest:#b9dcc7;--terra:#d68a58;--tint:#1c2f28;--rule:#33473f}}}}
:root[data-theme="dark"]{{--paper:#121d19;--card:#182823;--ink:#e6e2da;--stone:#9aa69f;--border:#2b3c35;--pine:#9fcdb4;--forest:#b9dcc7;--terra:#d68a58;--tint:#1c2f28;--rule:#33473f}}
*{{box-sizing:border-box}}
body{{margin:0;background:var(--paper);color:var(--ink);font-family:'Geist','Inter','Segoe UI',system-ui,sans-serif;font-size:15px;line-height:1.5;-webkit-font-smoothing:antialiased}}
.page{{max-width:1040px;margin:0 auto;padding:44px 28px 72px}}
.eyebrow{{text-transform:uppercase;letter-spacing:.18em;font-size:11.5px;font-weight:600;color:var(--terra)}}
h1{{font-family:'Playfair Display',Georgia,serif;font-weight:500;font-size:clamp(34px,5vw,50px);line-height:1.05;margin:10px 0 10px;color:var(--pine);text-wrap:balance;max-width:16ch}}
.lead{{font-size:17px;max-width:60ch;margin:0 0 22px}}
.chips{{display:flex;gap:10px;flex-wrap:wrap;margin:0 0 40px}}
.chip{{background:var(--tint);border-radius:999px;padding:7px 14px;font-size:13px;color:var(--forest)}}
.chip b{{font-variant-numeric:tabular-nums}}
h2{{font-family:'Playfair Display',Georgia,serif;font-weight:500;font-size:28px;margin:0 0 6px;color:var(--pine)}}
.sub{{color:var(--stone);margin:0 0 18px;max-width:66ch}}
section{{margin:0 0 48px}}
.grid{{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px}}
.card{{background:var(--card);border:1px solid var(--border);border-radius:10px;padding:16px 18px 12px;display:flex;flex-direction:column}}
.card header{{display:flex;justify-content:space-between;align-items:baseline;gap:10px}}
.card h3{{font-family:'Playfair Display',Georgia,serif;font-weight:500;font-size:21px;margin:0;color:var(--pine)}}
.ready{{font-size:11.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--terra);font-weight:600;white-space:nowrap}}
.note{{margin:4px 0 10px;font-size:12.5px;color:var(--stone);line-height:1.4}}
.card ul{{list-style:none;margin:0;padding:0;flex:1}}
.card li{{display:flex;align-items:center;gap:8px;padding:5px 0;border-top:1px solid var(--border);font-size:14px}}
.card li:first-child{{border-top:0}}
.dot{{width:11px;height:11px;border-radius:50%;flex:0 0 11px;border:1px solid rgba(0,0,0,.12)}}
.dot.none{{background:transparent;border:1px dashed var(--rule)}}
.nm{{flex:1}}
.typ{{font-size:11px;color:var(--stone);background:var(--tint);border-radius:4px;padding:1px 6px}}
.qty{{font-variant-numeric:tabular-nums;color:var(--stone);font-size:13px;min-width:44px;text-align:right}}
.price{{font-variant-numeric:tabular-nums;font-weight:600;color:var(--forest);font-size:13px;min-width:48px;text-align:right}}
.card footer{{margin-top:10px;padding-top:8px;border-top:1px solid var(--rule);font-size:12px;color:var(--stone)}}
.combo{{background:var(--tint)}}
.how{{border-top:1px solid var(--rule);padding-top:20px;display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:20px}}
.how h4{{margin:0 0 4px;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:var(--terra)}}
.how p{{margin:0;font-size:14px;color:var(--ink)}}
footer.pg{{margin-top:40px;display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;color:var(--stone);font-size:12.5px;border-top:1px solid var(--rule);padding-top:14px}}
footer.pg .brand{{font-family:'Playfair Display',Georgia,serif;font-size:16px;color:var(--pine)}}
</style>
<div class="page">
  <div class="eyebrow">Hoosier Boy · Indianapolis · Spring 2027</div>
  <h1>Perennials, grown here, ready for spring.</h1>
  <p class="lead">A new quart perennial program for 2027: {n_var} varieties across {len(order)} genera, plus fragrant lavender baskets and perennial patio combos. Potted in January, finished under cover outdoors so they arrive hardened off and ready to sell.</p>
  <div class="chips"><span class="chip"><b>{TOT_Q:,}</b> quarts</span><span class="chip"><b>{TOT_B:,}</b> 9" lavender baskets</span><span class="chip"><b>{TOT_C:,}</b> 11" perennial combos</span><span class="chip">Ready late March to mid-April</span><span class="chip">Quarts ship 8 to a carrier</span><span class="chip"><b>$5.99</b> quarts · <b>$9.99</b> Fyre Wing heuchera · <b>$12</b> lavender baskets · <b>$24</b> combos</span></div>

  <section>
    <h2>Quart perennials</h2>
    <p class="sub">Grouped by genus. The date on each card is when the first of that group is ready; quantities are what we're growing for the season.</p>
    <div class="grid">{cards}</div>
  </section>

  <section>
    <h2>11" perennial combos</h2>
    <p class="sub">Fancy Boy deco patio pots planted with a perennial mix.</p>
    <div class="grid">{''.join(combo_cards)}</div>
  </section>

  <div class="how">
    <div><h4>Availability</h4><p>First quarts are ready the week of {wk_label(12)}; the full program is ready by {wk_label(15)} and sells through spring.</p></div>
    <div><h4>Ordering</h4><p>Reserve through your Hoosier Boy sales rep. Quantities shown are the season total, first come first served.</p></div>
    <div><h4>Pricing</h4><p>Quarts $5.99. Fyre Wing heuchera $9.99. 9" lavender baskets $12.00. 11" perennial combos $24.00.</p></div>
  </div>

  <footer class="pg"><span class="brand">Hoosier Boy</span><span>Spring 2027 perennials · quarts, baskets and combos</span></footer>
</div>
'''
open(f"{S}/perennial-sales.html", "w").write(page)
doc = ('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
       '<meta name="robots" content="noindex"><link rel="icon" href="/favicon.ico">' + page.split("</title>")[0] + "</title></head><body>" + page.split("</title>", 1)[1] + "</body></html>")
open(OUT, "w").write(doc)
print(n_var, len(order), TOT_Q, TOT_B, TOT_C)
