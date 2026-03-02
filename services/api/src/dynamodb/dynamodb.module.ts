import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { Global, Module } from "@nestjs/common";
import { AppConfigService } from "../config/config.service";

export const DYNAMODB_CLIENT = "DYNAMODB_CLIENT";

@Global()
@Module({
	providers: [
		{
			provide: DYNAMODB_CLIENT,
			useFactory: (configService: AppConfigService) => {
				const client = new DynamoDBClient({
					region: configService.config.AWS_REGION,
					...(configService.config.DYNAMODB_ENDPOINT && {
						endpoint: configService.config.DYNAMODB_ENDPOINT,
						credentials: {
							accessKeyId: "local",
							secretAccessKey: "local",
						},
					}),
				});
				return DynamoDBDocumentClient.from(client, {
					marshallOptions: { removeUndefinedValues: true },
				});
			},
			inject: [AppConfigService],
		},
	],
	exports: [DYNAMODB_CLIENT],
})
export class DynamoDBModule {}
