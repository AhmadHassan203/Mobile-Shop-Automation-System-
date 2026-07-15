import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { VersioningType } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { Logger } from "nestjs-pino";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import {
  API_VERSION,
  APP_NAME,
  IDEMPOTENCY_KEY_HEADER,
  REQUEST_ID_HEADER,
} from "@mobileshop/shared";
import { AppModule } from "./app.module";
import { AppConfig } from "./config/app-config.module";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    // Defer logging to pino so the very first lines are structured too.
    bufferLogs: true,
  });

  app.useLogger(app.get(Logger));
  const config = app.get(AppConfig);

  // --- Security headers ------------------------------------------------------
  app.use(
    helmet({
      // The API serves JSON, not HTML; CSP belongs on the frontend origin.
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: "same-site" },
    }),
  );

  // Session cookies are HTTP-only and read server-side (13_ §8).
  app.use(cookieParser(config.get("SESSION_SECRET")));

  // --- CORS ------------------------------------------------------------------
  // credentials:true is required for the session cookie, which forbids a
  // wildcard origin — the allow-list is explicit and configured per environment.
  app.enableCors({
    origin: config.corsOrigins,
    credentials: true,
    exposedHeaders: [REQUEST_ID_HEADER],
    allowedHeaders: [
      "Content-Type",
      "Accept",
      REQUEST_ID_HEADER,
      IDEMPOTENCY_KEY_HEADER,
    ],
  });

  // --- Routing ---------------------------------------------------------------
  app.setGlobalPrefix(config.get("API_GLOBAL_PREFIX"));
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: API_VERSION.replace("v", ""),
  });

  // Input validation is per-route via ZodValidationPipe against the schemas in
  // `shared/`, so one definition validates the server request and the client form.
  // See src/common/pipes/zod-validation.pipe.ts.

  // Flush pino and close connections cleanly on SIGTERM.
  app.enableShutdownHooks();

  // --- OpenAPI ---------------------------------------------------------------
  // Not exposed in production: it maps the entire attack surface (13_ §27).
  if (!config.isProduction) {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle(`${APP_NAME} API`)
        .setDescription(
          "Production API for MobileShop OS. Every state-changing endpoint enforces " +
            "authentication, permission and scope on the server, and writes an audit event.",
        )
        .setVersion(API_VERSION)
        .addCookieAuth(config.get("SESSION_COOKIE_NAME"))
        .build(),
    );
    SwaggerModule.setup(
      `${config.get("API_GLOBAL_PREFIX")}/docs`,
      app,
      document,
      {
        swaggerOptions: { persistAuthorization: true },
      },
    );
  }

  const port = config.get("API_PORT");
  await app.listen(port, config.get("API_HOST"));

  const logger = app.get(Logger);
  logger.log(
    {
      port,
      environment: config.get("NODE_ENV"),
      timezone: config.get("BUSINESS_TIMEZONE"),
      currency: config.get("BUSINESS_CURRENCY"),
      docs: config.isProduction
        ? "disabled"
        : `/${config.get("API_GLOBAL_PREFIX")}/docs`,
    },
    `${APP_NAME} API listening on port ${port}`,
  );
}

void bootstrap();
