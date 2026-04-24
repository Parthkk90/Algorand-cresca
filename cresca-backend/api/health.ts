/**
 * Health API
 * ==========
 * GET /api/health — simple health check for monitoring.
 */

export default async function handler(_req: any, res: any) {
  res.status(200).json({
    status: 'ok',
    service: 'cresca-api',
    timestamp: new Date().toISOString(),
  });
}
