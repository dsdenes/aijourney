import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "./app.js";

let server: http.Server;
let baseUrl: string;

function request(
	method: string,
	path: string,
	body?: unknown,
): Promise<{ status: number; body: Record<string, unknown> | unknown[] }> {
	return new Promise((resolve, reject) => {
		const url = new URL(path, baseUrl);
		const opts: http.RequestOptions = {
			method,
			hostname: url.hostname,
			port: url.port,
			path: url.pathname,
			headers: { "Content-Type": "application/json" },
		};

		const req = http.request(opts, (res) => {
			let data = "";
			res.on("data", (chunk) => (data += chunk));
			res.on("end", () => {
				try {
					resolve({
						status: res.statusCode!,
						body: JSON.parse(data),
					});
				} catch {
					resolve({ status: res.statusCode!, body: {} });
				}
			});
		});

		req.on("error", reject);

		if (body) {
			req.write(JSON.stringify(body));
		}
		req.end();
	});
}

beforeAll(
	() =>
		new Promise<void>((resolve) => {
			server = app.listen(0, () => {
				const addr = server.address() as AddressInfo;
				baseUrl = `http://localhost:${addr.port}`;
				resolve();
			});
		}),
);

afterAll(
	() =>
		new Promise<void>((resolve) => {
			server.close(() => resolve());
		}),
);

describe("KB Builder - Health endpoint", () => {
	it("GET /health should return ok status", async () => {
		const res = await request("GET", "/health");

		expect(res.status).toBe(200);
		expect(res.body.status).toBe("ok");
		expect(res.body.pipeline).toBe("idle");
		expect(res.body.timestamp).toBeDefined();
	});

	it("should return valid ISO timestamp", async () => {
		const res = await request("GET", "/health");

		const date = new Date(res.body.timestamp as string);
		expect(date.toISOString()).toBe(res.body.timestamp);
	});
});

describe("KB Builder - Status endpoint", () => {
	it("GET /status should return crawl and pipeline progress", async () => {
		const res = await request("GET", "/status");

		expect(res.status).toBe(200);
		const body = res.body as Record<string, unknown>;
		expect(body.crawl).toBeDefined();
		expect(body.pipeline).toBeDefined();
		expect(body.totalArticlesStored).toBeDefined();
		expect(body.totalSummaries).toBeDefined();
	});
});

describe("KB Builder - Sources endpoint", () => {
	it("GET /sources should return default sources", async () => {
		const res = await request("GET", "/sources");

		expect(res.status).toBe(200);
		const body = res.body as Record<string, unknown>;
		expect(Array.isArray(body.data)).toBe(true);
	});

	it("POST /sources should add a new source", async () => {
		const res = await request("POST", "/sources", {
			url: "https://example.com/",
			name: "Test Source",
			maxPages: 10,
			enabled: true,
		});

		expect(res.status).toBe(201);
		const body = res.body as Record<string, unknown>;
		const data = body.data as Record<string, unknown>;
		expect(data.url).toBe("https://example.com/");
		expect(data.name).toBe("Test Source");
	});
});

describe("KB Builder - Progress endpoint", () => {
	it("GET /progress should return crawl progress", async () => {
		const res = await request("GET", "/progress");

		expect(res.status).toBe(200);
		const body = res.body as Record<string, unknown>;
		const data = body.data as Record<string, unknown>;
		expect(data.status).toBeDefined();
		expect(data.totalLinksFound).toBeDefined();
	});
});

describe("KB Builder - Articles endpoint", () => {
	it("GET /articles should return article list", async () => {
		const res = await request("GET", "/articles");

		expect(res.status).toBe(200);
		const body = res.body as Record<string, unknown>;
		expect(Array.isArray(body.data)).toBe(true);
		expect(body.meta).toBeDefined();
	});
});

describe("KB Builder - Logs endpoint", () => {
	it("GET /logs should return buffered log entries", async () => {
		const res = await request("GET", "/logs");

		expect(res.status).toBe(200);
		const body = res.body as Record<string, unknown>;
		expect(Array.isArray(body.data)).toBe(true);
	});

	it("DELETE /logs should clear the log buffer", async () => {
		const res = await request("DELETE", "/logs");

		expect(res.status).toBe(200);
		const body = res.body as Record<string, unknown>;
		const data = body.data as Record<string, unknown>;
		expect(data.cleared).toBe(true);
	});
});

describe("KB Builder - 404 handling", () => {
	it("should return 404 for unknown routes", async () => {
		const res = await request("GET", "/nonexistent");

		// Express default 404 handler
		expect(res.status).toBe(404);
	});
});
