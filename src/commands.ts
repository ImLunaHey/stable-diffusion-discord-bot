import '@total-typescript/ts-reset';
import { ActionRowBuilder, ApplicationCommandOptionType, AttachmentBuilder, ButtonBuilder, ButtonInteraction, ButtonStyle, CommandInteraction, GuildMemberRoleManager, InteractionResponse, Message, MessageActionRowComponentBuilder } from 'discord.js';
import { Discord, Slash, SlashOption, ButtonComponent, SlashChoice } from 'discordx';
import { Data, EasyDiffusion } from './easy-diffusion';
import { Logger } from './logger';
import { setTimeout as sleep } from 'node:timers/promises';
import { EmbedBuilder } from '@discordjs/builders';

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

    async validate(interaction: ButtonInteraction | CommandInteraction) {
        // Check if verified
        if (!((interaction.member?.roles) as GuildMemberRoleManager).cache.has('1142229529805459566')) {
            await interaction.reply('You need to be verified first!');
            return;
        }
    }

    async waitForTurn(id: string) {
        queue.add(id);

        // wait until we're at the top of the queue
        while (true) {
            const nextItem = [...queue.values()].filter(Boolean)[0];
            if (nextItem === id) break;
            await sleep(100);
        }
    }

    async renderImage(imageSettings: EasyDiffusion, interaction: CommandInteraction | ButtonInteraction) {
        try {
            const settings = imageSettings.build();
            this.logger.info('Rendering image', settings);

            const images = await imageSettings.render();
            this.logger.info('Image rendered');

            return images;
        } finally {
            queue.delete(interaction.id);
        }
    }

    async generateFollowupImage(interaction: ButtonInteraction, newData: Data, followupMessage: string) {
        // Create reply so we can reuse this while loading, etc.
        let reply: InteractionResponse<boolean> | Message<boolean> | null = null;

        // Create easy diffusion image settings
        const dataEmbed = interaction.message.embeds[0];
        if (!dataEmbed.description) return;
        const { controlNetUrl, ...oldData } = JSON.parse(Buffer.from(dataEmbed.description, 'base64').toString('utf-8')) as Data & { controlNetUrl: string | undefined; };
        const imageSettings = new EasyDiffusion('http://finds-azerbaijan-optical-ma.trycloudflare.com', {
            ...oldData,
            ...newData,
        }).setControlNet(oldData.use_controlnet_model, controlNetUrl);

        // Generate settings
        const settings = imageSettings.build();

        // Add user's prompt to queue
        if (queue.size >= 1) reply = await interaction.reply('Queued, please wait...');

        // Wait for their turn
        await this.waitForTurn(interaction.id);

        // Tell the user we're doing their one now
        reply = reply ? await reply.edit('Rendering image...') : await interaction.reply('Rendering image...');

        // Render image to user
        const images = await this.renderImage(imageSettings, interaction);

        // If we failed tell the user
        if (!images || images.length === 0) {
            this.logger.error('Failed to render image');
            reply = reply ? await reply.edit('Failed rendering image, please try again.') : await interaction.reply('Failed rendering image, please try again.');
            return;
        }

        // Create discord attachments
        const files = images.map((image, index) => new AttachmentBuilder(Buffer.from(image, 'base64'), {
            // Create file name based on seed + index + clean_prompt
            name: `${settings.seed}_${index}.png`,
            description: settings.prompt,
        }));

        // Create buttons
        const buttons = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
            new ButtonBuilder()
                .setLabel('New seed')
                .setEmoji('🎲')
                .setStyle(ButtonStyle.Primary)
                .setCustomId('new-seed'),
            new ButtonBuilder()
                .setLabel(settings.use_face_correction ? 'Disable face fix' : 'Enable face fix')
                .setEmoji('💄')
                .setStyle(settings.use_face_correction ? ButtonStyle.Danger : ButtonStyle.Success)
                .setCustomId(settings.use_face_correction ? 'fix-faces-off' : 'fix-faces-on'),
            new ButtonBuilder()
                .setLabel('Upscale x2')
                .setEmoji('🔎')
                .setStyle(ButtonStyle.Secondary)
                .setCustomId('upscale-x2'),
            new ButtonBuilder()
                .setLabel('Upscale x4')
                .setEmoji('🔎')
                .setStyle(ButtonStyle.Secondary)
                .setCustomId('upscale-x4'),
            new ButtonBuilder()
                .setLabel('Delete')
                .setEmoji('🚨')
                .setStyle(ButtonStyle.Danger)
                .setCustomId('delete-message'),
        );

        // Create the embed which will hold the settings
        // this is used for the "new-seed" and other remix type buttons
        const embed = new EmbedBuilder()
            .setDescription(Buffer.from(JSON.stringify({
                ...settings,
                controlNetUrl,
            }, null, 0), 'utf-8').toString('base64'));

        await reply.edit({ content: followupMessage, files, components: [buttons], embeds: [embed] });
        this.logger.info('Image posted to discord');
    }

    @ButtonComponent({ id: 'delete-message' })
    async deleteMessage(interaction: ButtonInteraction): Promise<void> {
        try {
            await interaction.message.delete();
        } catch { }
    }

    @ButtonComponent({ id: 'upscale-x2' })
    async upscaleX2(interaction: ButtonInteraction): Promise<void> {
        try {
            this.generateFollowupImage(interaction, {
                upscale_amount: 2,
            } as Data, `<@${interaction.user.id}> your image has been upscaled \`x2\`!`);
        } catch { }
    }

    @ButtonComponent({ id: 'upscale-x4' })
    async upscaleX4(interaction: ButtonInteraction): Promise<void> {
        try {
            this.generateFollowupImage(interaction, {
                upscale_amount: 2,
            } as Data, `<@${interaction.user.id}> your image has been upscaled \`x4\`!`);
        } catch { }
    }

    @ButtonComponent({ id: 'new-seed' })
    async newSeed(interaction: ButtonInteraction): Promise<void> {
        try {
            this.generateFollowupImage(interaction, {
                seed: new EasyDiffusion().useRandomSeed().build().seed,
            } as Data, `<@${interaction.user.id}> your image is ready!`);
        } catch { }
    }

    @ButtonComponent({ id: 'fix-faces-on' })
    async fixFacesOn(interaction: ButtonInteraction): Promise<void> {
        try {
            this.generateFollowupImage(interaction, {
                use_face_correction: 'GFPGANv1.4',
            } as Data, `<@${interaction.user.id}> finished running face fix on your image!`);
        } catch { }
    }

    @ButtonComponent({ id: 'fix-faces-off' })
    async fixFacesOff(interaction: ButtonInteraction): Promise<void> {
        try {
            this.generateFollowupImage(interaction, {
                use_face_correction: undefined,
            } as Data, `<@${interaction.user.id}> your image is ready!`);
        } catch { }
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
        }) prompt: string,
        @SlashOption({
            name: 'count',
            description: 'How many images to generate at once (max 4)',
            required: false,
            type: ApplicationCommandOptionType.Number,
            minValue: 1,
            maxValue: 4,
        }) count: number = 1,
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
        model: Model = 'realisticVisionV13_v13',
        @SlashOption({
            name: 'seed',
            description: 'Which seed to use? (default is random)',
            required: false,
            type: ApplicationCommandOptionType.Number,
            minValue: 1,
            maxValue: 9_999_999_999,
        }) seed: number = parseInt(`${Math.random() * 1_000_000_000}`, 10),
        @SlashOption({
            name: 'steps',
            description: 'Steps',
            required: false,
            type: ApplicationCommandOptionType.Number,
            minValue: 1,
            maxValue: 100,
        })
        steps: number = 25,
        @SlashChoice({ name: 'Canny', value: 'control_v11p_sd15_canny' })
        @SlashOption({
            name: 'control-net',
            description: 'Which control net to use',
            required: false,
            type: ApplicationCommandOptionType.String,
        }) controlNet: 'control_v11p_sd15_canny' | undefined,
        @SlashOption({
            name: 'control-net-url',
            description: 'Which image to use for control net',
            required: false,
            type: ApplicationCommandOptionType.String,
        }) controlNetUrl: string | undefined,
        @SlashOption({
            name: 'guidance-scale',
            description: 'How closely do you want the prompt to be followed?',
            required: false,
            type: ApplicationCommandOptionType.Number,
            minValue: 1,
            maxValue: 15,
        }) guidanceScale: number = 7.5,
        @SlashChoice({ name: 'Euler', value: 'euler' })
        @SlashChoice({ name: 'Euler Ancestral', value: 'euler_a' })
        @SlashChoice({ name: 'DPM++ SDE (Karras) (default)', value: 'dpmpp_sde' })
        @SlashOption({
            name: 'sampler',
            description: 'Which sampler to use',
            required: false,
            type: ApplicationCommandOptionType.String,
        }) sampler: string = 'dpmpp_sde',
        @SlashOption({
            name: 'upscale',
            description: 'How many times to upscale the image',
            required: false,
            type: ApplicationCommandOptionType.Number,
            minValue: 2,
            maxValue: 10,
        }) upscale: number | undefined = undefined,
        @SlashOption({
            name: 'face-fix',
            description: 'Should faces be fixed after the image is generated? (this takes another 10s)',
            required: false,
            type: ApplicationCommandOptionType.Boolean,
        }) faceFix = false,
        interaction: CommandInteraction,
    ) {
        // Only works in guilds
        if (!interaction.guild?.id) return;

        // Check if ratio is valid
        const ratio = ratios[originalRatio];
        if (ratio.maxCount < count) {
            await interaction.reply(`This aspect ratio only allows a max of \`${ratio.maxCount}\` images at a time, you selected \`${count}\`. Please retry with a lower count.`);
            return;
        }

        // Check if the user forgot to provide a control net URL
        if (controlNet && !controlNetUrl) {
            await interaction.reply('You forgot to provide a control net URL');
            return;
        }

        // Check if the user forgot to select a control net
        if (!controlNet && controlNetUrl) {
            await interaction.reply('You forgot to select a control net');
            return;
        }

        // Create reply so we can reuse this while loading, etc.
        let reply: InteractionResponse<boolean> | Message<boolean> | null = null;

        // Create easy diffusion image settings
        const imageSettings = new EasyDiffusion('http://finds-azerbaijan-optical-ma.trycloudflare.com')
            .setPrompt(prompt)
            .setNumOutputs(count > ratio.maxCount ? 1 : count)
            .setHeight(ratio.height)
            .setWidth(ratio.width)
            .setSampler(sampler)
            .setStableDiffusionModel(model)
            .setNumInferenceSteps(steps)
            .setBlockNSFW(interaction.channelId !== '1142828930831757362')
            .setGuidanceScale(guidanceScale)
            .setUseFaceCorrection(faceFix ? 'GFPGANv1.4' : undefined)
            .setControlNet(controlNet, controlNetUrl)
            .setUpscaleAmount(upscale)
            .setSeed(seed);

        // Generate settings
        const settings = imageSettings.build();

        // Add user's prompt to queue
        if (queue.size >= 1) reply = await interaction.reply('Queued, please wait...');

        // Wait for their turn
        await this.waitForTurn(interaction.id);

        // Tell the user we're doing their one now
        reply = reply ? await reply.edit('Rendering image...') : await interaction.reply('Rendering image...');

        // Render image to user
        const images = await this.renderImage(imageSettings, interaction);

        // If we failed tell the user
        if (!images || images.length === 0) {
            this.logger.error('Failed to render image');
            reply = reply ? await reply.edit('Failed rendering image, please try again.') : await interaction.reply('Failed rendering image, please try again.');
            return;
        }

        // Create discord attachments
        const files = images.map((image, index) => new AttachmentBuilder(Buffer.from(image, 'base64'), {
            // Create file name based on seed + index + clean_prompt
            name: `${settings.seed}_${index}.png`,
            description: settings.prompt,
        }));

        // Create buttons
        const buttons = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
            new ButtonBuilder()
                .setLabel('New seed')
                .setEmoji('🎲')
                .setStyle(ButtonStyle.Primary)
                .setCustomId('new-seed'),
            new ButtonBuilder()
                .setLabel(settings.use_face_correction ? 'Disable face fix' : 'Enable face fix')
                .setEmoji('💄')
                .setStyle(settings.use_face_correction ? ButtonStyle.Danger : ButtonStyle.Success)
                .setCustomId(settings.use_face_correction ? 'fix-faces-off' : 'fix-faces-on'),
            new ButtonBuilder()
                .setLabel('Upscale x2')
                .setEmoji('🔎')
                .setStyle(ButtonStyle.Secondary)
                .setCustomId('upscale-x2'),
            new ButtonBuilder()
                .setLabel('Upscale x4')
                .setEmoji('🔎')
                .setStyle(ButtonStyle.Secondary)
                .setCustomId('upscale-x4'),
            new ButtonBuilder()
                .setLabel('Delete')
                .setEmoji('🚨')
                .setStyle(ButtonStyle.Danger)
                .setCustomId('delete-message'),
        );

        // Create the embed which will hold the settings
        // this is used for the "new-seed" and other remix type buttons
        const embed = new EmbedBuilder()
            .setDescription(Buffer.from(JSON.stringify({
                ...settings,
                controlNetUrl,
            }, null, 0), 'utf-8').toString('base64'));

        await reply.edit({ content: `<@${interaction.user.id}> your image is ready!`, files, components: [buttons], embeds: [embed] });
        this.logger.info('Image posted to discord');
    }
}
