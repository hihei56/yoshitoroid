require('dotenv').config();
const { REST, Routes, SlashCommandBuilder } = require('discord.js');

const commands = [
    new SlashCommandBuilder().setName('dice').setDescription('1日1回のダイス勝負。当たると制限がかかる場合があります。'),
    new SlashCommandBuilder().setName('joker').setDescription('JOKERを実行。不名誉な改名と制裁を下します。'),
    new SlashCommandBuilder().setName('say').setDescription('ボットに喋らせます。')
        .addStringOption(o => o.setName('content').setDescription('内容').setRequired(true))
        .addAttachmentOption(o => o.setName('file').setDescription('画像'))
        .addStringOption(o => o.setName('reply_link').setDescription('返信先リンク')),
    new SlashCommandBuilder().setName('admin').setDescription('管理設定。')
        .addSubcommand(s => s.setName('mod_skip').setDescription('検閲例外設定')
            .addStringOption(o => o.setName('action').setRequired(true).addChoices({name:'追加',value:'add'},{name:'解除',value:'remove'}))
            .addUserOption(o => o.setName('user').setRequired(true)))
        .addSubcommand(s => s.setName('say_deny').setDescription('代行拒否設定')
            .addStringOption(o => o.setName('action').setRequired(true).addChoices({name:'拒否',value:'deny'},{name:'許可',value:'allow'}))
            .addUserOption(o => o.setName('user').setRequired(true))),
].map(c => c.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
    try {
        console.log('🧹 古いグローバルコマンドを掃除中...');
        // グローバル登録を一度空にする（これがダブり解消の鍵です）
        await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: [] });

        console.log('🚀 最新のコマンドを登録中...');
        if (process.env.GUILD_ID) {
            // サーバー固有の登録を更新
            await rest.put(
                Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
                { body: commands }
            );
            console.log('✅ サーバー限定で登録完了');
        } else {
            // グローバルで登録を更新
            await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
            console.log('✅ 全サーバー共通で登録完了');
        }
        console.log('💡 Discordを Ctrl+R で再起動して確認してください。');
    } catch (e) { console.error(e); }
})();