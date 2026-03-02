import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		globals: true,
		root: "./",
		include: ["src/**/*.test.ts"],
	},
	plugins: [
		// SWC to handle NestJS decorators (emitDecoratorMetadata)
		// Must use ESM output for vitest compatibility
		swc.vite({
			module: { type: "es6" },
			jsc: {
				target: "es2022",
				parser: {
					syntax: "typescript",
					decorators: true,
				},
				transform: {
					decoratorMetadata: true,
					legacyDecorator: true,
				},
			},
		}),
	],
});
