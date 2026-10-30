import { brandShowcase } from "@/data/brand-showcase";
import { companyContact } from "@/lib/company-config";

export const revalidate = 3600; // 1 hour ISR

export const metadata = {
  title: "Trusted Global Appliance Brands",
  description: "Explore leading electronics, air conditioning, and home appliance brands available at Halima Trading L.L.C.",
  alternates: {
    canonical: `${companyContact.siteUrl}/brands`,
  },
};

export default function Brands() {
  return (
    <>
      <section className="page-hero">
        <span className="eyebrow light">Global product choice</span>
        <h1>Brands customers know.</h1>
        <p>Explore a broad selection from established international manufacturers.</p>
      </section>
      <section className="section">
        <ul className="brand-wall" aria-label={`${brandShowcase.length} brands`}>
          {brandShowcase.map((brand) => (
            <li key={brand.slug} className={brand.logo ? "brand-card" : "brand-card is-name"}>
              {brand.logo ? (
                <img src={brand.logo} alt={`${brand.name} logo`} loading="lazy" decoding="async" />
              ) : (
                <span>{brand.name}</span>
              )}
            </li>
          ))}
        </ul>
        <p className="disclaimer">
          Brand availability varies by model and project. Halima Trading does not claim authorised distributor status unless separately confirmed in writing.
        </p>
      </section>
    </>
  );
}
