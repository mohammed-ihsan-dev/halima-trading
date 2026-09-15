import { MongoClient, Db } from "mongodb";

declare global {
  // eslint-disable-next-line no-var
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

export function isMongoConfigured(): boolean {
  return Boolean(process.env.MONGODB_URI && process.env.MONGODB_URI.trim().length > 0);
}

export function getMongoClientPromise(): Promise<MongoClient> {
  const uri = process.env.MONGODB_URI;
  if (!uri || !uri.trim()) {
    return Promise.reject(new Error("MONGODB_URI environment variable is not configured."));
  }

  // Reuse MongoClient connection promise across warm lambdas in both dev and prod
  if (!global._mongoClientPromise) {
    const client = new MongoClient(uri, {
      maxPoolSize: 10,
      minPoolSize: 2,
      maxIdleTimeMS: 30000,
    });
    global._mongoClientPromise = client.connect();
  }
  return global._mongoClientPromise;
}

export async function getMongoClient(): Promise<MongoClient> {
  return await getMongoClientPromise();
}

export async function getMongoDb(overrideDbName?: string): Promise<Db> {
  const mongoClient = await getMongoClient();
  const dbName = overrideDbName || process.env.MONGODB_DB || "halima";
  return mongoClient.db(dbName);
}

let indexesEnsured = false;

export async function ensureMongoIndexes(): Promise<void> {
  if (indexesEnsured) return;
  try {
    const db = await getMongoDb();
    
    // Create product collection indexes safely
    const indexConfigs = [
      { key: { slug: 1 }, options: { unique: true, background: true } },
      { key: { sku: 1 }, options: { unique: true, background: true } },
      { key: { category: 1 }, options: { background: true } },
      { key: { categorySlug: 1 }, options: { background: true } },
      { key: { brand: 1 }, options: { background: true } },
      { key: { featured: 1 }, options: { background: true } },
      { key: { status: 1 }, options: { background: true } },
      { key: { createdAt: -1 }, options: { background: true } },
    ];

    for (const { key, options } of indexConfigs) {
      try {
        await db.collection("products").createIndex(key as any, options as any);
      } catch (err) {
        // Ignore duplicate spec conflict if index already exists
      }
    }

    indexesEnsured = true;
  } catch (err) {
    // Silent fallback
  }
}

/**
 * Server-side read-only test function to verify MongoDB connection.
 * Does NOT modify any data. Performs an admin ping command.
 */
export async function testMongoConnection(): Promise<{
  success: boolean;
  message: string;
  databaseName?: string;
  pingOk?: boolean;
}> {
  try {
    if (!isMongoConfigured()) {
      return {
        success: false,
        message: "MONGODB_URI environment variable is not defined in environment.",
      };
    }

    const db = await getMongoDb();
    const pingResult = await db.command({ ping: 1 });

    if (pingResult && pingResult.ok === 1) {
      return {
        success: true,
        message: "Successfully connected to MongoDB Atlas!",
        databaseName: db.databaseName,
        pingOk: true,
      };
    } else {
      return {
        success: false,
        message: "Ping command completed but return status was not ok.",
      };
    }
  } catch (error: unknown) {
    const errMessage = error instanceof Error ? error.message : "Failed to connect to MongoDB Atlas.";
    return {
      success: false,
      message: errMessage,
    };
  }
}



