import { getMongoDb } from "@/lib/mongodb";
import { brands as staticBrands } from "@/data/brands";

export interface MongoBrandDoc {
  _id?: any;
  id: string;
  slug: string;
  name: string;
  logo?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

function slugify(text: string): string {
  return text.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export async function ensureBrandsSeeded(): Promise<void> {
  try {
    const db = await getMongoDb();
    const count = await db.collection("brands").countDocuments();
    if (count === 0) {
      await db.collection("brands").createIndex({ slug: 1 }, { unique: true });
      const docs = staticBrands.map((b) => ({
        id: `brand-${slugify(b)}`,
        slug: slugify(b),
        name: b,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));
      await db.collection("brands").insertMany(docs);
      console.log("Seeded MongoDB brands collection.");
    }
  } catch (error) {
    console.error("Error seeding brands collection:", error);
  }
}

export async function getMongoBrands(): Promise<MongoBrandDoc[]> {
  try {
    await ensureBrandsSeeded();
    const db = await getMongoDb();
    const docs = await db.collection("brands").find({}).sort({ name: 1 }).toArray();
    return docs.map((doc: any) => ({
      id: doc.id || String(doc._id),
      slug: doc.slug || slugify(doc.name),
      name: doc.name,
      logo: doc.logo || "",
    }));
  } catch (error) {
    console.error("Error fetching brands from MongoDB:", error);
    return staticBrands.map((b) => ({
      id: `brand-${slugify(b)}`,
      slug: slugify(b),
      name: b,
    }));
  }
}
