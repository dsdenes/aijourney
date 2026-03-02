import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../../.env") });
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module";
import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter";
import { RequestIdInterceptor } from "./common/interceptors/request-id.interceptor";

async function bootstrap() {
	const app = await NestFactory.create(AppModule);

	app.setGlobalPrefix("api");
	app.enableCors({
		origin: process.env.APP_URL || "http://localhost:5173",
		credentials: true,
	});

	app.useGlobalFilters(new AllExceptionsFilter());
	app.useGlobalInterceptors(new RequestIdInterceptor());

	const swaggerConfig = new DocumentBuilder()
		.setTitle("AI Journey API")
		.setDescription("Mito AI Journey Platform — Backend API")
		.setVersion("0.1.0")
		.addBearerAuth()
		.build();
	const document = SwaggerModule.createDocument(app, swaggerConfig);
	SwaggerModule.setup("api/docs", app, document);

	const port = process.env.PORT || 3000;
	await app.listen(port);
	console.log(`🚀 API running on http://localhost:${port}`);
	console.log(`📚 Swagger docs at http://localhost:${port}/api/docs`);
}

bootstrap();
