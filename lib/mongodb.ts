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

  if (process.env.NODE_ENV === "development") {
    if (!global._mongoClientPromise) {
      const client = new MongoClient(uri, {});
      global._mongoClientPromise = client.connect();
    }
    return global._mongoClientPromise;
  }

  const client = new MongoClient(uri, {});
  return client.connect();
}

export async function getMongoClient(): Promise<MongoClient> {
  return await getMongoClientPromise();
}

export async function getMongoDb(overrideDbName?: string): Promise<Db> {
  const mongoClient = await getMongoClient();
  const dbName = overrideDbName || process.env.MONGODB_DB || "halima";
  return mongoClient.db(dbName);
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


