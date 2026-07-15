import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { VersioningType, type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { API_VERSION } from "@mobileshop/shared";
import { AppModule } from "@/app.module";
import { PrismaService } from "@/database/prisma.service";

vi.mock("@/database/prisma.service", () => ({ PrismaService: class {} }));

describe("Global API throttling (HTTP)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({ ping: vi.fn().mockResolvedValue(undefined) })
      .compile();

    app = moduleRef.createNestApplication({ logger: false });
    app.setGlobalPrefix("api");
    app.enableVersioning({
      type: VersioningType.URI,
      defaultVersion: API_VERSION.replace("v", ""),
    });
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it("enforces the configured global request limit", async () => {
    const responses = await Promise.all(
      Array.from({ length: 21 }, () =>
        request(app.getHttpServer()).get("/api/v1/health"),
      ),
    );
    const accepted = responses.filter(({ status }) => status === 200);
    const rejected = responses.filter(({ status }) => status === 429);

    expect(accepted).toHaveLength(20);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.body).toMatchObject({ code: "RATE_LIMITED" });
  });
});
