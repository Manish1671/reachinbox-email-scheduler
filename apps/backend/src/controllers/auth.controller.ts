import type { Request, Response } from 'express';
import { authService } from '../services/auth.service';
import { success } from '../utils/api-response';
import { requireUser } from '../utils/request-user';
import type { LoginBody, RegisterBody } from '../validation/auth.schema';

export async function register(req: Request, res: Response): Promise<void> {
  const result = await authService.register(req.body as RegisterBody);
  res.status(201).json(success(result));
}

export async function login(req: Request, res: Response): Promise<void> {
  const result = await authService.login(req.body as LoginBody);
  res.json(success(result));
}

export async function me(req: Request, res: Response): Promise<void> {
  const user = requireUser(req);
  res.json(success(user));
}
