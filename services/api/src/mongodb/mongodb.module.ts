import { type Db, MongoClient } from "mongodb";
import { Global, Inject, Logger, Module, type OnModuleDestroy } from "@nestjs/common";
import { AppConfigService } from "../config/config.service";

export const MONGODB_DB = "MONGODB_DB";
export const MONGODB_CLIENT = "MONGODB_CLIENT";

@Global()
@Module({
	providers: [
		{
			provide: MONGODB_CLIENT,
			useFactory: async (config: AppConfigService) => {
				const logger = new Logger("MongoDBModule");
				const uri = config.config.MONGODB_URI;
				logger.log(`Connecting to MongoDB: ${uri.replace(/\/\/[^@]+@/, "//***@")}`);
				const client = new MongoClient(uri);
				await client.connect();
				logger.log("MongoDB connected");
				return client;
			},
			inject: [AppConfigService],
		},
		{
			provide: MONGODB_DB,
			useFactory: (client: MongoClient): Db => client.db("aijourney"),
			inject: [MONGODB_CLIENT],
		},
	],
	exports: [MONGODB_DB, MONGODB_CLIENT],
})
export class MongoDBModule implements OnModuleDestroy {
	constructor(
		@Inject(MONGODB_CLIENT) private readonly client: MongoClient,
	) {}

	async onModuleDestroy() {
		if (this.client) {
			await this.client.close();
		}
	}
}
