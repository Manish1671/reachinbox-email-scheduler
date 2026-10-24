export type SuccessResponse<T> = {
  success: true;
  data: T;
};

export type ErrorResponse = {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

export function success<T>(data: T): SuccessResponse<T> {
  return { success: true, data };
}

export function failure(code: string, message: string, details?: unknown): ErrorResponse {
  const error: ErrorResponse['error'] = { code, message };

  if (details !== undefined) {
    error.details = details;
  }

  return { success: false, error };
}
