import "dotenv/config";
import { app } from "./app.js";
import { initDb } from "./db.js";

const PORT = Number(process.env.KB_BUILDER_PORT) || 3002;

async function main() {
	await initDb();
	app.listen(PORT, () => {
		console.log(`[kb-builder] Listening on http://localhost:${PORT}`);
		console.log(`[kb-builder] Health: http://localhost:${PORT}/health`);
	});
}

main().catch((err) => {
	console.error("[kb-builder] Failed to start:", err);
	process.exit(1);
});
