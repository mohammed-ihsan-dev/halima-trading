/**
 * Brands shown on the public /brands page, in the order of the company brochure.
 *
 * Kept apart from `data/brands.ts`, which is the admin/import preset list: changing that list changes how imported
 * brand names are canonicalised, so the showcase must not touch it.
 *
 * `logo` points to artwork cut from the existing brand strips (scripts/brands/extract-brand-logos.mjs). Brands without
 * an approved logo asset in the project have no `logo` and are shown as a name card until official artwork is supplied.
 * `slug` matches the products' `brandSlug` and the `brands` collection.
 */
export interface ShowcaseBrand {
  name: string;
  slug: string;
  logo?: string;
}

export const brandShowcase: ShowcaseBrand[] = [
  { name: "O General", slug: "o-general", logo: "/brands/logos/o-general.png" },
  { name: "Mitsubishi Electric", slug: "mitsubishi-electric", logo: "/brands/logos/mitsubishi-electric.png" },
  { name: "Carrier", slug: "carrier", logo: "/brands/logos/carrier.png" },
  { name: "Midea", slug: "midea", logo: "/brands/logos/midea.png" },
  { name: "Gree", slug: "gree", logo: "/brands/logos/gree.png" },
  { name: "LG", slug: "lg", logo: "/brands/logos/lg.png" },
  { name: "Samsung", slug: "samsung", logo: "/brands/logos/samsung.png" },
  { name: "Panasonic", slug: "panasonic", logo: "/brands/logos/panasonic.png" },
  { name: "Aftron", slug: "aftron" },
  { name: "Clivet", slug: "clivet" },
  { name: "Super General", slug: "super-general" },
  { name: "Westpoint", slug: "westpoint" },
  { name: "Haier", slug: "haier", logo: "/brands/logos/haier.png" },
  { name: "Blue Star", slug: "blue-star" },
  { name: "Krome", slug: "krome" },
  { name: "Toshiba", slug: "toshiba", logo: "/brands/logos/toshiba.png" },
  { name: "Hisense", slug: "hisense", logo: "/brands/logos/hisense.png" },
  { name: "Daewoo", slug: "daewoo" },
  { name: "TCL", slug: "tcl", logo: "/brands/logos/tcl.png" },
  { name: "Hitachi", slug: "hitachi", logo: "/brands/logos/hitachi.png" },
  { name: "Akai", slug: "akai", logo: "/brands/logos/akai.png" },
  { name: "Kenwood", slug: "kenwood", logo: "/brands/logos/kenwood.png" },
  { name: "Nikai", slug: "nikai", logo: "/brands/logos/nikai.png" },
  { name: "Khind", slug: "khind" },
  { name: "Yorker", slug: "yorker" },
  { name: "Afra", slug: "afra", logo: "/brands/logos/afra.png" },
  { name: "Simfer", slug: "simfer" },
  { name: "General Line", slug: "general-line" },
  { name: "Jetacool", slug: "jetacool" },
  { name: "Ferroli", slug: "ferroli" },
  { name: "Celsius", slug: "celsius" },
  { name: "Prestige", slug: "prestige", logo: "/brands/logos/prestige.png" },
  { name: "Symphony", slug: "symphony" },
];
