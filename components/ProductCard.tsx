"use client";
import Link from "next/link";
import {Eye,Heart,ShoppingBag,Snowflake} from "lucide-react";
import WhatsAppIcon from "./WhatsAppIcon";
import type{Product}from "@/data/products";
import{formatCurrency}from "@/lib/currency";
import{useCart}from "@/context/CartContext";

export default function ProductCard({product,featuredStyle=false}:{product:Product;featuredStyle?:boolean}){
  const{add}=useCart();
  if(featuredStyle)return <article className="feature-product-card">
    <div className="feature-brand"><b>{product.brand}</b><span className={product.inStock?"feature-stock":"feature-stock out"}>{product.inStock?"In Stock":"On Request"}</span></div>
    <Link className="feature-image" href={`/shop/${product.slug}`}><img src={product.images[0]} alt={product.name}/></Link>
    <div className="feature-card-body">
      <Link href={`/shop/${product.slug}`}><h3>{product.name}</h3></Link>
      <div className="feature-specs"><span><Snowflake/> {product.specifications.Capacity||product.subcategory}</span><span>▣ {product.subcategory}</span></div>
      <div className="feature-price">{formatCurrency(product.price)}</div>
      <div className="feature-actions">
        <button onClick={()=>add(product)}><ShoppingBag/> Add to Cart</button>
        <a href={`https://wa.me/971565685090?text=${encodeURIComponent(`Hello Halima Trading, I am interested in ${product.name}, model ${product.model}.`)}`}><WhatsAppIcon/><span>Order on<br/>WhatsApp</span></a>
        <Link href={`/shop/${product.slug}`}><Eye/><span>View<br/>Details</span></Link>
      </div>
    </div>
  </article>;
  return <article className="product-card"><div className="product-img"><img src={product.images[0]} alt={product.name}/><button aria-label="Add to wishlist"><Heart/></button><span className={product.inStock?"stock":"stock out"}>{product.inStock?"In stock":"On request"}</span></div><div className="product-info"><small>{product.brand} · {product.category}</small><Link href={`/shop/${product.slug}`}><h3>{product.name}</h3></Link><p className="model">Model {product.model}</p><p>{product.features.slice(0,2).join(" · ")}</p><div className="price">{formatCurrency(product.price)}</div><div className="product-actions"><button onClick={()=>add(product)}><ShoppingBag/> Add to cart</button><a href={`https://wa.me/971565685090?text=${encodeURIComponent(`Hello Halima Trading, I am interested in ${product.name}, model ${product.model}.`)}`} aria-label="Order on WhatsApp"><WhatsAppIcon/></a><Link href={`/shop/${product.slug}`} aria-label="Quick view"><Eye/></Link></div></div></article>
}
