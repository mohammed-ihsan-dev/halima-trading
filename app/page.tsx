import Link from "next/link";
import { ArrowRight, Building2, CheckCircle2, Headphones, ShieldCheck, Truck } from "lucide-react";
import { getMongoFeaturedProducts } from "@/lib/repositories/products";
import ProductCard from "@/components/ProductCard";
import BrandCarousel from "@/components/BrandCarousel";
import CategorySolutionsSection from "@/components/CategorySolutionsSection";
import WhatsAppIcon from "@/components/WhatsAppIcon";

export const revalidate = 3600; // 1 hour ISR

export default async function Home() {
  const products = await getMongoFeaturedProducts();

  return (
    <>
      <section className="hero" id="hero">
        <div className="hero-copy">
          <span className="eyebrow">Abu Dhabi · Serving the UAE since 1991</span>
          <h1>Premium appliances.<br/><em>Trusted solutions.</em></h1>
          <p>Reliable air conditioning, refrigeration, laundry, kitchen and home appliance solutions from trusted global brands.</p>
          <div className="actions">
            <Link className="btn primary" href="/shop">Shop products <ArrowRight size={18}/></Link>
            <Link className="btn secondary" href="/quote">Request a quote</Link>
            <a className="text-link" href="https://wa.me/971565685090?text=Hello%20Halima%20Trading%2C%20I%20would%20like%20help%20choosing%20an%20appliance."><WhatsAppIcon/>Order on WhatsApp</a>
          </div>
          <div className="trust-row">
            <span><b>1991</b> Established</span><span><b>34+</b> Years of excellence</span><span><b>30+</b> Trusted brands</span>
          </div>
        </div>
        <div className="hero-visual" aria-label="Premium home appliances">
          <div className="glow"/>
          <video
            className="hero-main hero-video"
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
            poster="https://images.unsplash.com/photo-1571175443880-49e1d25b2bc5?auto=format&fit=crop&w=900&q=85"
            aria-label="Halima Trading premium appliance showcase"
          >
            <source src="/videos/halima-hero-new.mp4" type="video/mp4" />
            Your browser does not support embedded video.
          </video>

          <div className="floating-card top"><span>Commercial & residential</span><b>Cooling solutions</b></div>
          <div className="floating-card bottom"><CheckCircle2 size={19}/><span><b>In stock</b><small>UAE-wide delivery</small></span></div>
        </div>
      </section>

      <CategorySolutionsSection />

      <section className="section featured-showcase">
        <div className="featured-heading">
          <span className="featured-pill">☆ Featured products</span>
          <h2>Featured <em>Appliances</em></h2>
          <p>Explore reliable cooling, laundry, kitchen and home solutions from trusted global brands.</p>
        </div>
        <div className="featured-grid">{products.filter(p=>p.featured).map(p=><ProductCard product={p} featuredStyle key={p.id}/>)}</div>
        <Link className="featured-all" href="/shop">Explore all products <ArrowRight size={17}/></Link>
      </section>

      <section className="solutions section">
        <div className="solution-copy"><span className="eyebrow">One trusted supply partner</span><h2>Complete appliance solutions for every requirement</h2><p>From a single home appliance to a complete hospitality or government project, our experienced team helps source reliable products that fit your technical requirements, timeline and budget.</p><Link className="btn primary" href="/corporate-solutions">Explore corporate solutions <ArrowRight size={18}/></Link></div>
        <div className="solution-list">
          {["Air conditioning solutions","Commercial refrigeration","Laundry solutions","Kitchen appliances","Home & small appliances"].map((x,i)=><div key={x}><span>0{i+1}</span><b>{x}</b><ArrowRight size={18}/></div>)}
        </div>
      </section>

      <BrandCarousel/>

      <section className="about-band">
        <div><span className="eyebrow light">Our story</span><h2>Built on quality.<br/>Driven by commitment.</h2></div>
        <div><p>Established in 1991, Halima Trading L.L.C. is a leading supplier of premium air conditioning systems, electronics and home appliances in the UAE. We serve retail, commercial, corporate, hospitality, contractor and government clients with reliable products and dedicated service.</p><Link href="/about">Learn about Halima Trading <ArrowRight size={17}/></Link></div>
      </section>

      <section className="section">
        <div className="section-head"><div><span className="eyebrow">Why Halima</span><h2>Confidence with every order</h2></div></div>
        <div className="benefit-grid">
          {[[ShieldCheck,"34+ years of experience"],[CheckCircle2,"Premium global brands"],[Building2,"Corporate & bulk supply"],[Truck,"Reliable UAE delivery"],[Headphones,"Dedicated after-sales support"]].map(([Icon,label]:any)=><div className="benefit" key={label}><Icon/><b>{label}</b><p>Professional guidance and responsive support from enquiry to delivery.</p></div>)}
        </div>
      </section>

      <section className="cta-band"><div><span className="eyebrow light">Need help choosing?</span><h2>Let’s find the right solution.</h2></div><div className="actions"><Link className="btn white" href="/quote">Request a quotation</Link><a className="btn outline-white" href="tel:+971565685090">Call +971 56 568 5090</a></div></section>
    </>
  );
}
