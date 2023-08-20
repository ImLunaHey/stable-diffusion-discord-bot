import { Logger } from './logger';
import { main } from './main';

const logger = new Logger({ service: 'app' });

main().catch(error => {
    logger.error('Application crashed', { error });
});
