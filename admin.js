const { getSettings, saveSettings } = require('./config');
const { MessageFlags } = require('discord.js');

async function handleAdmin(interaction) {
    if (!interaction.member.permissions.has('Administrator')) return;

    const type = interaction.options.getString('type');
    const targetId = interaction.options.getString('target_id');
    const action = interaction.options.getString('action');
    const settings = getSettings();

    if (action === 'add') {
        if (!settings[type].includes(targetId)) settings[type].push(targetId);
    } else {
        settings[type] = settings[type].filter(id => id !== targetId);
    }

    saveSettings(settings);
    await interaction.reply({ content: `Updated: ${type}`, flags: [MessageFlags.Ephemeral] });
}
module.exports = { handleAdmin };