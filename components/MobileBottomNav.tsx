"use client";

import Link from "next/link";
import {Home,ShoppingBag,Store} from "lucide-react";
import {useCart} from "@/context/CartContext";
import WhatsAppIcon from "./WhatsAppIcon";

export default function MobileBottomNav(){
  const{count,setOpen}=useCart();
  return <nav className="mobile-bottom-nav" aria-label="Mobile quick navigation">
    <Link href="/"><Home/><span>Home</span></Link>
    <Link href="/shop"><Store/><span>Shop</span></Link>
    <a className="mobile-wa" href="https://wa.me/971565685090" aria-label="WhatsApp"><WhatsAppIcon/><span>WhatsApp</span></a>
    <button onClick={()=>setOpen(true)} aria-label={`Cart with ${count} items`}><ShoppingBag/><span>Cart</span>{count>0&&<i>{count}</i>}</button>
  </nav>;
}
