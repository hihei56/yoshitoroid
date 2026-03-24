const { MessageFlags } = require('discord.js');
const { getSettings } = require('./config');

async function handleSay(interaction) {
    const { user, member, channel, options } = interaction;
    const settings = getSettings();

    if (!member.permissions.has('Administrator') && settings.deniedUsers.includes(user.id)) {
        return interaction.reply({ content: "Denied", flags: [MessageFlags.Ephemeral] });
    }

    // 応答を爆速で消すためにフラグ設定
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    try {
        // Webhookの取得ロジック（ここも共通化するともっと速い）
        const webhooks = await channel.fetchWebhooks();
        let webhook = webhooks.find(wh => wh.owner.id === interaction.client.user.id);
        if (!webhook) webhook = await channel.createWebhook({ name: 'FastProxy' });

        const content = options.getString('content');
        const file = options.getAttachment('file');
        const replyLink = options.getString('reply_link');
        
        let replyPrefix = "";
        if (replyLink) {
            const messageId = replyLink.split('/').pop();
            const repliedMsg = await channel.messages.fetch(messageId).catch(() => null);
            if (repliedMsg) {
                replyPrefix = `**[Reply to](${replyLink}) : <@${repliedMsg.author.id}>**\n`;
            }
        }

        await webhook.send({
            content: replyPrefix + content,
            username: member.displayName,
            avatarURL: user.displayAvatarURL(),
            files: file ? [file.url] : []
        });

        await interaction.deleteReply().catch(() => {});
    } catch (e) { 
        console.error(e);
        if (interaction.deferred) await interaction.editReply('Error');
    }
}
module.exports = { handleSay };