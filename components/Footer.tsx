import Link from "next/link";
import {AtSign,Globe,Mail,MapPin,Phone,Share2} from "lucide-react";

export default function Footer(){
  return <footer>
    <div className="footer-grid">
      <div>
        <Link href="/#hero" className="official-logo footer-official-logo" aria-label="Return to homepage hero">
          <img src="/halima-contact-logo.png" alt="Halima Trading L.L.C. — Since 1991"/>
        </Link>
        <p>Premium electronics, air conditioning and home appliances for homes, businesses and projects across the UAE.</p>
        <div className="socials"><a href="#"><AtSign/></a><a href="#"><Globe/></a><a href="#"><Share2/></a></div>
      </div>
      <div><h4>Products</h4>{["Air Conditioning","Refrigeration","Laundry","Kitchen Appliances","Televisions"].map(x=><Link href="/shop" key={x}>{x}</Link>)}</div>
      <div><h4>Company</h4>{["About","Corporate Solutions","Request a Quote","Contact","Shopping Cart"].map(x=><Link href={"/"+x.toLowerCase().replaceAll(" ","-")} key={x}>{x}</Link>)}</div>
      <div>
        <h4>Visit & contact</h4>
        <p><MapPin/> Al Hamra Plaza Hotel Building, Electra Street, Abu Dhabi</p>
        <a href="tel:+971565685090"><Phone/> +971 56 568 5090</a>
        <a href="mailto:Halimatradingest@gmail.com"><Mail/> Halimatradingest@gmail.com</a>
        <form><input aria-label="Email for newsletter" placeholder="Your email address"/><button>Join</button></form>
      </div>
    </div>
    <div className="footer-bottom"><span>© 2026 Halima Trading L.L.C. All Rights Reserved.</span><span>Serving Abu Dhabi and the UAE since 1991.</span></div>
  </footer>;
}
