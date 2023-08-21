import { IntentsBitField, Partials } from 'discord.js';
import { createDiscordClient } from './common/discord-client';
import package_ from '../package.json';

const { name } = package_;

export const client = createDiscordClient(name, {
    intents: [
        IntentsBitField.Flags.GuildMembers,
        IntentsBitField.Flags.Guilds,
        IntentsBitField.Flags.MessageContent,
    ],
    partials: [
        Partials.Channel,
        Partials.GuildMember,
        Partials.Message,
        Partials.Reaction,
        Partials.ThreadMember,
        Partials.User,
    ],
    prefix: `$${name}`
});
