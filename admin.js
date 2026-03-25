const { updateModExcludeList } = require('./exclude_manager');

async function handleAdmin(interaction) {
    // 管理者権限チェックは index.js 側で hasPermission を通っているため省略可
    const sub = interaction.options.getSubcommand();

    if (sub === 'mod_skip') {
        const action = interaction.options.getString('action'); // 'add' or 'remove'
        const targetUser = interaction.options.getUser('user');
        
        updateModExcludeList(targetUser.id, action);
        
        return interaction.reply({
            content: `[ADMIN] ${targetUser.tag} を検閲例外リストに${action === 'add' ? '登録' : '解除'}しました。`,
            flags: [64] // Ephemeral
        });
    }
}

module.exports = { handleAdmin };