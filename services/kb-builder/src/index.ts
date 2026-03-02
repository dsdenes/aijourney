import "dotenv/config";
import { app } from "./app.js";

const PORT = Number(process.env.KB_BUILDER_PORT) || 3002;

app.listen(PORT, () => {
	console.log(`[kb-builder] Listening on http://localhost:${PORT}`);
	console.log(`[kb-builder] Health: http://localhost:${PORT}/health`);
});
