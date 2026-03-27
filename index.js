// index.js
process.on('uncaughtException', e => console.error('[Error]:', e));
process.on('unhandledRejection', e => console.error('[Reject]:', e));

require('dotenv').config();

const { Client, GatewayIntentBits, Events } = require('discord.js');
const { initScheduler } = require('./scheduler');
const { handleSay } = require('./say');
const { handleDeathmatch } = require('./deathmatch');
const { handleModerator } = require('./moderator');
const { handleAdmin } = require('./admin');
const { handleJoker } = require('./joker');

// RSS Bot
const { checkRSS } = require('./rssBot');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

const ALLOWED_ROLES = ['1476944370694488134', '1478715790575538359'];

function hasPermission(member) {
    if (!member) return false;
    if (member.permissions.has('Administrator')) return true;
    return ALLOWED_ROLES.some(roleId => member.roles.cache.has(roleId));
}

// Bot起動
client.once(Events.ClientReady, async c => {
    console.log(`✅ [Bot Ready] ${c.user.tag} 起動成功`);

    // 定期タスク
    initScheduler(client);

    // RSSチェック（起動時）
    checkRSS(client);

    // 5分ごとにRSSチェック
    setInterval(() => checkRSS(client), 30 * 60 * 1000);
});

// メッセージ監視（モデレーター系）
client.on(Events.MessageCreate, async m => {
    if (m.author.bot || !m.guild) return;
    handleModerator(m).catch(err => console.error("[Mod Error]:", err));
});

// コマンド処理
client.on(Events.InteractionCreate, async i => {
    if (!i.isChatInputCommand()) return;

    if (!hasPermission(i.member)) {
        return i.reply({ content: "このボットを使用する権限がありません。", ephemeral: true });
    }

    try {
        if (i.commandName === 'dice') await handleDeathmatch(i);
        if (i.commandName === 'say') await handleSay(i);
        if (i.commandName === 'admin') await handleAdmin(i);
        if (i.commandName === 'joker') await handleJoker(i);
    } catch (error) {
        console.error("Interaction Error:", error);
    }
});

// HTTPサーバー（生存確認用）
require("http")
    .createServer((req, res) => res.end("OK"))
    .listen(3000, () => console.log("🌐 HTTP Server Ready (Port: 3000)"));

// Botログイン
client.login(process.env.DISCORD_TOKEN);