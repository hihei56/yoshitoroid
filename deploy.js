require('dotenv').config();
const { REST, Routes, SlashCommandBuilder } = require('discord.js');

const commands = [
    // /say コマンドの設定だもん🤥✌
    new SlashCommandBuilder()
        .setName('say')
        .setDescription('なりすまし投稿をするもん🤥')
        .addStringOption(option => 
            option.setName('content')
                .setDescription('喋らせたい内容を入力しなよぉ🤥')
                .setRequired(true))
        .addAttachmentOption(option => 
            option.setName('file')
                .setDescription('画像とかも送れるよぉ🤥'))
        .addStringOption(option => 
            option.setName('reply_link')
                .setDescription('返信したいメッセージのリンクを貼りなよぉ🤥')),

    // /admin コマンドの設定だもん🤥💢
    new SlashCommandBuilder()
        .setName('admin')
        .setDescription('棄民の選別（管理機能）だもん🤥')
        .addStringOption(option =>
            option.setName('action')
                .setDescription('deny か allow を選びなよぉ🤥')
                .setRequired(true)
                .addChoices(
                    { name: 'deny', value: 'deny' },
                    { name: 'allow', value: 'allow' }
                ))
        .addUserOption(option =>
            option.setName('user')
                .setDescription('対象のジャップを選びなよぉ🤥')
                .setRequired(true)),
]
.map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
    try {
        console.log(`🤥 [yoshitoroid] ${commands.length} 個のコマンドを登録するよぉ...`);

        // 特定のサーバー（ギルド）に即座に反映させる設定だもん🤥🚿
        const data = await rest.put(
            Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
            { body: commands },
        );

        console.log(`✅ [yoshitoroid] 登録完了だもん！棄民の反撃開始だよぉ🤥✌`);
    } catch (error) {
        console.error("🤥 デプロイエラーだよぉ！膿を出し切りなよぉ🚿:", error);
    }
})();