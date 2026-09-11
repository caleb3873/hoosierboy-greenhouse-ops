"""Series → (breeder, vigor) for the vegetative calibrachoa / verbena / petunia programs.
Vigor as the breeders rate them: compact (pots, no space), medium (4.5"–6", baskets with company),
vigorous (baskets/combos, spreads). Used by the plan-review sheet builder. Edit here, not in the DB."""
SERIES = {
 # ── CALIBRACHOA ──
 "Calibrachoa": {
  "Conga":("Ball FloraPlant","compact"), "Cabaret":("Ball FloraPlant","medium"), "Bumble Bee":("Ball FloraPlant","medium"), "Cha-Cha":("Ball FloraPlant","vigorous"),
  "MiniFamous Uno":("Selecta","compact"), "MiniFamous Neo":("Selecta","medium"), "MiniFamous Evo":("Selecta","vigorous"),
  "Aloha Nani":("Dümmen","compact"), "TikTok":("Dümmen","compact"), "Aloha Kona":("Dümmen","medium"), "Rainbow":("Dümmen","medium"), "Aloha":("Dümmen","vigorous"), "Bloomtastic":("Dümmen","vigorous"), "Volcano":("Dümmen","vigorous"),
  "Colibri":("Danziger","compact"), "Calitastic":("Danziger","medium"), "Lia":("Danziger","medium"), "Candy Shop":("Danziger","medium"), "Ombre":("Danziger","medium"), "Calibasket":("Danziger","vigorous"), "Caliloco":("Danziger","vigorous"),
 },
 # ── VERBENA ──
 "Verbena": {
  "Cadet Upright":("Ball FloraPlant","compact"), "Firehouse":("Ball FloraPlant","medium"), "Endurascape":("Ball FloraPlant","vigorous"), "Burgundy Wink":("Ball FloraPlant","medium"),
  "Blues":("Selecta","compact"), "Beats":("Selecta","medium"), "Lascar":("Selecta","vigorous"),
  "Empress Sun":("Dümmen","compact"), "Wicked":("Dümmen","medium"), "Empress Flair":("Dümmen","vigorous"), "Homestead":("Dümmen","vigorous"),
  "Vanessa Compact":("Danziger","compact"), "Vanessa":("Danziger","medium"), "Estrella":("Danziger","vigorous"),
 },
 # ── PETUNIA ──
 "Petunia": {
  "Surshot":("Ball FloraPlant","compact"), "Cannonball":("Ball FloraPlant","medium"), "Double Vogue":("Ball FloraPlant","medium"), "Jewel":("Ball FloraPlant","medium"), "Colorrush":("Ball FloraPlant","vigorous"), "Slingshot":("Ball FloraPlant","vigorous"), "Bee's Knees":("Ball FloraPlant","vigorous"), "Newbee":("Ball FloraPlant","vigorous"), "Pinkceptional":("Ball FloraPlant","vigorous"), "Bluerific":("Ball FloraPlant","vigorous"),
  "Starlet":("Selecta","compact"), "Headliner":("Selecta","medium"), "Sweet Sunshine":("Selecta","medium"), "Main Stage":("Selecta","vigorous"),
  "Potunia Piccola":("Dümmen","compact"), "Potunia Plus":("Dümmen","compact"), "Sweetunia":("Dümmen","medium"), "Origami":("Dümmen","medium"), "Surprise":("Dümmen","vigorous"), "Durabloom":("Dümmen","vigorous"),
  "Littletunia":("Danziger","compact"), "Bubbles":("Danziger","compact"), "Capella":("Danziger","medium"), "Designer":("Danziger","medium"), "Ovation":("Danziger","medium"), "Pizzazz":("Danziger","medium"), "Presto":("Danziger","medium"), "Inferno":("Danziger","medium"), "Flower Shower":("Danziger","vigorous"), "Cascadias":("Danziger","vigorous"), "Amazonas":("Danziger","vigorous"), "Red Carpet":("Danziger","vigorous"), "Nimbus":("Danziger","vigorous"), "Pink Cloud":("Danziger","vigorous"), "Blue Diamond":("Danziger","vigorous"),
  "Crazytunia":("Westhoff","medium"), "Amore":("Westhoff","medium"), "Splash Dance":("Westhoff","vigorous"),
  "Tea Upright":("Beekenkamp","compact"), "Ray":("Beekenkamp","medium"), "Tea":("Beekenkamp","vigorous"),
 },
}
VIGOR_ORDER = ["compact", "medium", "vigorous"]
VIGOR_LABEL = {"compact": "Compact — pots, no spacing", "medium": "Medium — 4.5\" to 6\", baskets with company", "vigorous": "Vigorous — baskets and combos, spreads"}
