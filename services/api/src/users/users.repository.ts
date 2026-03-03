import type { User } from "@aijourney/shared";
import type { Db } from "mongodb";
import { Inject, Injectable } from "@nestjs/common";
import { MONGODB_DB } from "../mongodb/mongodb.module";

interface UserDoc {
	_id: string;
	[key: string]: unknown;
}

function toDoc(user: User): UserDoc {
	const { id, ...rest } = user;
	return { _id: id, ...rest } as UserDoc;
}

function fromDoc(doc: UserDoc): User {
	const { _id, ...rest } = doc;
	return { id: _id, ...rest } as User;
}

@Injectable()
export class UsersRepository {
	private readonly col;

	constructor(@Inject(MONGODB_DB) db: Db) {
		this.col = db.collection<UserDoc>("users");
	}

	async create(user: User): Promise<User> {
		await this.col.insertOne(toDoc(user));
		return user;
	}

	async getById(id: string): Promise<User | undefined> {
		const doc = await this.col.findOne({ _id: id });
		return doc ? fromDoc(doc) : undefined;
	}

	async getByEmail(email: string): Promise<User | undefined> {
		const doc = await this.col.findOne({ email });
		return doc ? fromDoc(doc as UserDoc) : undefined;
	}

	async update(id: string, updates: Partial<User>): Promise<void> {
		const { id: _id, ...rest } = updates;
		if (Object.keys(rest).length === 0) return;
		await this.col.updateOne({ _id: id }, { $set: rest });
	}

	async listAll(limit = 50): Promise<User[]> {
		const docs = await this.col.find({}).limit(limit).toArray();
		return docs.map((d) => fromDoc(d));
	}
}
