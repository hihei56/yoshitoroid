// upload.js
const { MessageFlags } = require('discord.js');

async function handleUpload(interaction) {
    const file = interaction.options.getAttachment('file');
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] }); // 修正ポイント！
    
    try {
        await interaction.channel.send({ files: [file.url] });
        await interaction.editReply('アップロード成功だもん！✨');
    } catch (e) { 
        await interaction.editReply('失敗だむみぃ…'); 
    }
}
module.exports = { handleUpload };