import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { log, getLogBuffer, clearLogBuffer } from "./log-stream.js";

describe("Log Stream", () => {
	beforeEach(() => {
		clearLogBuffer();
	});

	describe("log", () => {
		it("should add entries to the buffer", () => {
			log("info", "test message", { key: "value" });

			const buffer = getLogBuffer();
			expect(buffer).toHaveLength(1);
			expect(buffer[0]).toMatchObject({
				level: "info",
				message: "test message",
				data: { key: "value" },
			});
		});

		it("should add ISO timestamp to log entries", () => {
			log("info", "ts test");

			const entry = getLogBuffer()[0];
			expect(entry.timestamp).toBeDefined();
			const d = new Date(entry.timestamp);
			expect(d.toISOString()).toBe(entry.timestamp);
		});

		it("should support all log levels", () => {
			log("info", "info msg");
			log("warn", "warn msg");
			log("error", "error msg");
			log("debug", "debug msg");

			const levels = getLogBuffer().map((e) => e.level);
			expect(levels).toEqual(["info", "warn", "error", "debug"]);
		});

		it("should handle undefined data", () => {
			log("info", "no data");

			const entry = getLogBuffer()[0];
			expect(entry.data).toBeUndefined();
		});

		it("should cap buffer at MAX_BUFFER and discard old entries", () => {
			// Pre-fill with exactly 500 entries
			for (let i = 0; i < 500; i++) {
				log("info", `entry-${i}`);
			}
			expect(getLogBuffer()).toHaveLength(500);

			// Adding one more should evict the oldest
			log("info", "overflow-entry");
			const buffer = getLogBuffer();
			expect(buffer).toHaveLength(500);
			expect(buffer[0].message).toBe("entry-1"); // entry-0 evicted
			expect(buffer[499].message).toBe("overflow-entry");
		});
	});

	describe("getLogBuffer", () => {
		it("should return a copy (not the internal array)", () => {
			log("info", "test");
			const a = getLogBuffer();
			const b = getLogBuffer();
			expect(a).not.toBe(b);
			expect(a).toEqual(b);
		});
	});

	describe("clearLogBuffer", () => {
		it("should empty the buffer", () => {
			log("info", "entry 1");
			log("info", "entry 2");
			expect(getLogBuffer()).toHaveLength(2);

			clearLogBuffer();
			expect(getLogBuffer()).toHaveLength(0);
		});
	});
});
