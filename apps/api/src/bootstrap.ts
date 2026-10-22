import { INestApplication, RequestMethod, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { Env } from './config/env';

export const API_PREFIX = 'api/v1';

/** Shared HTTP setup for main.ts and integration tests. */
export function configureApp(app: INestApplication, env: Env) {
  // The dev media proxy mimics the CDN path, so it lives outside /api/v1.
  app.setGlobalPrefix(API_PREFIX, { exclude: [{ path: 'dev-media/*path', method: RequestMethod.GET }] });
  app.use(helmet());

  const origins = env.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean);
  app.enableCors({
    origin: origins.length ? origins : false,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Authorization', 'Content-Type', 'Accept-Language', 'Idempotency-Key', 'x-request-id'],
    exposedHeaders: ['x-request-id'],
    maxAge: 600,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  if (env.SWAGGER_ENABLED) {
    const config = new DocumentBuilder()
      .setTitle('Reel Drama API')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config));
  }
}
