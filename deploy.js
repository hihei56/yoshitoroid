require('dotenv').config();
const { REST, Routes, SlashCommandBuilder } = require('discord.js');

const commands = [
    new SlashCommandBuilder()
        .setName('say')
        .setDescription('Proxy message with screenshot-style reply')
        .addStringOption(o => o.setName('content').setDescription('The message content').setRequired(true))
        .addAttachmentOption(o => o.setName('file').setDescription('Optional media file').setRequired(false))
        .addStringOption(o => o.setName('reply_link').setDescription('Message URL to simulate a reply').setRequired(false)),
    
    new SlashCommandBuilder()
        .setName('admin')
        .setDescription('Manage user and role permissions')
        .addStringOption(o => o.setName('type').setDescription('Category to update').setRequired(true).addChoices(
            { name: 'Allow Role', value: 'allowedRoles' },
            { name: 'Deny Role', value: 'deniedRoles' },
            { name: 'Allow User', value: 'allowedUsers' },
            { name: 'Deny User', value: 'deniedUsers' }
        ))
        .addStringOption(o => o.setName('target_id').setDescription('The Discord ID').setRequired(true))
        .addStringOption(o => o.setName('action').setDescription('Add or Remove').setRequired(true).addChoices(
            { name: 'Add', value: 'add' },
            { name: 'Remove', value: 'remove' }
        ))
].map(c => c.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
    try {
        console.log('🔄 コマンド登録中...');
        await rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID), { body: commands });
        console.log('✅ コマンド登録完了。');
    } catch (e) { console.error(e); }
})();