import type {
	CreateRunRequestInput,
	RunRequest,
	RunStatus,
} from "@aijourney/shared";
import {
	DEFAULT_BUDGETS,
	generateId,
	isValidTransition,
	nowISO,
	RUN_TRANSITIONS,
} from "@aijourney/shared";
import {
	BadRequestException,
	Inject,
	Injectable,
	Logger,
	NotFoundException,
} from "@nestjs/common";
import { RunsRepository } from "./runs.repository";

@Injectable()
export class RunsService {
	private readonly logger = new Logger(RunsService.name);

	constructor(@Inject(RunsRepository) private readonly repo: RunsRepository) {}

	async create(
		userId: string,
		input: CreateRunRequestInput,
	): Promise<RunRequest> {
		const now = nowISO();
		const defaults = DEFAULT_BUDGETS[input.purpose];
		const budget = input.budget || defaults;

		// Auto-approve for user-initiated chat runs
		const autoApprove = ["kb_chat", "personalization"].includes(input.purpose);

		const run: RunRequest = {
			id: generateId(),
			userId,
			purpose: input.purpose,
			status: autoApprove ? "APPROVED" : "PENDING",
			inputs: input.inputs,
			budget,
			approval: {
				requiredApproval: !autoApprove,
				autoApproved: autoApprove,
				...(autoApprove && { approvedAt: now }),
			},
			createdAt: now,
			updatedAt: now,
		};

		await this.repo.create(run);
		this.logger.log(
			`Run ${run.id} created (${run.purpose}) status=${run.status}`,
		);
		return run;
	}

	async getById(id: string): Promise<RunRequest> {
		const run = await this.repo.getById(id);
		if (!run) throw new NotFoundException(`Run ${id} not found`);
		return run;
	}

	async listByUser(userId: string): Promise<RunRequest[]> {
		return this.repo.listByUser(userId);
	}

	async transition(
		id: string,
		toStatus: RunStatus,
		extra: Record<string, unknown> = {},
	): Promise<RunRequest> {
		const run = await this.getById(id);

		if (!isValidTransition(RUN_TRANSITIONS, run.status, toStatus)) {
			throw new BadRequestException(
				`Cannot transition from ${run.status} to ${toStatus}`,
			);
		}

		await this.repo.updateStatus(id, toStatus, extra);
		this.logger.log(`Run ${id}: ${run.status} → ${toStatus}`);
		return this.getById(id);
	}

	async approve(id: string, approvedBy: string): Promise<RunRequest> {
		return this.transition(id, "APPROVED", {
			"approval.approvedBy": approvedBy,
			"approval.approvedAt": nowISO(),
		});
	}

	async reject(id: string): Promise<RunRequest> {
		return this.transition(id, "REJECTED");
	}

	async cancel(id: string, cancelledBy: string): Promise<RunRequest> {
		const run = await this.getById(id);
		const toStatus: RunStatus =
			run.status === "RUNNING" ? "CANCEL_REQUESTED" : "CANCELLED";
		return this.transition(id, toStatus, {
			cancelledBy,
			cancelledAt: nowISO(),
		});
	}

	async listAll(): Promise<RunRequest[]> {
		return this.repo.listAll();
	}
}
