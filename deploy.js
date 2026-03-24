require('dotenv').config();
const { REST, Routes, SlashCommandBuilder } = require('discord.js');

// 登録するコマンドのリスト
const commands = [
    // 1. ダイス勝負（引数なし：実行者が対象）
    new SlashCommandBuilder()
        .setName('dice')
        .setDescription('1日1回のダイス勝負を行います。当たると制限がかかる場合があります。'),

    // 2. メッセージ送信機能
    new SlashCommandBuilder()
        .setName('say')
        .setDescription('指定した内容をボットに喋らせます。')
        .addStringOption(option => 
            option.setName('content')
                .setDescription('メッセージ内容')
                .setRequired(true)
        )
        .addAttachmentOption(option => 
            option.setName('file')
                .setDescription('添付画像')
        )
        .addStringOption(option => 
            option.setName('reply_link')
                .setDescription('返信先メッセージのリンク')
        ),

    // 3. ユーザー管理機能（管理者用）
    new SlashCommandBuilder()
        .setName('admin')
        .setDescription('特定のユーザーの制限設定を行います。')
        .addStringOption(option => 
            option.setName('action')
                .setDescription('実行するアクションを選択')
                .setRequired(true)
                .addChoices(
                    { name: '拒否', value: 'deny' },
                    { name: '許可', value: 'allow' }
                )
        )
        .addUserOption(option => 
            option.setName('user')
                .setDescription('対象のユーザーを選択')
                .setRequired(true)
        ),
].map(command => command.toJSON());

// RESTクライアントの初期化
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
    try {
        console.log('🚀 スラッシュコマンドの更新を開始します...');

        // ギルドIDが設定されている場合、特定のサーバーのコマンドをリセットして再登録
        if (process.env.GUILD_ID) {
            await rest.put(
                Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
                { body: [] }
            );

            await rest.put(
                Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
                { body: commands }
            );
            console.log(`✅ サーバー用コマンド（${commands.length}個）の登録が完了しました。`);
        } else {
            // ギルドIDがない場合はグローバル登録
            await rest.put(
                Routes.applicationCommands(process.env.CLIENT_ID),
                { body: commands }
            );
            console.log(`✅ グローバルコマンド（${commands.length}個）の登録が完了しました。`);
        }

        console.log('💡 Discordを再起動（Ctrl+R）して確認してください。');
    } catch (error) {
        console.error('❌ 登録中にエラーが発生しました:', error);
    }
})();