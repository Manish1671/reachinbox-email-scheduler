import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { ZodType } from 'zod';
import { AppError } from '../utils/app-error';

type RequestField = 'body' | 'query' | 'params';

function validate(field: RequestField, schema: ZodType): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[field]);

    if (!result.success) {
      next(
        new AppError('VALIDATION_ERROR', `Invalid request ${field}`, 400, result.error.flatten()),
      );
      return;
    }

    req[field] = result.data as never;
    next();
  };
}

export function validateBody(schema: ZodType): RequestHandler {
  return validate('body', schema);
}

export function validateQuery(schema: ZodType): RequestHandler {
  return validate('query', schema);
}

export function validateParams(schema: ZodType): RequestHandler {
  return validate('params', schema);
}
