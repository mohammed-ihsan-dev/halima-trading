/**
 * Brands shown on the public /brands page, in the order of the company brochure (page 4 of
 * public/brochures/HALIMA_TRADING_UPDATED_.pdf).
 *
 * Kept apart from `data/brands.ts`, which is the admin/import preset list: changing that list changes how imported
 * brand names are canonicalised, so the showcase must not touch it.
 *
 * `logo`: official logo asset in public/brands/logos/ — source of each file in scripts/brands/brand-logo-sources.json,
 * built by scripts/brands/build-brand-logos.mjs. Brands without a verified official logo have no `logo` and are shown
 * as a name card until the client supplies the artwork.
 * `logoWidth`: display width in px (desktop) chosen so that every logo has about the same visual area whatever its
 * shape; the height follows from the file's own aspect ratio, so logos are never stretched.
 * `slug` matches the products' `brandSlug` and the `brands` collection.
 */
export interface ShowcaseBrand {
  name: string;
  slug: string;
  logo?: string;
  logoWidth?: number;
}

export const brandShowcase: ShowcaseBrand[] = [
  { name: "O General", slug: "o-general", logo: "/brands/logos/o-general.png", logoWidth: 210 },
  { name: "Mitsubishi Electric", slug: "mitsubishi-electric", logo: "/brands/logos/mitsubishi-electric.svg", logoWidth: 127 },
  { name: "Carrier", slug: "carrier", logo: "/brands/logos/carrier.png", logoWidth: 131 },
  { name: "Midea", slug: "midea", logo: "/brands/logos/midea.svg", logoWidth: 132 },
  { name: "Gree", slug: "gree", logo: "/brands/logos/gree.svg", logoWidth: 180 },
  { name: "LG", slug: "lg", logo: "/brands/logos/lg.svg", logoWidth: 124 },
  { name: "Samsung", slug: "samsung", logo: "/brands/logos/samsung.svg", logoWidth: 202 },
  { name: "Panasonic", slug: "panasonic", logo: "/brands/logos/panasonic.png", logoWidth: 210 },
  { name: "Aftron", slug: "aftron", logo: "/brands/logos/aftron.svg", logoWidth: 151 },
  { name: "Clivet", slug: "clivet", logo: "/brands/logos/clivet.svg", logoWidth: 165 },
  { name: "Super General", slug: "super-general", logo: "/brands/logos/super-general.png", logoWidth: 170 },
  { name: "Westpoint", slug: "westpoint", logo: "/brands/logos/westpoint.png", logoWidth: 139 },
  { name: "Haier", slug: "haier", logo: "/brands/logos/haier.svg", logoWidth: 146 },
  { name: "Blue Star", slug: "blue-star", logo: "/brands/logos/blue-star.png", logoWidth: 153 },
  { name: "Krome", slug: "krome", logo: "/brands/logos/krome.png", logoWidth: 210 },
  { name: "Toshiba", slug: "toshiba", logo: "/brands/logos/toshiba.svg", logoWidth: 202 },
  { name: "Hisense", slug: "hisense", logo: "/brands/logos/hisense.svg", logoWidth: 199 },
  { name: "Daewoo", slug: "daewoo", logo: "/brands/logos/daewoo.svg", logoWidth: 206 },
  { name: "TCL", slug: "tcl", logo: "/brands/logos/tcl.svg", logoWidth: 143 },
  { name: "Hitachi", slug: "hitachi", logo: "/brands/logos/hitachi.png", logoWidth: 199 },
  { name: "Akai", slug: "akai", logo: "/brands/logos/akai.png", logoWidth: 200 },
  { name: "Kenwood", slug: "kenwood", logo: "/brands/logos/kenwood.svg", logoWidth: 206 },
  { name: "Nikai", slug: "nikai", logo: "/brands/logos/nikai.svg", logoWidth: 202 },
  { name: "Khind", slug: "khind", logo: "/brands/logos/khind.png", logoWidth: 161 },
  { name: "Yorker", slug: "yorker", logo: "/brands/logos/yorker.png", logoWidth: 161 },
  { name: "Afra", slug: "afra", logo: "/brands/logos/afra.png", logoWidth: 130 },
  { name: "Simfer", slug: "simfer", logo: "/brands/logos/simfer.svg", logoWidth: 159 },
  { name: "General Line", slug: "general-line", logo: "/brands/logos/general-line.png", logoWidth: 155 },
  { name: "Jetacool", slug: "jetacool", logo: "/brands/logos/jetacool.png", logoWidth: 149 },
  { name: "Ferroli", slug: "ferroli", logo: "/brands/logos/ferroli.svg", logoWidth: 134 },
  { name: "Celsius", slug: "celsius", logo: "/brands/logos/celsius.png", logoWidth: 167 },
  { name: "Prestige", slug: "prestige", logo: "/brands/logos/prestige.png", logoWidth: 120 },
  { name: "Symphony", slug: "symphony", logo: "/brands/logos/symphony.png", logoWidth: 134 },
];
