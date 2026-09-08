const request = require('supertest');
const { createApp } = require('../src/app/create-app');

describe('Health endpoints', () => {
  const app = createApp();

  it('GET /health returns ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('GET /health/ready returns database check', async () => {
    const res = await request(app).get('/health/ready');
    expect([200, 503]).toContain(res.status);
    expect(res.body.checks).toHaveProperty('database');
  });
});
