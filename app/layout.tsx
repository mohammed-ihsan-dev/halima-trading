import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { CartProvider } from "@/context/CartContext";
import FloatingContacts from "@/components/FloatingContacts";
import ScrollAnimations from "@/components/ScrollAnimations";

const manrope = Manrope({variable:"--font-manrope",subsets:["latin"]});
export const metadata: Metadata = {
  metadataBase:new URL("https://halima-trading.pages.dev"),
  title:{default:"Halima Trading L.L.C. | Electronics & Home Appliances Abu Dhabi",template:"%s | Halima Trading"},
  description:"Shop air conditioners, refrigerators, washing machines, kitchen appliances and electronics from trusted global brands. Serving Abu Dhabi and the UAE since 1991.",
  icons:{icon:"/favicon.svg"},
  openGraph:{title:"Halima Trading L.L.C.",description:"Premium appliances and trusted solutions across the UAE.",type:"website",images:[{url:"/og.png",width:1200,height:630,alt:"Halima Trading premium appliances"}]},
  twitter:{card:"summary_large_image",title:"Halima Trading L.L.C.",description:"Premium Appliances. Trusted Solutions.",images:["/og.png"]}
};

export default function RootLayout({children}:{children:React.ReactNode}) {
  return <html lang="en"><body className={manrope.variable}><CartProvider><Header/><main>{children}</main><Footer/><FloatingContacts/><ScrollAnimations/></CartProvider>
  <script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify({"@context":"https://schema.org","@type":"LocalBusiness","name":"Halima Trading L.L.C.","foundingDate":"1991","telephone":"+971 56 568 5090","email":"Halimatradingest@gmail.com","address":{"@type":"PostalAddress","streetAddress":"Al Hamra Plaza Hotel Building, Electra Street","addressLocality":"Abu Dhabi","addressCountry":"AE"}})}}/></body></html>
}
