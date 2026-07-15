import { describe, expect, it, vi } from 'vitest';
import { HttpException } from '@nestjs/common';
import { HealthService, type DependencyStatus } from './health.service';
import type { AppConfig } from '@/config/app-config.module';

function makeService(): HealthService {
  const config = { get: vi.fn().mockReturnValue('test') } as unknown as AppConfig;
  return new HealthService(config);
}

describe('liveness', () => {
  it('reports ok with identity and uptime', () => {
    const report = makeService().liveness();
    expect(report.status).toBe('ok');
    expect(report.name).toBe('MobileShop OS');
    expect(report.apiVersion).toBe('v1');
    expect(report.uptimeSeconds).toBeGreaterThanOrEqual(0);
    expect(() => new Date(report.timestamp).toISOString()).not.toThrow();
  });

  it('never inspects dependencies', async () => {
    // A failing database must not make an orchestrator kill a healthy process.
    const service = makeService();
    const check = vi.fn<() => Promise<DependencyStatus>>().mockResolvedValue('down');
    service.register({ name: 'database', check });

    service.liveness();
    expect(check).not.toHaveBeenCalled();
    await expect(service.readiness()).rejects.toBeInstanceOf(HttpException);
  });
});

describe('readiness', () => {
  it('reports ok when no dependency is registered', async () => {
    const report = await makeService().readiness();
    expect(report.status).toBe('ok');
    expect(report.dependencies).toEqual({});
  });

  it('reports ok when every dependency is up', async () => {
    const service = makeService();
    service.register({ name: 'database', check: () => Promise.resolve('up') });
    service.register({ name: 'storage', check: () => Promise.resolve('up') });

    const report = await service.readiness();
    expect(report.status).toBe('ok');
    expect(report.dependencies).toEqual({ database: 'up', storage: 'up' });
  });

  it('throws 503 when a dependency is down', async () => {
    const service = makeService();
    service.register({ name: 'database', check: () => Promise.resolve('down') });

    await expect(service.readiness()).rejects.toBeInstanceOf(HttpException);
    await expect(service.readiness()).rejects.toMatchObject({ status: 503 });
  });

  it('treats a throwing check as a down dependency, not a crashed probe', async () => {
    const service = makeService();
    service.register({
      name: 'database',
      check: () => Promise.reject(new Error('connection refused')),
    });

    // The probe itself must survive; it reports the dependency as down.
    const error = await service.readiness().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getResponse()).toMatchObject({
      status: 'degraded',
      dependencies: { database: 'down' },
    });
  });

  it('does not let one down dependency hide the others', async () => {
    const service = makeService();
    service.register({ name: 'database', check: () => Promise.resolve('down') });
    service.register({ name: 'storage', check: () => Promise.resolve('up') });

    const error = (await service.readiness().catch((e: unknown) => e)) as HttpException;
    expect(error.getResponse()).toMatchObject({
      dependencies: { database: 'down', storage: 'up' },
    });
  });

  it('reports not_configured without marking the system degraded', async () => {
    // An unconfigured optional adapter (e.g. S3) is not a fault.
    const service = makeService();
    service.register({ name: 'storage', check: () => Promise.resolve('not_configured') });

    const report = await service.readiness();
    expect(report.status).toBe('ok');
    expect(report.dependencies).toEqual({ storage: 'not_configured' });
  });
});
