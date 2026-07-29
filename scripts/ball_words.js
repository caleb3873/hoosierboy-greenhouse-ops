// Ball truncation dictionary — the ONE copy (Caleb 7/29: Heuchera "Kira Evergrn
// Forest" / "Prp Rn Frst" matched only 3 of 5 colors because the parse pipeline and
// the WebTrack importer each carried their own drifting word map). Both require this.
// Word-level expansions applied token-wise before keying:
const BALL_WORD = {
  SupCal: "Supercal", Sunpatns: "Sunpatiens", Bbycakes: "Babycakes", Sumr: "Summer",
  Ameth: "Amethyst", Ltl: "Little", Dbl: "Double", Drm: "Dream", Buttrmlk: "Buttermilk",
  Viol: "Violet", Ipd: "Improved", Angl: "Angel", Earrng: "Earrings", Vlvt: "Velvet",
  Wht: "White", Blk: "Black", Org: "Orange", Prpl: "Purple", Slmn: "Salmon", Yel: "Yellow",
  Tumblna: "Tumbelina", Grandaisy: "Grandaisy", Headlnr: "Headliner", Headlne: "Headliner",
  Elec: "Electric", Purp: "Purple", Prp: "Purple", Vn: "Vein", Grn: "Green", Bl: "Blue",
  Rd: "Red", Rn: "Rain", Frst: "Forest", Evergrn: "Evergreen", Strawb: "Strawberry",
  Choc: "Chocolate", Carml: "Caramel", Strwberry: "Strawberry", Brt: "Bright", Gldn: "Golden", Snst: "Sunset",
  Brst: "Burst", Lav: "Lavender", Mag: "Magenta",
  // 7/29 full-file audit of ball danziger.xlsx (vowel-less token sweep + near-miss keys):
  Cmp: "Compact", Pk: "Pink", Dk: "Dark", Dp: "Deep", Wh: "White", Yl: "Yellow",
  Lt: "Light", Ht: "Hot", Clrfl: "Colorful", Dnc: "Dance", Bcl: "Bicolor", Bcol: "Bicolor",
  Snny: "Sunny", Sprks: "Sparks", Chry: "Cherry", Pnk: "Pink", Cndy: "Candy", Twst: "Twist",
  Bty: "Beauty", Hrt: "Heart", Dyn: "Dynamic", Grp: "Grape", Spsh: "Splash", Snshn: "Sunshine",
  Bry: "Berry", Jwl: "Jewel", Lmn: "Lemon", Swft: "Swift", Lf: "Leaf", Pstl: "Pastel",
  Rsbry: "Raspberry", Brnz: "Bronze", Rsy: "Rosy", Rppl: "Ripple", Rple: "Ripple",
  Splsh: "Splash", Crm: "Cream", Midnght: "Midnight", Blkber: "Blackberry", Chsk: "Cheesecake",
  Calibskt: "Calibasket", Gull: "Gulliver", Blu: "Blue", Flos: "Floss",
  Pik: "Pink", Blackbrry: "Blackberry", Tcol: "Tricolor", Mac: "Maculata",
  Optiklav: "Optik Lavender", Optikgrp: "Optik Grape",
  // 7/29 GLOBAL audit (all 51k lines, near-miss verified — each entry has a paired
  // full-word key from another supplier):
  Amer: "American", Appl: "Apple", Arb: "Arbor", Arend: "Arendsii", Arkwr: "Arkwrightii",
  Atri: "Atriplicifolia", Atrip: "Atriplicifolia", Aur: "Auriculata", Axil: "Axillaris",
  Ban: "Bannaticus", Bor: "Boreale", Bouq: "Bouquet", Brad: "Bradburiana", Bskt: "Basket",
  Burg: "Burgundy", Byz: "Byzantina", Caly: "Calycinum", Carbo: "Carbon", Carnivl: "Carnival",
  Cascd: "Cascade", Caut: "Cauticola", Ccd: "Colorcoded", Chin: "Chinensis", Chrmg: "Charming",
  Cit: "Citriodorus", Clsc: "Classic", Cocc: "Coccineum", Colr: "Color", Comp: "Compact",
  Cord: "Cordifolia", Cov: "Cover", Cr: "Cream", Crmsn: "Crimson", Crsh: "Crush", Csm: "Crisp",
  Fashn: "Fashion", Flm: "Flame", Throwr: "Thrower", Flr: "Flair", Frt: "Fruit", Grpe: "Grape",
  Grl: "Girl", Lg: "Large", Mf: "Magic Fountains", Mga: "Mega", Mntn: "Mountain", Mx: "Mix",
  Pg: "Pacific Giant", Pls: "Plus", Pnch: "Punch", Ppprs: "Poppers", Rse: "Rose",
  Sgr: "Sugar", Sh: "Shades", Spr: "Spring", Sps: "Splash", Str: "Street", Swt: "Sweet",
  Vgrs: "Vigorous", Wdng: "Wedding", Wdngpty: "Wedding Party", Blch: "Blotch", Cntl: "Control",
  // deliberately NOT mapped (ambiguous — flag, don't guess): Trst, Fnch, Crlht, Crshr, Bt, Col
};
// case-insensitive index — files disagree on casing of the same truncation
const BALL_WORD_CI = {};
for (const k in BALL_WORD) BALL_WORD_CI[k.toLowerCase()] = BALL_WORD[k];
const expandWord = w => BALL_WORD[w] || BALL_WORD_CI[String(w).toLowerCase()] || w;
// CamelCase / known crop-echo lead tokens the price lists prepend
const BALL_ABBREV = new Set(["geris", "gerzon", "geriv", "petveg", "calib", "impng", "impaex", "verbeveg"]);
module.exports = { BALL_WORD, BALL_ABBREV, expandWord };
