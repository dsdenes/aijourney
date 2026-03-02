import {
	BadRequestException,
	Injectable,
	type PipeTransform,
} from "@nestjs/common";
import { ZodError, type ZodSchema } from "zod";

@Injectable()
export class ZodValidationPipe implements PipeTransform {
	constructor(private schema: ZodSchema) {}

	transform(value: unknown) {
		try {
			return this.schema.parse(value);
		} catch (error) {
			if (error instanceof ZodError) {
				throw new BadRequestException({
					code: "VALIDATION_ERROR",
					message: "Validation failed",
					details: error.errors,
				});
			}
			throw error;
		}
	}
}
