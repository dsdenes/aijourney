import { beforeEach, describe, expect, it } from "vitest";
import {
	getSources,
	getEnabledSources,
	addSource,
	removeSource,
	updateSource,
} from "./crawl-sources.js";

describe("Crawl Sources", () => {
	describe("getSources", () => {
		it("should return default sources including Simon Willison", () => {
			const sources = getSources();
			expect(sources.length).toBeGreaterThan(0);
			expect(sources.some((s) => s.id === "simonwillison")).toBe(true);
		});

		it("should return copies (not references to internal array)", () => {
			const a = getSources();
			const b = getSources();
			expect(a).not.toBe(b);
		});
	});

	describe("getEnabledSources", () => {
		it("should only return enabled sources", () => {
			const enabled = getEnabledSources();
			expect(enabled.every((s) => s.enabled)).toBe(true);
		});
	});

	describe("addSource", () => {
		it("should add a new source and return it with generated ID", () => {
			const source = addSource({
				url: "https://test.com/blog",
				name: "Test Blog",
				enabled: true,
				maxPages: 50,
			});

			expect(source.id).toBe("test-blog");
			expect(source.url).toBe("https://test.com/blog");
			expect(source.name).toBe("Test Blog");
			expect(source.addedAt).toBeDefined();
			expect(new Date(source.addedAt).toISOString()).toBe(source.addedAt);
		});

		it("should make the new source available in getSources", () => {
			const before = getSources().length;
			addSource({
				url: "https://added.com",
				name: "Added",
				enabled: true,
				maxPages: 10,
			});
			const after = getSources().length;
			expect(after).toBe(before + 1);
		});
	});

	describe("removeSource", () => {
		it("should remove a source by ID and return true", () => {
			addSource({
				url: "https://removable.com",
				name: "Removable Source",
				enabled: true,
				maxPages: 5,
			});

			const removed = removeSource("removable-source");
			expect(removed).toBe(true);
			expect(getSources().find((s) => s.id === "removable-source")).toBeUndefined();
		});

		it("should return false for non-existent ID", () => {
			const removed = removeSource("nonexistent-999");
			expect(removed).toBe(false);
		});
	});

	describe("updateSource", () => {
		it("should update source properties", () => {
			// Ensure simonwillison exists (default)
			const updated = updateSource("simonwillison", {
				maxPages: 200,
			});

			expect(updated).not.toBeNull();
			expect(updated!.maxPages).toBe(200);
			expect(updated!.id).toBe("simonwillison");
		});

		it("should return null for non-existent source", () => {
			const result = updateSource("no-such-source", { enabled: false });
			expect(result).toBeNull();
		});

		it("should toggle enabled flag", () => {
			const result = updateSource("simonwillison", { enabled: false });
			expect(result!.enabled).toBe(false);

			// Restore
			updateSource("simonwillison", { enabled: true });
		});
	});
});
