import { getMongoDb } from "@/lib/mongodb";
import crypto from "crypto";

export interface MongoUserDoc {
  _id?: any;
  id: string;
  name: string;
  email: string;
  phone: string;
  company?: string;
  passwordHash?: string;
  salt?: string;
  role: "super_admin" | "admin" | "customer";
  status: "ACTIVE" | "SUSPENDED" | "DELETED";
  createdAt: Date;
  updatedAt: Date;
}

export type SafeUser = Omit<MongoUserDoc, "passwordHash" | "salt" | "_id">;

export function hashPassword(password: string, salt?: string): { hash: string; salt: string } {
  const actualSalt = salt || crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(password, actualSalt, 1000, 64, "sha512").toString("hex");
  return { hash, salt: actualSalt };
}

export function verifyPassword(password: string, salt: string, hash: string): boolean {
  const calculatedHash = crypto.pbkdf2Sync(password, salt, 1000, 64, "sha512").toString("hex");
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(calculatedHash, "hex"));
}

function formatUser(doc: any): SafeUser {
  if (!doc) return doc;
  const { _id, passwordHash, salt, ...rest } = doc;
  return {
    ...rest,
    id: rest.id || String(_id),
    name: rest.name || "User",
    email: rest.email || "",
    phone: rest.phone || "",
    company: rest.company || "Individual",
    role: rest.role || "customer",
    status: rest.status || "ACTIVE",
    createdAt: rest.createdAt ? new Date(rest.createdAt) : new Date(),
    updatedAt: rest.updatedAt ? new Date(rest.updatedAt) : new Date(),
  };
}

const initialSeedUsers = [
  { id: "u-admin", name: "Halima Admin", email: "admin@halimatrading.com", phone: "+971 50 000 0000", company: "Halima Trading L.L.C.", role: "super_admin" as const, status: "ACTIVE" as const, rawPassword: "HalimaAdmin2026!" },
  { id: "u-1", name: "Ahmed Khan", email: "ahmed@example.com", phone: "+971 50 123 4567", company: "Al Serkal Group", role: "customer" as const, status: "ACTIVE" as const, rawPassword: "UserPass123!" },
  { id: "u-2", name: "Sara Ali", email: "sara@example.com", phone: "+971 55 987 6543", company: "Individual", role: "customer" as const, status: "ACTIVE" as const, rawPassword: "UserPass123!" },
  { id: "u-3", name: "Mohammad Faisal", email: "faisal@example.com", phone: "+971 56 234 5678", company: "Mahnoush Group", role: "customer" as const, status: "SUSPENDED" as const, rawPassword: "UserPass123!" },
  { id: "u-4", name: "Rashid K", email: "rashid@example.com", phone: "+971 52 345 6789", company: "Rashid Contracting", role: "customer" as const, status: "ACTIVE" as const, rawPassword: "UserPass123!" },
  { id: "u-5", name: "Hina Sultana", email: "hina@example.com", phone: "+971 58 456 7890", company: "Dubai Properties", role: "customer" as const, status: "DELETED" as const, rawPassword: "UserPass123!" },
  { id: "u-6", name: "Abdul Rahman", email: "rahman@example.com", phone: "+971 50 567 8901", company: "Emirates Group", role: "customer" as const, status: "ACTIVE" as const, rawPassword: "UserPass123!" },
];

export async function ensureUsersSeeded(): Promise<void> {
  try {
    const db = await getMongoDb();
    const count = await db.collection("users").countDocuments();
    if (count === 0) {
      await db.collection("users").createIndex({ email: 1 }, { unique: true });
      await db.collection("users").createIndex({ status: 1 });
      await db.collection("users").createIndex({ role: 1 });
      await db.collection("users").createIndex({ createdAt: -1 });

      const docs = initialSeedUsers.map((u) => {
        const { hash, salt } = hashPassword(u.rawPassword);
        return {
          id: u.id,
          name: u.name,
          email: u.email.toLowerCase().trim(),
          phone: u.phone,
          company: u.company,
          passwordHash: hash,
          salt: salt,
          role: u.role,
          status: u.status,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      });

      await db.collection("users").insertMany(docs);
      console.log("Seeded initial MongoDB users collection successfully.");
    }
  } catch (error) {
    console.error("Error seeding users collection:", error);
  }
}

export async function getMongoUsers(includeDeleted = false): Promise<SafeUser[]> {
  try {
    await ensureUsersSeeded();
    const db = await getMongoDb();
    const filter = includeDeleted ? {} : { status: { $ne: "DELETED" } };
    const docs = await db.collection("users").find(filter).sort({ createdAt: -1 }).toArray();
    return docs.map(formatUser);
  } catch (error) {
    console.error("Error fetching users from MongoDB:", error);
    return [];
  }
}

export async function getMongoUserById(id: string): Promise<SafeUser | null> {
  try {
    await ensureUsersSeeded();
    const db = await getMongoDb();
    const doc = await db.collection("users").findOne({
      $or: [{ id }, { email: id.toLowerCase().trim() }],
    });
    return doc ? formatUser(doc) : null;
  } catch (error) {
    console.error(`Error fetching user (${id}) from MongoDB:`, error);
    return null;
  }
}

export async function getMongoUserRawByEmail(email: string): Promise<MongoUserDoc | null> {
  try {
    await ensureUsersSeeded();
    const db = await getMongoDb();
    const doc = await db.collection("users").findOne({ email: email.toLowerCase().trim() });
    return doc as MongoUserDoc | null;
  } catch (error) {
    console.error(`Error fetching raw user (${email}) from MongoDB:`, error);
    return null;
  }
}

export async function createMongoUser(data: Partial<MongoUserDoc> & { password?: string }): Promise<SafeUser> {
  await ensureUsersSeeded();
  const db = await getMongoDb();
  const email = (data.email || "").toLowerCase().trim();
  if (!email) throw new Error("Email is required for creating a user.");

  const existing = await db.collection("users").findOne({ email });
  if (existing) throw new Error("User with this email already exists.");

  const id = data.id || `u-${Date.now()}`;
  const password = data.password || "UserPass123!";
  const { hash, salt } = hashPassword(password);

  const doc: MongoUserDoc = {
    id,
    name: data.name || "User",
    email,
    phone: data.phone || "",
    company: data.company || "Individual",
    passwordHash: hash,
    salt,
    role: data.role || "customer",
    status: data.status || "ACTIVE",
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  await db.collection("users").insertOne(doc);
  return formatUser(doc);
}

export async function updateMongoUser(id: string, updates: Partial<MongoUserDoc>): Promise<SafeUser | null> {
  try {
    const db = await getMongoDb();
    const existing = await db.collection("users").findOne({ $or: [{ id }, { email: id.toLowerCase().trim() }] });
    if (!existing) return null;

    const setFields: Record<string, any> = {
      ...updates,
      updatedAt: new Date(),
    };
    delete setFields._id;
    delete setFields.id;

    if (updates.email) setFields.email = updates.email.toLowerCase().trim();

    await db.collection("users").updateOne({ _id: existing._id }, { $set: setFields });
    const updated = await db.collection("users").findOne({ _id: existing._id });
    return updated ? formatUser(updated) : null;
  } catch (error) {
    console.error(`Error updating user (${id}):`, error);
    return null;
  }
}

export async function suspendMongoUser(id: string): Promise<boolean> {
  const result = await updateMongoUser(id, { status: "SUSPENDED" });
  return result !== null;
}

export async function softDeleteMongoUser(id: string): Promise<boolean> {
  const result = await updateMongoUser(id, { status: "DELETED" });
  return result !== null;
}
