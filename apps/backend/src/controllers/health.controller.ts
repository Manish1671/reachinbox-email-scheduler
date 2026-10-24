import type { Request, Response } from 'express';
import { getHealthStatus } from '../services/health.service';
import { success } from '../utils/api-response';

export async function getHealth(req: Request, res: Response): Promise<void> {
  const verbose = req.query.verbose === 'true';
  const data = await getHealthStatus(verbose);
  res.json(success(data));
}
