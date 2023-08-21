import '@total-typescript/ts-reset';
import { ApplicationCommandOptionType, AttachmentBuilder, Collection, CommandInteraction, GuildMemberRoleManager, InteractionResponse, Message, Role } from 'discord.js';
import { type ArgsOf, Discord, On, Slash, SlashOption } from 'discordx';
import { EasyDiffusion } from './easy-diffusion';
import { Logger } from './logger';
import { setTimeout as sleep } from 'node:timers/promises';

const queue = new Set();
@Discord()
export class Commands {
    private logger = new Logger({ service: 'Commands' });

    constructor() {
        this.logger.info('Initialised');
    }

    // @Slash({
    //     name: 'privacy',
    //     description: 'Read the privacy policy',
    // })
    // async privacy(
    //     interaction: CommandInteraction,
    // ) {
    //     // Only works in guilds
    //     if (!interaction.guild?.id) return;

    //     // Create the privacy policy embed
    //     const embed = new EmbedBuilder()
    //         .setColor('#0099ff')
    //         .setTitle('Privacy Policy')
    //         .setDescription('This Privacy Policy outlines the types of data we collect from users of our Discord bots and how we use, share, and protect that data.')
    //         .addFields(
    //             { name: 'Data Collection', value: 'Our Discord bots collect the following data from users:\n\nUser ID\nGuild ID\nJoined timestamp\nChannel message count (anonymous)\n\nIf a user chooses to opt-in, we also collect the following anonymous data:\n\nUser post count per hour' },
    //             { name: 'Data Use', value: 'We use the collected data to generate analytics and statistics for our Discord bots. The data is used to identify trends and usage patterns, which help us improve the functionality and performance of our bots. We do not use the data for any other purposes.' },
    //             { name: 'Data Sharing', value: 'We do not share any user data with third parties. The data we collect is used exclusively for our Discord bots.' },
    //             { name: 'Data Protection', value: 'We take the security of user data seriously and have implemented measures to protect it. Our servers and databases are secured using industry-standard encryption and security protocols. Access to user data is limited to authorized personnel who require it for their job duties.' },
    //             { name: 'Data Retention and Deletion', value: 'We retain user data for as long as necessary to provide our Discord bots\' services. If a user chooses to opt-out, we will delete all personal data associated with that user from our servers and databases.' },
    //             { name: 'Contact Information', value: 'If you have any questions or concerns about our privacy policy or the data we collect, you may message <@784365843810222080> (ImLunaHey#2485).' },
    //             { name: 'Changes to Privacy Policy', value: 'We reserve the right to modify this privacy policy at any time without prior notice. Any changes will be reflected on this page.' },
    //         );

    //     // Send the privacy policy
    //     await interaction.reply({
    //         ephemeral: true,
    //         embeds: [embed]
    //     });
    // }

    @Slash({
        name: 'dream',
        description: 'Create an image via AI',
    })
    async dream(
        @SlashOption({
            name: 'prompt',
            description: 'The prompt to use',
            required: true,
            type: ApplicationCommandOptionType.String,
        }) originalPrompt: string,
        @SlashOption({
            name: 'count',
            description: 'How many images to generate at once (max 4)',
            required: true,
            type: ApplicationCommandOptionType.Number,
            maxValue: 4,
            minValue: 1,
        }) originalCount: number,
        interaction: CommandInteraction,
    ) {
        // Only works in guilds
        if (!interaction.guild?.id) return;

        try {
            if (!((interaction.member?.roles) as GuildMemberRoleManager).cache.has('1142229529805459566')) {
                await interaction.reply('You need to be verified first!');
                return;
            }

            let reply: InteractionResponse<boolean> | Message<boolean> | null = null;

            if (queue.size >= 1) {
                reply = await interaction.reply('Queued, please wait...');
            }

            queue.add(interaction.id);

            // wait until we're at the top of the queue
            while (true) {
                const nextItem = [...queue.values()].filter(Boolean)[0];
                if (nextItem === interaction.id) break;
                await sleep(100);
            }

            // Tell the user we're doing their one now
            reply = reply ? await reply.edit('Rendering image...') : await interaction.reply('Rendering image...');

            // Create base settings
            const count = originalCount > 4 ? 4 : originalCount;
            const steps = interaction.user.id === '784365843810222080' ? 50 : 20;
            const blockNSFW = interaction.channelId !== '1142828930831757362';
            const seed = parseInt(`${Math.random() * 1_000_000_000}`, 10);

            this.logger.info('Rendering image', { prompt: originalPrompt, count: originalCount });

            // Create easy diffusion image settings
            const imageSettings = new EasyDiffusion('http://192.168.1.101:9000')
                .setPrompt(originalPrompt)
                .setNumOutputs(count)
                .setHeight(512)
                .setWidth(512)
                .setNumInferenceSteps(steps)
                .setBlockNSFW(blockNSFW)
                .setSeed(seed);

            // Render image
            const images = await imageSettings.render();

            // Create discord attachments
            const files = images.map((image, index) => new AttachmentBuilder(Buffer.from(image, 'base64'), {
                // Create file name based on seed + index + clean_prompt
                name: `${seed}_${index}.png`,
                description: `Seed=${seed}\nPrompt=${originalPrompt}`,
            }));

            this.logger.info('Image rendered, posting to discord');
            await reply.edit({ content: originalPrompt, files });
            this.logger.info('Image posted to discord');
        } catch (error) {
            this.logger.error('Failed to render image', { error });
            await interaction.reply('FAILED, TRY AGAIN!');
        } finally {
            queue.delete(interaction.id);
        }
    }
}
