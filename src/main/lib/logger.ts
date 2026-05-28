import { createLogger } from '@shared/logger';
import { onErrorFromLogger } from './error-log-writer';

export const log = createLogger({
  envLevel: process.env.LOG_LEVEL,
  debugFlag: process.argv.includes('--debug-logs'),
  onError: onErrorFromLogger,
});
