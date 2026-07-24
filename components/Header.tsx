"use client";

import Link from "next/link";
import {Menu,Search,ShoppingBag,X} from "lucide-react";
import {useState} from "react";
import {useCart} from "@/context/CartContext";
import CartDrawer from "./CartDrawer";
import WhatsAppIcon from "./WhatsAppIcon";

const navItems=["Home","Shop","Categories","Brands","About","Corporate Solutions","Contact"];
const navHref=(item:string)=>item==="Home"?"/#hero":"/"+item.toLowerCase().replaceAll(" ","-");

export default function Header(){
  const[menu,setMenu]=useState(false);
  const{count,setOpen}=useCart();
  return <>
    <div className="announcement">
      <span>Premium Electronics & Home Appliances Across the UAE</span>
      <a href="tel:+971565685090">Call: +971 56 568 5090</a>
      <span className="announce-alt">Bulk Orders, Corporate Supply & Hospitality Solutions Available</span>
    </div>
    <header>
      <Link href="/#hero" className="official-logo" aria-label="Return to homepage hero">
        <img src="/halima-trading-logo-transparent.png" alt="Halima Trading L.L.C. — Since 1991"/>
      </Link>
      <nav>{navItems.map(item=><Link key={item} href={navHref(item)}>{item}</Link>)}</nav>
      <div className="header-actions">
        <Link href="/shop" aria-label="Search"><Search/></Link>
        <button onClick={()=>setOpen(true)} aria-label={`Cart with ${count} items`}><ShoppingBag/><i>{count}</i></button>
        <a className="btn primary compact" href="https://wa.me/971565685090"><WhatsAppIcon/>Order on WhatsApp</a>
        <button className="menu-btn" onClick={()=>setMenu(true)} aria-label="Open menu"><Menu/></button>
      </div>
    </header>
    {menu&&<div className="mobile-menu">
      <button onClick={()=>setMenu(false)} aria-label="Close menu"><X/></button>
      <Link href="/#hero" className="official-logo menu-official-logo" onClick={()=>setMenu(false)} aria-label="Return to homepage hero">
        <img src="/halima-trading-logo-transparent.png" alt="Halima Trading L.L.C. — Since 1991"/>
      </Link>
      {navItems.map(item=><Link onClick={()=>setMenu(false)} key={item} href={navHref(item)}>{item}</Link>)}
      <a className="btn primary" href="https://wa.me/971565685090"><WhatsAppIcon/>Order on WhatsApp</a>
    </div>}
    <CartDrawer/>
  </>;
}
