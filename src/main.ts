import { AttachmentBuilder, Client, EmbedBuilder, IntentsBitField, Message, TextChannel } from 'discord.js';
import { EasyDiffusion } from './easy-diffusion';
import { Logger } from './logger';
import { sleep } from 'bun';

const logger = new Logger({ service: 'app' });

const client = new Client({
    intents: [IntentsBitField.Flags.Guilds, IntentsBitField.Flags.GuildMessages],
});

client.on('ready', async () => {
    logger.info('Connected to discord');
});

const queue = new Set();

const getImage = async (prompt: string, count: number = 4, steps: number, blockNSFW: boolean) => {
    const seed = parseInt(`${Math.random() * 1_000_000_000}`, 10);
    const cleanPrompt = prompt.replace(/[^a-zA-Z0-9_]/g, '_');

    // Create easy diffusion image settings
    const imageSettings = new EasyDiffusion('http://192.168.1.101:9000')
        .setPrompt(prompt)
        .setNumOutputs(count > 4 ? 4 : count)
        .setHeight(512)
        .setWidth(512)
        .setNumInferenceSteps(steps)
        .setBlockNSFW(blockNSFW)
        .setSeed(seed);

    // Create settings
    const settings = imageSettings.build();

    // Render image
    const images = await imageSettings.render();

    // Create discord attachments
    const files = images.map((image, index) => new AttachmentBuilder(Buffer.from(image, 'base64'), {
        // Create file name based on seed + index + clean_prompt
        name: `${seed}_${index}.png`,
        description: `Seed=${seed}\nPrompt=${prompt}`,
    }));

    return { files };
}

client.on('messageCreate', async message => {
    try {
        const body = message.content.trim();
        if (!body.includes('1142762469392134245')) return;

        if (!message.member?.roles.cache.has('1142229529805459566')) {
            await message.reply('You need to be verified first!');
            return;
        }

        let reply: Message<boolean> | null = null;

        if (queue.size >= 1) {
            reply = await message.reply('Queued, please wait...');
        }

        queue.add(message.id);
        await message.react('👀');

        const originalPrompt = body.split('<@1142762469392134245>')[1].trim();
        const hasCount = body.endsWith('x1') || body.endsWith('x2') || body.endsWith('x3') || body.endsWith('x4');
        const count = hasCount ? parseInt(body.slice(-1), 10) : 1;
        const prompt = hasCount ? originalPrompt.slice(0, -2) : originalPrompt;

        // wait until we're at the top of the queue
        while (true) {
            const nextItem = [...queue.values()].filter(Boolean)[0];
            if (nextItem === message.id) break;
            await sleep(100);
        }

        // Tell the user we're doing their one now
        reply = reply ? await reply.edit('Rendering image...') : await message.reply('Rendering image...');

        logger.info('Rendering image', { prompt, count });
        const response = await getImage(prompt, count, message.author.id === '784365843810222080' ? 50 : 20, message.channelId !== '1142828930831757362');
        logger.info('Image rendered, posting to discord');
        await reply.edit({ content: prompt, ...response });
        logger.info('Image posted to discord');
    } catch (error) {
        logger.error('Failed to render image', { error });
        await message.reply('FAILED, TRY AGAIN!');
    } finally {
        queue.delete(message.id);
    }
});

export const main = async () => {
    logger.debug('Application starting');

    // Login to discord
    await client.login(process.env.BOT_TOKEN);
};
