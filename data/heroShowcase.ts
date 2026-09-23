export type HeroShowcaseItem = {
  id: string;
  /** Category name shown in the floating indicator card while this product is on stage. */
  cardLabel: string;
  /** 900px-wide WebP used from tablet up. */
  image: string;
  /** 520px-wide WebP used on phones. */
  imageSmall: string;
  width: number;
  height: number;
  alt: string;
  /** Optical balance factor — a wide TV and a tall fridge should not read as the same mass. */
  scale: number;
};

/**
 * Hero product rotation. Sourced from the same brand photography the category
 * cards use (public/images/categories), trimmed and re-encoded to WebP under
 * public/images/hero by scripts/build-hero-assets.mjs.
 */
export const heroShowcase: HeroShowcaseItem[] = [
  {
    id: "televisions",
    cardLabel: "Display & entertainment",
    image: "/images/hero/tv.webp",
    imageSmall: "/images/hero/tv-sm.webp",
    width: 900,
    height: 764,
    alt: "Premium flat-screen television",
    scale: 1,
  },
  {
    id: "air-conditioning",
    cardLabel: "Cooling solutions",
    image: "/images/hero/air-conditioning.webp",
    imageSmall: "/images/hero/air-conditioning-sm.webp",
    width: 900,
    height: 793,
    alt: "Split air conditioner indoor unit with outdoor condenser",
    scale: 0.96,
  },
  {
    id: "refrigeration",
    cardLabel: "Refrigeration systems",
    image: "/images/hero/refrigeration.webp",
    imageSmall: "/images/hero/refrigeration-sm.webp",
    width: 900,
    height: 867,
    alt: "Four-door refrigerator beside a glass-door commercial chiller",
    scale: 0.94,
  },
  {
    id: "laundry",
    cardLabel: "Laundry solutions",
    image: "/images/hero/laundry.webp",
    imageSmall: "/images/hero/laundry-sm.webp",
    width: 900,
    height: 703,
    alt: "Front-load washing machine beside a twin-tub washer",
    scale: 1,
  },
  {
    id: "kitchen",
    cardLabel: "Kitchen appliances",
    image: "/images/hero/kitchen.webp",
    imageSmall: "/images/hero/kitchen-sm.webp",
    width: 900,
    height: 740,
    alt: "Gas cooking range, microwave oven and countertop blender",
    scale: 0.97,
  },
];

/** Time each product holds the stage, in milliseconds. */
export const HERO_HOLD_MS = 4200;
/** Crossfade length between two products, in seconds. */
export const HERO_FADE_S = 1.15;
