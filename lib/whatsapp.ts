import type { CartLine } from "@/context/CartContext";
import type { Product } from "@/data/products";

const siteUrl=(process.env.NEXT_PUBLIC_SITE_URL||"https://halima-trading.pages.dev").replace(/\/$/,"");
const absoluteUrl=(path:string)=>path.startsWith("http")?path:`${siteUrl}${path}`;

export const productMessage=(product:Product,quantity=1)=>`Hello Halima Trading,

I would like to order this product:

Product: ${product.name}
Brand: ${product.brand}
Model: ${product.model}
Quantity: ${quantity}
Price: ${product.priceLabel}

Product image:
${absoluteUrl(product.images[0])}

Product details:
${siteUrl}/shop/${product.slug}

Please confirm availability, final price and delivery.`;

export const productWhatsAppUrl=(product:Product,quantity=1)=>`https://wa.me/971565685090?text=${encodeURIComponent(productMessage(product,quantity))}`;

export const cartMessage=(items:CartLine[])=>{const lines=items.map((x,i)=>`${i+1}. ${x.name}\nBrand: ${x.brand}\nModel: ${x.model}\nQuantity: ${x.quantity}\nPrice: ${x.price===null?"To be confirmed":`AED ${x.price.toLocaleString()}`}\nProduct image: ${absoluteUrl(x.images[0])}\nProduct details: ${siteUrl}/shop/${x.slug}`).join("\n\n");const total=items.reduce((s,x)=>s+(x.price||0)*x.quantity,0);return `Hello Halima Trading,\n\nI would like to place an order for the following products:\n\n${lines}\n\nTotal Items: ${items.reduce((s,x)=>s+x.quantity,0)}\nEstimated Total: AED ${total.toLocaleString()}\n\nCustomer Name:\nPhone Number:\nDelivery Location:\n\nPlease confirm availability and final price.`};
export const whatsappUrl=(items:CartLine[])=>`https://wa.me/971565685090?text=${encodeURIComponent(cartMessage(items))}`;
