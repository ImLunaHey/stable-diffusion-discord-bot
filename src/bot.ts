import 'reflect-metadata';
import { Logger } from './logger';
import { config } from './config';
import package_ from '../package.json';
import { client } from './client';

const { name } = package_;

export const start = async () => {
    const logger = new Logger({ service: 'bot' });
    logger.info('Starting bot', {
        name,
        env: config.environment,
    });

    // Load all the events, commands and api
    await import('./commands');

    // Connect to the discord gateway
    await client.login(config.botToken);
};
