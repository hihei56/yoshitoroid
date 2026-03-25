const { updateModExcludeList } = require('./exclude_manager');

async function handleAdmin(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'mod_skip') {
        const action = interaction.options.getString('action');
        const targetUser = interaction.options.getUser('user');
        
        updateModExcludeList(targetUser.id, action);
        
        return interaction.reply({
            content: `[ADMIN] ${targetUser.tag} を検閲例外リストに${action === 'add' ? '登録' : '解除'}しました。`,
            flags: [64]
        });
    }
}

module.exports = { handleAdmin };