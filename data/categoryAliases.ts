/**
 * Category names used by supplier catalogues, mapped to the store category they are
 * genuinely equivalent to. Importers save the store category and show the mapping
 * as a warning; nothing is mapped silently.
 *
 * Deliberately NOT mapped:
 * - "Fans": in the supplier catalogue this group contains split ACs and gas cookers
 *   rather than fans, so no whole-group mapping is accurate. Each record needs its
 *   own category.
 * - "Commercial Refrigeration": the group mixes commercial freezers with washing
 *   machines and dryers, so mapping it to Commercial Cooling would misfile them.
 */
export const categoryAliases: Record<string, string> = {
  "Air Conditioners": "Air Conditioning",
  "Refrigerators & Freezers": "Refrigeration",
  "Washing Machines": "Laundry Appliances",
  "Washer Dryers": "Laundry Appliances",
  "Dryers": "Laundry Appliances",
  // "Ranges, ovens, hoods and microwaves" — the store's own definition of the category.
  "Cookers & Ovens": "Cooking Appliances",
  "Microwave Ovens": "Cooking Appliances",
  // "Cooking, dishwashing and countertop essentials."
  "Dishwashers": "Kitchen Appliances",
  // Multi-tap drinking-water coolers and tank chillers; the store already lists
  // commercial water coolers under Commercial Cooling.
  "Water Coolers & Chillers": "Commercial Cooling",
  "Air Coolers": "Air Coolers & Fans",
};
