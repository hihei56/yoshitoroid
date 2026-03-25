// 🚀 --- クラッシュ防止機構 ---
process.on('uncaughtException', (error) => {
    console.error('[Uncaught Exception]:', error);
});
process.on('unhandledRejection', (reason) => {
    console.error('[Unhandled Rejection]:', reason);
});
// --------------------------------

require('dotenv').config();

const {
    Client,
    GatewayIntentBits,
    Events,
    MessageFlags,
    PermissionFlagsBits
} = require('discord.js');

const { OpenAI } = require('openai');

// 各機能モジュールの読み込み
const { initScheduler } = require('./scheduler');
const { handleSay } = require('./say');
const { handleDeathmatch } = require('./deathmatch');
const { handleModerator } = require('./moderator');
const { handleAdmin } = require('./admin');
const { handleJoker } = require('./joker');

// 🔥 Client 初期化
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

// 🔐 権限設定（管理者、または指定ロール保持者のみ許可）
const ALLOWED_ROLES = ['1476944370694488134', '1478715790575538359'];

function hasPermission(member) {
    if (!member) return false;
    if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
    return ALLOWED_ROLES.some(roleId => member.roles.cache.has(roleId));
}

// 🚀 起動処理
client.once(Events.ClientReady, async (c) => {
    console.log(`✅ [Bot Ready] ${c.user.tag} 起動成功`);

    try {
        const testClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        await testClient.moderations.create({ input: "test" });
        console.log("✨ OpenAI OK");
    } catch (err) {
        console.error("❌ OpenAI Error:", err.message);
    }

    initScheduler(client);
});

// 📩 メッセージ送信時のイベント処理
client.on(Events.MessageCreate, async (m) => {
    if (m.author.bot || !m.guild) return;

    // 検閲パトロールの実行
    handleModerator(m).catch(err => console.error("[Mod Error]:", err));

    if (m.mentions.has(client.user) && !hasPermission(m.member)) return;
});

// ⚡ スラッシュコマンド実行処理
client.on(Events.InteractionCreate, async (i) => {
    if (!i.isChatInputCommand()) return;

    if (!hasPermission(i.member)) {
        return i.reply({
            content: "このボットを使用する権限がありません。",
            flags: [MessageFlags.Ephemeral]
        });
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

client.on("error", console.error);
client.on("shardError", console.error);

process.on("SIGINT", async () => {
    console.log("🛑 シャットダウン開始...");
    try {
        await client.destroy();
    } catch (e) {
        console.error(e);
    }
    process.exit(0);
});

// 🌐 Fly.io スリープ防止用 HTTPサーバー
require("http")
    .createServer((req, res) => res.end("OK"))
    .listen(3000, () => {
        console.log("🌐 HTTP Server Ready (Port: 3000)");
    });

client.login(process.env.DISCORD_TOKEN);