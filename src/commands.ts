import '@total-typescript/ts-reset';
import { ApplicationCommandOptionType, AttachmentBuilder, Collection, CommandInteraction, GuildMemberRoleManager, InteractionResponse, Message, Role } from 'discord.js';
import { type ArgsOf, Discord, On, Slash, SlashOption, SlashChoice } from 'discordx';
import { EasyDiffusion } from './easy-diffusion';
import { Logger } from './logger';
import { setTimeout as sleep } from 'node:timers/promises';

const queue = new Set();

const isBetaTester = (id: string) => ['784365843810222080', '120010437294161920'].includes(id);

type Ratio = '1:1' | '2:3' | '3:2' | '9:16' | '16:9';
const ratios = {
    '1:1': {
        label: 'square',
        width: 512,
        height: 512,
        maxCount: 4,
    },
    '2:3': {
        label: 'landscape',
        width: 512,
        height: 768,
        maxCount: 1,
    },
    '3:2': {
        label: 'portrait',
        width: 512,
        height: 768,
        maxCount: 1,
    },
    '9:16': {
        label: 'portrait',
        width: 384,
        height: 704,
        maxCount: 2,
    },
    '16:9': {
        label: 'landscape',
        width: 704,
        height: 384,
        maxCount: 2,
    },
};

type Model = 'realisticVisionV13_v13' | 'lazymix_v10' | 'f222' | 'SD 1.4';
const models = ['realisticVisionV13_v13', 'lazymix_v10', 'f222', 'SD 1.4'];

@Discord()
export class Commands {
    private logger = new Logger({ service: 'Commands' });

    constructor() {
        this.logger.info('Initialised');
    }

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
            minValue: 1,
            maxValue: 4,
        }) originalCount: number,
        @SlashOption({
            name: 'ratio',
            description: 'Aspect ratio',
            required: false,
            type: ApplicationCommandOptionType.String,
            async autocomplete(interaction) {
                const focusedOption = interaction.options.getFocused(true);
                const filteredRatios = focusedOption.value.trim().length > 0 ? Object.entries(ratios).filter(([ratio, settings]) => `${ratio} (${settings.label})`.toLowerCase().startsWith(focusedOption.value.toLowerCase())) : Object.entries(ratios);
                await interaction.respond(filteredRatios.map(([ratio, settings]) => ({
                    name: `${ratio} (${settings.label})`,
                    value: ratio,
                })));
            },
        })
        originalRatio: Ratio = '1:1',
        @SlashOption({
            name: 'model',
            description: 'Which model to load',
            required: false,
            type: ApplicationCommandOptionType.String,
            async autocomplete(interaction) {
                const focusedOption = interaction.options.getFocused(true);
                const filteredModels = focusedOption.value.trim().length > 0 ? models.filter(model => model.toLowerCase().startsWith(focusedOption.value.toLowerCase())) : models;
                await interaction.respond((isBetaTester(interaction.user.id) ? filteredModels : [filteredModels[0]]).map(model => ({
                    name: model,
                    value: model,
                })));
            },
        })
        originalModel: Model = 'realisticVisionV13_v13',
        @SlashOption({
            name: 'steps',
            description: 'Steps',
            required: false,
            type: ApplicationCommandOptionType.Number,
            minValue: 1,
            maxValue: 100,
        })
        originalSteps: number = 25,
        @SlashOption({
            name: 'control-net-url',
            description: 'Which image to use for canny control net',
            required: false,
            type: ApplicationCommandOptionType.String,
        }) controlNetUrl: string | undefined,
        @SlashOption({
            name: 'seed',
            description: 'Which seed to use? (default is random)',
            required: false,
            type: ApplicationCommandOptionType.Number,
            minValue: 1,
            maxValue: 9_999_999_999,
        }) originalSeed: number = parseInt(`${Math.random() * 1_000_000_000}`, 10),
        @SlashOption({
            name: 'guidance-scale',
            description: 'How closely do you want the prompt to be followed?',
            required: false,
            type: ApplicationCommandOptionType.Number,
            minValue: 1,
            maxValue: 15,
        }) originalGuidanceScale: number = 7.5,
        @SlashOption({
            name: 'face-fix',
            description: 'Should faces be fixed after the image is generated? (this takes another 10s)',
            required: false,
            type: ApplicationCommandOptionType.Boolean,
        }) originalFaceFix = false,
        interaction: CommandInteraction,
    ) {
        // Only works in guilds
        if (!interaction.guild?.id) return;

        try {
            // Check if verified
            if (!((interaction.member?.roles) as GuildMemberRoleManager).cache.has('1142229529805459566')) {
                await interaction.reply('You need to be verified first!');
                return;
            }

            // Check if ratio is valid
            const ratio = ratios[originalRatio];
            if (ratio.maxCount < originalCount) {
                await interaction.reply(`This aspect ratio only allows a max of \`${ratio.maxCount}\` images at a time, you selected \`${originalCount}\`. Please retry with a lower count.`);
                return;
            }

            // Create reply so we can reuse this while loading, etc.
            let reply: InteractionResponse<boolean> | Message<boolean> | null = null;

            // Add user's prompt to queue
            if (queue.size >= 1) reply = await interaction.reply('Queued, please wait...');
            queue.add(interaction.id);

            // wait until we're at the top of the queue
            while (true) {
                const nextItem = [...queue.values()].filter(Boolean)[0];
                if (nextItem === interaction.id) break;
                await sleep(100);
            }

            // Tell the user we're doing their one now
            reply = reply ? await reply.edit('Rendering image...') : await interaction.reply('Rendering image...');

            // Create easy diffusion image settings
            const imageSettings = new EasyDiffusion('http://192.168.1.101:9000')
                .setPrompt(originalPrompt)
                .setNumOutputs(originalCount > ratio.maxCount ? 1 : originalCount)
                .setHeight(ratio.height)
                .setWidth(ratio.width)
                .setUseStableDiffusionModel(originalModel)
                .setNumInferenceSteps(originalSteps)
                .setBlockNSFW(interaction.channelId !== '1142828930831757362')
                .setGuidanceScale(originalGuidanceScale)
                .setUseFaceCorrection(originalFaceFix ? 'GFPGANv1.4' : undefined)
                .setControlNetUrl(controlNetUrl)
                .setSeed(originalSeed);

            const settings = imageSettings.build();
            this.logger.info('Rendering image', settings);

            // Render image
            const images = await imageSettings.render();

            // Create discord attachments
            const files = images.map((image, index) => new AttachmentBuilder(Buffer.from(image, 'base64'), {
                // Create file name based on seed + index + clean_prompt
                name: `${settings.seed}_${index}.png`,
                description: settings.prompt,
            }));

            this.logger.info('Image rendered, posting to discord');
            await reply.edit({ content: `<@${interaction.user.id}> your image is ready!`, files });
            this.logger.info('Image posted to discord');
        } catch (error) {
            this.logger.error('Failed to render image', { error });
            await interaction.reply('FAILED, TRY AGAIN!');
        } finally {
            queue.delete(interaction.id);
        }
    }
}
