import { brands } from "@/data/brands";

export const revalidate = 3600; // 1 hour ISR

export const metadata = {
  title: "Trusted Global Appliance Brands",
  description: "Explore leading electronics, air conditioning, and home appliance brands available at Halima Trading L.L.C.",
  alternates: {
    canonical: "https://halimatrading.ae/brands",
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
        <div className="brand-wall">
          {brands.map((x) => (
            <div key={x}>{x}</div>
          ))}
        </div>
        <p className="disclaimer">
          Brand availability varies by model and project. Halima Trading does not claim authorised distributor status unless separately confirmed in writing.
        </p>
      </section>
    </>
  );
}
