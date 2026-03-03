import { type Db, MongoClient } from "mongodb";

let client: MongoClient | null = null;
let db: Db | null = null;

export async function initDb(): Promise<Db> {
	if (db) return db;
	const uri = process.env.MONGODB_URI || "mongodb://localhost:27017";
	client = new MongoClient(uri);
	await client.connect();
	db = client.db("aijourney");
	console.log("[kb-builder] MongoDB connected");
	return db;
}

export function getDb(): Db {
	if (!db) throw new Error("MongoDB not initialized. Call initDb() first.");
	return db;
}

export async function closeDb(): Promise<void> {
	if (client) {
		await client.close();
		client = null;
		db = null;
	}
}
