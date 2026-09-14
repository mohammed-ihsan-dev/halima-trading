import { Building2, Globe2, Handshake, ShieldCheck } from "lucide-react";

export const metadata = {
  title: "About Halima Trading L.L.C. | Abu Dhabi",
  description: "Established in 1991, Halima Trading L.L.C. is a trusted supplier of air conditioning systems, electronics, and home appliances in Abu Dhabi & UAE.",
  alternates: {
    canonical: "https://halimatrading.ae/about",
  },
};

export default function About() {
  return (
    <>
      <section className="page-hero">
        <span className="eyebrow light">Our company</span>
        <h1>Built on quality.<br />Driven by commitment.</h1>
      </section>
      <section className="story section">
        <div>
          <span className="eyebrow">Established in Abu Dhabi</span>
          <h2>More than three decades of dependable supply.</h2>
        </div>
        <div>
          <p>
            Established in 1991, Halima Trading L.L.C. is a leading supplier of premium air conditioning systems, electronics and home appliances in the UAE. With more than three decades of experience, the company serves retail, commercial, corporate, hospitality, contractor and government clients with reliable products and dedicated service.
          </p>
          <p>
            Our approach is straightforward: understand the requirement, recommend practical products and stay responsive through quotation, delivery and after-sales assistance.
          </p>
        </div>
      </section>
      <section className="stats">
        {[
          ["1991", "Established"],
          ["34+", "Years of excellence"],
          ["30+", "Trusted brands"],
          ["UAE-wide", "Product solutions"],
        ].map((x) => (
          <div key={x[0]}>
            <b>{x[0]}</b>
            <span>{x[1]}</span>
          </div>
        ))}
      </section>
      <section className="section">
        <div className="benefit-grid four">
          {[
            [Building2, "Commercial experience"],
            [Globe2, "UAE-wide reach"],
            [Handshake, "Long-term relationships"],
            [ShieldCheck, "Quality-led selection"],
          ].map(([Icon, title]: any) => (
            <div className="benefit" key={title}>
              <Icon />
              <h3>{title}</h3>
              <p>A supply partner focused on clarity, reliability and lasting value.</p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
