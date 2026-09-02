import json, re, sys, html
sys.path.insert(0, S if 'S' in dir() else '.')
S=sys.argv[1]; src=sys.argv[2]
sys.path.insert(0,S); import timeline
t=open(f'{S}/{src}').read(); rows=[r for r in json.loads(t[t.index('{'):])['rows'] if r['prop_method'] in ('URC','PLUG','BAREROOT')]
SUP={'Dummen':'Dümmen Orange','Innovaplant/Kientzler':'Kientzler'}
def tc(s):
    out=[]
    for w in re.sub(r'\s+',' ',s.strip()).split(' '):
        if w in ('(A)','(S)') or re.fullmatch(r"[A-Z]{1,2}\.|&",w): out.append(w); continue
        out.append(re.sub(r"(^|['\-])([a-z])", lambda m:m.group(1)+m.group(2).upper(), w.lower()))
    return ' '.join(out).replace('(A)','(English)').replace('(S)','(Spanish)')
def parse(n):
    m=re.match(r'^(1 QT|HB 9")\s+(.*)$',n); size='Quart' if m.group(1)=='1 QT' else '9" basket'
    rest=m.group(2); genus=rest.split(' ')[0].title()
    v=tc(rest); v=re.sub(r'^(Salvia Species Sage|Salvia Sage)','Salvia',v); v=re.sub(r'^Allium Species Allium','Allium',v)
    v=v.replace('Chartreus','Chartreuse').replace('Imp.','Improved').replace('™','').replace('®','')
    return size,genus,v
sec={'URC':[],'PLUG':[],'BAREROOT':[]}
for r in rows:
    size,genus,var=parse(r['item_name'])
    sec[r['prop_method']].append(dict(size=size,genus=genus,var=var,sup=SUP.get(r['supplier'],r['supplier']) or '',tray=r['tray'],pots=r['pots'],plants=r['plants'],ship=r['ship_wk']))
for k in sec: sec[k].sort(key=lambda d:(d['genus'],d['size']!='Quart',d['var']))
def table(items, cols, row):
    h=['<div class="tblwrap"><table><thead><tr>'+''.join(f'<th class="{"num" if c in ("Cuttings","Plants","Pots","Tray","Arrive","Crowns") else ""}">{c}</th>' for c in cols)+'</tr></thead><tbody>']
    g=None
    for d in items:
        if d['genus']!=g:
            g=d['genus']; n=sum(x['plants'] for x in items if x['genus']==g); cnt=sum(1 for x in items if x['genus']==g)
            h.append(f'<tr class="genus"><td colspan="{len(cols)-1}">{html.escape(g)} <span class="gmeta">{cnt} {"variety" if cnt==1 else "varieties"}</span></td><td class="num gnum">{n:,}</td></tr>')
        h.append(row(d))
    h.append('</tbody></table></div>'); return '\n'.join(h)
e=html.escape
urc_row=lambda d:f'<tr><td>{e(d["var"])}</td><td class="mut">{e(d["sup"])}</td><td class="mut">{d["size"]}</td><td class="num mut">wk {d["ship"]}</td><td class="num">{d["plants"]:,}</td></tr>'
plug_row=lambda d:f'<tr><td>{e(d["var"])}</td><td class="mut">{e(d["sup"])}</td><td class="mut">{d["size"]}</td><td class="num mut">{(str(d["tray"])+"-cell") if d["tray"] else "—"}</td><td class="num mut">{d["pots"]:,}</td><td class="num">{d["plants"]:,}</td></tr>'
br_row=lambda d:f'<tr><td>{e(d["var"])}</td><td class="mut">{e(d["sup"])}</td><td class="mut">{d["size"]}</td><td class="num mut">wk {d["ship"]}</td><td class="num">{d["plants"]:,}</td></tr>'
U=sum(d['plants'] for d in sec['URC']); P=sum(d['plants'] for d in sec['PLUG']); B=sum(d['plants'] for d in sec['BAREROOT'])
POTS=sum(d['pots'] for k in sec for d in sec[k]); ugen=len({d['genus'] for d in sec['URC']}); pgen=len({d['genus'] for d in sec['PLUG']})
css=open(f'{S}/style.css').read()+timeline.CSS
lanes=timeline.lanes_from_rows(rows, move_out_wk=12)
tl_html=timeline.render(lanes)
page=f'''<title>Hoosier Boy Perennial Program</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;0,600;1,400&family=Geist:wght@300;400;500;600&display=swap">
<style>{css}</style>
<div class="page">
  <div class="eyebrow">Hoosier Boy · Indianapolis</div>
  <h1>Spring 2027 Perennial Program</h1>
  <p class="sub">House 13 · quart and 9" basket perennials · prepared September 2026</p>
  <p class="intro">This is what we plan to bring in for our House 13 perennial crop. Everything is planted the same week and finished the same way: potted in early January in a climate-controlled 3,000 sq. ft. range, then moved to a covered, ventilated outdoor space in late March with no temperature control beyond a little supplemental heat on cold nights. Cuttings arrive week 49 so they are rooted for the week 2 plant; plugs, liners and bare root arrive the week we pot.</p>

  {tl_html}

  <div class="figs">
    <div class="fig"><b>{U:,}</b><span>unrooted cuttings · {ugen} genera</span></div>
    <div class="fig"><b>{P:,}</b><span>plugs &amp; liners · {pgen} genera</span></div>
    <div class="fig"><b>{B:,}</b><span>bare root crowns</span></div>
    <div class="fig"><b>{POTS:,}</b><span>finished pots &amp; baskets</span></div>
  </div>

  <section>
    <h2>Unrooted cuttings</h2>
    <p class="lede">Stuck in 105-cell trays on arrival in December, rooted under mist, and potted to quarts week 2. One cutting per finished quart.</p>
    {table(sec['URC'],['Variety','Genetics','Size','Arrive','Cuttings'],urc_row)}
    <div class="total"><span>Cuttings <b>{U:,}</b></span><span>Quarts <b>{sum(d['pots'] for d in sec['URC']):,}</b></span></div>
  </section>

  <section>
    <h2>Plugs &amp; rooted liners</h2>
    <p class="lede">Arrive week 2 and go straight to the pot. Lavender baskets take three liners each; everything else is one plant per quart.</p>
    {table(sec['PLUG'],['Variety','Propagator','Size','Tray','Pots','Plants'],plug_row)}
    <div class="total"><span>Pots &amp; baskets <b>{sum(d['pots'] for d in sec['PLUG']):,}</b></span><span>Plants <b>{P:,}</b></span></div>
  </section>

  <section>
    <h2>Bare root</h2>
    <p class="lede">Potted directly on arrival week 2, one crown per quart.</p>
    {table(sec['BAREROOT'],['Variety','Source','Size','Arrive','Crowns'],br_row)}
    <div class="total"><span>Crowns <b>{B:,}</b></span></div>
  </section>

  <div class="notes">
    <p>Lavender is listed by type: (English) is Lavandula angustifolia, (Spanish) is Lavandula stoechas.</p>
    <p>Quantities are planning figures as of September 2026 and will be confirmed on purchase orders.</p>
  </div>

  <footer><span class="brand">Hoosier Boy</span><span>Spring 2027 · House 13 perennials · quarts and 9" baskets</span></footer>
</div>
'''
open(f'{S}/perennial-program.html','w').write(page); print(U,P,B,POTS,ugen,pgen)
# standalone copy for ops.hoosierboy.com/share/… (the artifact host adds its own skeleton; this one needs a full document)
if len(sys.argv) > 3:
    doc = ('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
           '<meta name="robots" content="noindex"><link rel="icon" href="/favicon.ico">' + page.split('</title>')[0] + '</title></head><body>' + page.split('</title>',1)[1] + '</body></html>')
    open(sys.argv[3],'w').write(doc)
