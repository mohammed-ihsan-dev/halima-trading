import { getMongoDb } from "@/lib/mongodb";
import { categories as staticCategories } from "@/data/categories";

export interface MongoCategoryDoc {
  _id?: any;
  id: string;
  slug: string;
  name: string;
  description?: string;
  icon?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

function slugify(text: string): string {
  return text.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export async function ensureCategoriesSeeded(): Promise<void> {
  try {
    const db = await getMongoDb();
    const count = await db.collection("categories").countDocuments();
    if (count === 0) {
      await db.collection("categories").createIndex({ slug: 1 }, { unique: true });
      const docs = staticCategories.map((c) => ({
        id: `cat-${slugify(c.name)}`,
        slug: slugify(c.name),
        name: c.name,
        description: c.description,
        icon: c.icon,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));
      await db.collection("categories").insertMany(docs);
      console.log("Seeded MongoDB categories collection.");
    }
  } catch (error) {
    console.error("Error seeding categories collection:", error);
  }
}

export async function getMongoCategories(): Promise<MongoCategoryDoc[]> {
  try {
    await ensureCategoriesSeeded();
    const db = await getMongoDb();
    const docs = await db.collection("categories").find({}).sort({ name: 1 }).toArray();
    return docs.map((doc: any) => ({
      id: doc.id || String(doc._id),
      slug: doc.slug || slugify(doc.name),
      name: doc.name,
      description: doc.description || "",
      icon: doc.icon || "◇",
    }));
  } catch (error) {
    console.error("Error fetching categories from MongoDB:", error);
    return staticCategories.map((c) => ({
      id: `cat-${slugify(c.name)}`,
      slug: slugify(c.name),
      name: c.name,
      description: c.description,
      icon: c.icon,
    }));
  }
}
