# Halima Trading L.L.C. — Enterprise Web Platform & Admin Management

A high-performance, responsive e-commerce catalogue, quotation workflow, and administrative management portal for **Halima Trading L.L.C.** (Abu Dhabi, UAE).

- **GitHub Repository**: [https://github.com/mohammed-ihsan-dev/halima-trading.git](https://github.com/mohammed-ihsan-dev/halima-trading.git)
- **Live Tech Stack**: Next.js 16 (App Router) + React 19 + Node.js + MongoDB Atlas + Stripe + Tailwind CSS

---

## 🌟 Key Architecture & Features

### 1. Hybrid Rendering & Core Web Vitals
- **Server Components & ISR**: Fast initial load with 1-hour Incremental Static Regeneration (`revalidate = 3600`) for public pages (`/`, `/shop`, `/shop/[slug]`, `/categories`, `/brands`).
- **On-Demand Cache Invalidation**: Admin mutations (`POST`, `PUT`, `DELETE` in `/api/admin/products`) automatically invoke `revalidatePath` to refresh public pages instantly.
- **Zero Stale Flash**: Single source of truth powered exclusively by MongoDB Atlas (`halima` database).

### 2. Full SEO Infrastructure
- Dynamic Next.js Metadata API (`title`, `description`, OpenGraph, Twitter card, canonical URLs).
- Injected JSON-LD schemas: `schema.org/Product`, `schema.org/BreadcrumbList`, and `schema.org/LocalBusiness`.
- Dynamic `sitemap.xml` listing all live MongoDB Atlas product URLs and categories.
- `robots.txt` allowing public indexing while blocking `/admin/` and `/api/admin/`.

### 3. Administrative Portal (`/admin`)
- Secure HttpOnly session cookie authentication (`/api/admin/login`, `/api/admin/session`).
- Full CRUD operations for Products (`/admin/products`), Orders (`/admin/orders`), Users (`/admin/users`), and Payments (`/admin/payments`).
- Sticky Admin Header & Glassmorphic Dashboard UI.

---

## 🚀 Local Development Setup

1. **Clone the Repository**:
   ```bash
   git clone https://github.com/mohammed-ihsan-dev/halima-trading.git
   cd halima-trading
   ```

2. **Install Dependencies**:
   ```bash
   npm install
   ```

3. **Configure Environment Variables**:
   Copy `.env.example` to `.env.local` and add your MongoDB Atlas URI:
   ```env
   MONGODB_URI="mongodb+srv://<username>:<password>@cluster.mongodb.net/halima?retryWrites=true&w=majority"
   MONGODB_DB="halima"
   ADMIN_SESSION_SECRET="your-secure-admin-session-secret-2026"
   ```

4. **Run Development Server**:
   ```bash
   npm run dev
   ```
   Open `http://localhost:3000` in your browser.

---

## ⚡ Deployment to Vercel

1. **Push to GitHub**:
   Ensure changes are pushed to `main` branch on `https://github.com/mohammed-ihsan-dev/halima-trading.git`.

2. **Import Project in Vercel**:
   - Go to [Vercel Dashboard](https://vercel.com/new).
   - Select `mohammed-ihsan-dev/halima-trading`.
   - Framework Preset: **Next.js**.

3. **Set Environment Variables in Vercel**:
   Add the following in **Project Settings -> Environment Variables**:
   - `MONGODB_URI`: Your MongoDB Atlas connection string.
   - `MONGODB_DB`: `halima`
   - `ADMIN_SESSION_SECRET`: Random 32+ character secret string.
   - `NEXT_PUBLIC_APP_URL`: Your deployed Vercel URL (e.g. `https://halima-trading-demo.vercel.app`).

4. **MongoDB Atlas Network Access**:
   Ensure MongoDB Atlas **Network Access (IP Access List)** includes `0.0.0.0/0` (Allow Access from Anywhere) so Vercel dynamic serverless functions can connect to MongoDB.

5. **Deploy**:
   Click **Deploy**. Next.js automatic deployment will complete in ~1-2 minutes.
