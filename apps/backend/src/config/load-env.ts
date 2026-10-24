import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

function findEnvFile(): string | undefined {
  const candidates = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), '../../.env'),
  ];

  return candidates.find((candidate) => fs.existsSync(candidate));
}

const envPath = findEnvFile();

if (envPath) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config();
}
