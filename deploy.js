require('dotenv').config();
const { REST, Routes, SlashCommandBuilder } = require('discord.js');

// 登録するコマンドのリスト
const commands = [
    // 1. ダイス勝負
    new SlashCommandBuilder()
        .setName('dice')
        .setDescription('1日1回のダイス勝負。当たると数日間の制限がかかる場合があります。'),

    // 2. JOKERシステム
    new SlashCommandBuilder()
        .setName('joker')
        .setDescription('JOKERシステムを実行し、不名誉な改名と制裁を下します。'),

    // 3. メッセージ送信機能（代行）
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

    // 4. 管理機能
    new SlashCommandBuilder()
        .setName('admin')
        .setDescription('サーバー管理用の設定を行います。')
        // サブコマンド：検閲例外設定
        .addSubcommand(subcommand =>
            subcommand
                .setName('mod_skip')
                .setDescription('特定のユーザーを検閲（ロリ・ショタ監視）の対象外に設定します。')
                .addStringOption(option =>
                    option.setName('action')
                        .setDescription('実行するアクション')
                        .setRequired(true)
                        .addChoices(
                            { name: '登録（保護）', value: 'add' },
                            { name: '解除', value: 'remove' }
                        )
                )
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('対象のユーザー')
                        .setRequired(true)
                )
        )
        // サブコマンド：代行拒否設定
        .addSubcommand(subcommand =>
            subcommand
                .setName('say_deny')
                .setDescription('特定のユーザーの代行実行権限を管理します。')
                .addStringOption(option =>
                    option.setName('action')
                        .setDescription('拒否または許可')
                        .setRequired(true)
                        .addChoices(
                            { name: '拒否', value: 'deny' },
                            { name: '許可', value: 'allow' }
                        )
                )
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('対象のユーザー')
                        .setRequired(true)
                )
        ),
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
    try {
        console.log('🚀 スラッシュコマンドの更新を開始します...');

        // 全体（グローバル）コマンドとして登録
        await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: commands }
        );

        console.log(`✅ コマンド（${commands.length}個）の登録が完了しました。`);
        console.log('💡 Discordを再起動（Ctrl+R）して確認してください。');
    } catch (error) {
        console.error('❌ 登録中にエラーが発生しました:', error);
    }
})();