/**
 * Default format configs for Express Seed supplier tabs.
 * Derived from analyzing Foliage Availability_3_30_26.xlsm.
 *
 * Each key = exact tab name (without date suffix).
 * These are applied as defaults when a new supplier is created.
 */

export const EXPRESS_SEED_DEFAULTS = {
  "AG 2": {
    headerRow: 1,
    dataStartRow: 2,
    plantCol: 0,
    weekType: "simple_qty",
    weekStartCol: 1,
    twoColumnLayout: true,
    rightPlantCol: 2,
    rightQtyCol: 3,
  },
  "AgriStarts": {
    headerRow: 1,
    dataStartRow: 2,
    plantCol: 0,
    varietyCol: 1,
    weekType: "text",
    weekStartCol: 2,
  },
  "ARC": {
    headerRow: 3,
    dataStartRow: 4,
    plantCol: 0,
    varietyCol: 1,
    weekType: "weekly",
    weekStartCol: 3,
    weekEndCol: 9,
  },
  "Brighten": {
    headerRow: 2,
    dataStartRow: 3,
    plantCol: 0,
    productIdCol: 1,
    weekType: "weekly",
    weekStartCol: 2,
  },
  "Cacti Young Plants": {
    headerRow: 2,
    dataStartRow: 3,
    locationCol: 0,
    plantCol: 1,
    weekType: "monthly",
    weekStartCol: 2,
  },
  "Casa Flora": {
    headerRow: 4,
    dataStartRow: 5,
    plantCol: 0,
    commonNameCol: 1,
    sizeCol: 2,
    weekType: "weekly",
    weekStartCol: 3,
  },
  "Danziger": {
    headerRow: 1,
    dataStartRow: 2,
    plantCol: 0,
    varietyCol: 1,
    formCol: 2,
    weekType: "weekly",
    weekStartCol: 3,
  },
  "Harold Walters": {
    headerRow: 1,
    dataStartRow: 2,
    plantCol: 0,
    sizeCol: 1,
    weekType: "buckets",
    weekStartCol: 2,
  },
  "Inversiones": {
    headerRow: 1,
    dataStartRow: 2,
    plantCol: 0,
    varietyCol: 1,
    sizeCol: 2,
    formCol: 3,
    weekType: "weekly",
    weekStartCol: 4,
  },
  "Knox": {
    headerRow: 1,
    dataStartRow: 3,
    plantCol: 0,
    weekType: "weekly",
    weekStartCol: 1,
  },
  "LinersUnlimited": {
    headerRow: 1,
    dataStartRow: 2,
    plantCol: 0,
    sizeCol: 1,
    weekType: "weekly",
    weekStartCol: 2,
  },
  "Moss Hill": {
    headerRow: 1,
    dataStartRow: 2,
    plantCol: 0,
    commonNameCol: 1,
    sizeCol: 2,
    weekType: "weekly",
    weekStartCol: 4,
    weekEndCol: 12,
    commentsCol: 12,
  },
  "Pinnacle": {
    headerRow: 1,
    dataStartRow: 2,
    plantCol: 0,
    weekType: "monthly",
    weekStartCol: 1,
  },
  "Pinnacle Mexico": {
    headerRow: 2,
    dataStartRow: 3,
    plantCol: 0,
    weekType: "weekly",
    weekStartCol: 1,
  },
  "Pinnacle Shanghai": {
    headerRow: 1,
    dataStartRow: 2,
    plantCol: 0,
    weekType: "monthly",
    weekStartCol: 1,
  },
  "Plant Investment": {
    headerRow: 1,
    dataStartRow: 2,
    plantCol: 0,
    weekType: "simple_qty",
    weekStartCol: 1,
  },
  "Succulents Unlimited": {
    headerRow: 2,
    dataStartRow: 3,
    plantCol: 0,
    weekType: "weekly",
    weekStartCol: 1,
  },
  "Van Wingerden": {
    headerRow: 1,
    dataStartRow: 2,
    sizeCol: 0,
    plantCol: 1,
    weekType: "simple_qty",
    weekStartCol: 4,
  },
};

/**
 * Match a tab name from an uploaded file to a known supplier config.
 * Tab names include date suffixes like "AgriStarts Mar 30" — we strip those.
 */
export function matchSupplierConfig(tabName) {
  const cleaned = tabName
    .replace(/\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+\d{1,2}$/i, "")
    .replace(/\s+March\s+\d{1,2}$/i, "")
    .trim();

  if (EXPRESS_SEED_DEFAULTS[cleaned]) {
    return { key: cleaned, config: EXPRESS_SEED_DEFAULTS[cleaned] };
  }

  for (const [key, config] of Object.entries(EXPRESS_SEED_DEFAULTS)) {
    if (cleaned.toLowerCase().startsWith(key.toLowerCase())) {
      return { key, config };
    }
  }

  return null;
}
