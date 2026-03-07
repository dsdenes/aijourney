import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { RequestIdInterceptor } from './common/interceptors/request-id.interceptor';
import { AppConfigService } from './config/config.service';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);
  const configService = app.get(AppConfigService);
  const { APP_URL, API_URL, PORT } = configService.config;
  const apiBaseUrl = API_URL.endsWith('/api') ? API_URL : `${API_URL.replace(/\/$/, '')}/api`;

  app.enableShutdownHooks();

  if (configService.isProduction) {
    app.getHttpAdapter().getInstance().set('trust proxy', 1);
  }

  app.setGlobalPrefix('api');
  app.enableCors({
    origin: APP_URL,
    credentials: true,
  });

  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new RequestIdInterceptor());

  const swaggerConfig = new DocumentBuilder()
    .setTitle('AI Journey API')
    .setDescription('AI Journey Platform — Backend API')
    .setVersion(configService.version)
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document, {
    jsonDocumentUrl: 'openapi.json',
  });

  await app.listen(PORT, '0.0.0.0');
  logger.log(`API running on ${API_URL}`);
  logger.log(`Swagger docs available at ${apiBaseUrl}/docs`);
}

bootstrap();
