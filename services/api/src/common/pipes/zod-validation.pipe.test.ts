import { BadRequestException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ZodValidationPipe } from "./zod-validation.pipe";

describe("ZodValidationPipe", () => {
	const schema = z.object({
		name: z.string().min(1),
		age: z.number().positive(),
	});

	const pipe = new ZodValidationPipe(schema);

	it("should pass valid data through", () => {
		const input = { name: "Test", age: 25 };
		const result = pipe.transform(input);
		expect(result).toEqual(input);
	});

	it("should throw BadRequestException for invalid data", () => {
		expect(() => pipe.transform({ name: "", age: -1 })).toThrow(
			BadRequestException,
		);
	});

	it("should include validation details in error", () => {
		try {
			pipe.transform({ name: "" });
		} catch (error) {
			expect(error).toBeInstanceOf(BadRequestException);
			const response = (error as BadRequestException).getResponse() as Record<
				string,
				unknown
			>;
			expect(response).toHaveProperty("code", "VALIDATION_ERROR");
			expect(response).toHaveProperty("details");
		}
	});

	it("should handle non-object input", () => {
		expect(() => pipe.transform("not an object")).toThrow(BadRequestException);
	});

	it("should handle null input", () => {
		expect(() => pipe.transform(null)).toThrow(BadRequestException);
	});

	it("should strip extra fields (Zod default behavior)", () => {
		const result = pipe.transform({
			name: "Test",
			age: 25,
			extra: "field",
		});
		expect(result).toEqual({ name: "Test", age: 25 });
	});
});
