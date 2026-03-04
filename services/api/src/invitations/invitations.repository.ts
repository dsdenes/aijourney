import type { Invitation, InvitationStatus, OrgRole } from "@aijourney/shared";
import { Inject, Injectable } from "@nestjs/common";
import type { Db } from "mongodb";
import { MONGODB_DB } from "../mongodb/mongodb.module";

interface InvitationDoc {
	_id: string;
	[key: string]: unknown;
}

function toDoc(inv: Invitation): InvitationDoc {
	const { id, ...rest } = inv;
	return { _id: id, ...rest } as InvitationDoc;
}

function fromDoc(doc: InvitationDoc): Invitation {
	const { _id, ...rest } = doc;
	return { id: _id, ...rest } as Invitation;
}

@Injectable()
export class InvitationsRepository {
	private readonly col;

	constructor(@Inject(MONGODB_DB) db: Db) {
		this.col = db.collection<InvitationDoc>("invitations");
	}

	async create(invitation: Invitation): Promise<Invitation> {
		await this.col.insertOne(toDoc(invitation));
		return invitation;
	}

	async getById(id: string): Promise<Invitation | undefined> {
		const doc = await this.col.findOne({ _id: id });
		return doc ? fromDoc(doc) : undefined;
	}

	async getByToken(token: string): Promise<Invitation | undefined> {
		const doc = await this.col.findOne({ token });
		return doc ? fromDoc(doc as InvitationDoc) : undefined;
	}

	async getByEmail(email: string): Promise<Invitation[]> {
		const docs = await this.col
			.find({ email: email.toLowerCase(), status: "pending" })
			.sort({ createdAt: -1 })
			.toArray();
		return docs.map(fromDoc);
	}

	async getByTenant(tenantId: string): Promise<Invitation[]> {
		const docs = await this.col
			.find({ tenantId })
			.sort({ createdAt: -1 })
			.toArray();
		return docs.map(fromDoc);
	}

	async updateStatus(
		id: string,
		status: InvitationStatus,
		extra: Record<string, unknown> = {},
	): Promise<void> {
		await this.col.updateOne(
			{ _id: id },
			{ $set: { status, ...extra } },
		);
	}

	async deleteExpired(): Promise<number> {
		const result = await this.col.deleteMany({
			status: "pending",
			expiresAt: { $lt: new Date().toISOString() },
		});
		return result.deletedCount;
	}

	async countPendingByTenant(tenantId: string): Promise<number> {
		return this.col.countDocuments({ tenantId, status: "pending" });
	}

	async getByEmailAndTenant(
		email: string,
		tenantId: string,
	): Promise<Invitation | undefined> {
		const doc = await this.col.findOne({
			email: email.toLowerCase(),
			tenantId,
			status: "pending",
		});
		return doc ? fromDoc(doc as InvitationDoc) : undefined;
	}
}
