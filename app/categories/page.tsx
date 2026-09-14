import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { categories } from "@/data/categories";
import { getMongoProducts } from "@/lib/repositories/products";

export const revalidate = 3600; // 1 hour ISR

export const metadata = {
  title: "Product Categories | Electronics & Home Appliances",
  description: "Browse cooling, refrigeration, laundry, kitchen, and home appliance categories from Halima Trading L.L.C.",
  alternates: {
    canonical: "https://halimatrading.ae/categories",
  },
};

export default async function Categories() {
  const products = await getMongoProducts();

  return (
    <>
      <section className="page-hero">
        <span className="eyebrow light">Browse by requirement</span>
        <h1>Product categories.</h1>
        <p>From everyday essentials to project-scale cooling, discover the right solution.</p>
      </section>
      <section className="section">
        <div className="category-grid large-grid">
          {categories.map((c, i) => {
            const countToDisplay = products.filter(
              (p) => p.category.toLowerCase() === c.name.toLowerCase()
            ).length;

            return (
              <Link className="category-card" href={`/shop?category=${c.name}`} key={c.name}>
                <span className="cat-num">0{i + 1}</span>
                <div className="cat-icon">{c.icon}</div>
                <h3>{c.name}</h3>
                <p>{c.description}</p>
                <span>
                  {countToDisplay} products <ArrowRight />
                </span>
              </Link>
            );
          })}
        </div>
      </section>
    </>
  );
}

