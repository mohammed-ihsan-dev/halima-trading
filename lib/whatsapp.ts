import type { CartLine } from "@/context/CartContext";
import type { Product } from "@/data/products";

const siteUrl=(process.env.NEXT_PUBLIC_SITE_URL||"https://halima-trading.pages.dev").replace(/\/$/,"");
const absoluteUrl=(path:string)=>path.startsWith("http")?path:`${siteUrl}${path}`;

export const productMessage=(product:Product,quantity=1)=>`Hello Halima Trading,

🛒 *PRODUCT ORDER*
━━━━━━━━━━━━━━━━━━
📦 *${product.name}*

🏷️ Brand: ${product.brand}
🔢 Model: ${product.model}
🔢 Quantity: ${quantity}
💰 Price: ${product.priceLabel}
✅ Availability: ${product.inStock?"In Stock":"On Request"}
━━━━━━━━━━━━━━━━━━

🖼️ *PRODUCT IMAGE*
${absoluteUrl(product.images[0])}

🔗 *VIEW PRODUCT BOX*
${siteUrl}/shop/${product.slug}

Please confirm availability, final price and delivery.`;

export const productWhatsAppUrl=(product:Product,quantity=1)=>`https://wa.me/971565685090?text=${encodeURIComponent(productMessage(product,quantity))}`;

export const cartMessage=(items:CartLine[])=>{const lines=items.map((x,i)=>`📦 *PRODUCT ${i+1}*
━━━━━━━━━━━━━━━━━━
*${x.name}*
🏷️ Brand: ${x.brand}
🔢 Model: ${x.model}
🔢 Quantity: ${x.quantity}
💰 Price: ${x.price===null?"To be confirmed":`AED ${x.price.toLocaleString()}`}
🖼️ Image: ${absoluteUrl(x.images[0])}
🔗 Product box: ${siteUrl}/shop/${x.slug}
━━━━━━━━━━━━━━━━━━`).join("\n\n");const total=items.reduce((s,x)=>s+(x.price||0)*x.quantity,0);return `Hello Halima Trading,

🛒 *SHOPPING CART ORDER*

${lines}

📊 *ORDER SUMMARY*
Total Items: ${items.reduce((s,x)=>s+x.quantity,0)}
Estimated Total: AED ${total.toLocaleString()}

Customer Name:
Phone Number:
Delivery Location:

Please confirm availability, final price and delivery.`};
export const whatsappUrl=(items:CartLine[])=>`https://wa.me/971565685090?text=${encodeURIComponent(cartMessage(items))}`;
