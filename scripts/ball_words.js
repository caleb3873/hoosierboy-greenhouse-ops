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
  Rd: "Red", Rn: "Rain", Frst: "Frost", Evergrn: "Evergreen", Strawb: "Strawberry",
  Choc: "Chocolate", Carml: "Caramel", Brt: "Bright", Gldn: "Golden", Snst: "Sunset",
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
  // deliberately NOT mapped (ambiguous — flag, don't guess): Str, Trst, Fnch
};
// CamelCase / known crop-echo lead tokens the price lists prepend
const BALL_ABBREV = new Set(["geris", "gerzon", "geriv", "petveg", "calib", "impng", "impaex", "verbeveg"]);
module.exports = { BALL_WORD, BALL_ABBREV };
