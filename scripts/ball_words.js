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
};
// CamelCase / known crop-echo lead tokens the price lists prepend
const BALL_ABBREV = new Set(["geris", "gerzon", "geriv", "petveg", "calib", "impng", "impaex", "verbeveg"]);
module.exports = { BALL_WORD, BALL_ABBREV };
