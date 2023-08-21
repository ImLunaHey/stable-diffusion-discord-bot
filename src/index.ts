import { start } from './bot';
import { Logger } from './logger';

const logger = new Logger({ service: 'bot' });

// eslint-disable-next-line unicorn/prefer-top-level-await
start().catch(error => {
    if (!(error instanceof Error)) throw new Error(`Unknown error "${String(error)}"`);
    logger.error('Failed to load bot', {
        error,
    });

    // eslint-disable-next-line unicorn/no-process-exit
    process.exit(1);
});
