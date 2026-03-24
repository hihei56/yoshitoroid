const { getSettings, saveSettings } = require('./config');

async function handleAdmin(interaction) {
    if (!interaction.member.permissions.has('Administrator')) return interaction.reply('No perms');
    const target = interaction.options.getUser('user');
    const action = interaction.options.getString('action');
    const settings = getSettings();

    if (action === 'deny') {
        if (!settings.deniedUsers.includes(target.id)) settings.deniedUsers.push(target.id);
    } else {
        settings.deniedUsers = settings.deniedUsers.filter(id => id !== target.id);
    }

    saveSettings(settings);
    await interaction.reply(`Done: ${action} ${target.username}`);
}
module.exports = { handleAdmin };