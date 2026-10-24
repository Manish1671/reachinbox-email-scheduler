type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const levelOrder: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function currentMinLevel(): number {
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  if (nodeEnv === 'test') {
    return levelOrder.error;
  }
  if (nodeEnv === 'production') {
    return levelOrder.info;
  }
  return levelOrder.debug;
}

function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return { value: error };
}

function emit(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
  if (levelOrder[level] < currentMinLevel()) {
    return;
  }

  const payload: Record<string, unknown> = {
    level,
    time: new Date().toISOString(),
    message,
  };

  if (meta) {
    for (const [key, value] of Object.entries(meta)) {
      payload[key] = value instanceof Error ? serializeError(value) : value;
    }
  }

  const line = JSON.stringify(payload);

  if (level === 'error') {
    console.error(line);
    return;
  }

  if (level === 'warn') {
    console.warn(line);
    return;
  }

  console.log(line);
}

export const logger = {
  debug(message: string, meta?: Record<string, unknown>): void {
    emit('debug', message, meta);
  },
  info(message: string, meta?: Record<string, unknown>): void {
    emit('info', message, meta);
  },
  warn(message: string, meta?: Record<string, unknown>): void {
    emit('warn', message, meta);
  },
  error(message: string, meta?: Record<string, unknown>): void {
    emit('error', message, meta);
  },
};
