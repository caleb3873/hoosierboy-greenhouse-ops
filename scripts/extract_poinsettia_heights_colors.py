import warnings, json, re; warnings.filterwarnings("ignore")
from numbers_parser import Document
doc = Document("/Users/caleb/Desktop/poinsettias 2025/2025 Poinsettias Growers Notes/2025 Poinsettias Growers Notes.numbers")
t = [s for s in doc.sheets if s.name=="Heights"][0].tables[0]
rows = t.rows()
hdr = [ (c.value if c else "") for c in rows[0] ]
wkcol = { i:("WK"+re.search(r"WK\s*(\d+)",str(h)).group(1)) for i,h in enumerate(hdr) if re.search(r"WK\s*(\d+)",str(h)) }

def rgb(c):
    st=getattr(c,"style",None); bg=getattr(st,"bg_color",None) if st else None
    return (bg.r,bg.g,bg.b) if bg else None

# build legend from col1 rows (colored text mentioning a chemical)
legend={}; legend_row_start=None
for ri,r in enumerate(rows):
    c1 = r[1] if len(r)>1 else None
    if c1 and isinstance(c1.value,str) and re.search(r"ppm|ccc|piccolo|fascinat|fasinat|b9|altercel",c1.value,re.I):
        col=rgb(c1)
        if col:
            legend[col]=re.sub(r"\s+"," ",c1.value.strip())
            legend_row_start = ri if legend_row_start is None else min(legend_row_start,ri)

def num(v):
    if v is None: return None
    if isinstance(v,(int,float)): return float(v)
    m=re.search(r"-?\d+(?:\.\d+)?",str(v));  return float(m.group()) if m else None

out={}; corrections=[]; flags=[]; loc=None
limit = legend_row_start if legend_row_start else len(rows)
for ri,r in enumerate(rows[1:limit],start=1):
    v = r[0].value if r[0] else None
    if not v or not isinstance(v,str): continue
    vs=v.strip()
    if re.search(r"(house|bluff|main|side|pad|range)",vs,re.I) and not re.search(r"\d",vs):
        loc=vs.rstrip(":"); continue
    heights={}; apps={}
    for i,c in enumerate(r):
        if i not in wkcol or c is None: continue
        wk=wkcol[i]; h=num(c.value); col=rgb(c)
        if h is not None:
            if h>40:
                if 3<=h/10<=40: corrections.append([vs,wk,h,h/10]); h=h/10
                else: flags.append([vs,wk,h]); h=None
            if h is not None: heights[wk]=h
        if col and col in legend: apps[wk]=legend[col]
    if heights or apps:
        out[vs]={"location":loc,"heights":heights,"applications":apps}

print(json.dumps({"legend":{",".join(map(str,k)):v for k,v in legend.items()},"varieties":out,"corrections":corrections,"flags":flags}))
