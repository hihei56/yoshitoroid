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

const { initScheduler } = require('./scheduler');
const { handleSay } = require('./say');
const { handleDeathmatch } = require('./deathmatch');
const { handleModerator } = require('./moderator');
const { handleAdmin } = require('./admin');

// 🔥 Client 初期化
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

// 🔐 権限設定
const ALLOWED_ROLES = ['1476944370694488134', '1478715790575538359'];

function hasPermission(member) {
    if (!member) return false;
    if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
    return ALLOWED_ROLES.some(roleId => member.roles.cache.has(roleId));
}

// 🚀 起動
client.once(Events.ClientReady, async (c) => {
    console.log(`✅ [Bot Ready] ${c.user.tag}`);

    // OpenAIチェック
    try {
        const testClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        await testClient.moderations.create({ input: "test" });
        console.log("✨ OpenAI OK");
    } catch (err) {
        console.error("❌ OpenAI Error:", err.message);
    }

    initScheduler(client);
});

// 📩 メッセージ処理
client.on(Events.MessageCreate, async (m) => {
    if (m.author.bot || !m.guild) return;

    // 検閲
    handleModerator(m).catch(err => console.error("[Mod Error]:", err));

    // 権限なしメンション無視
    if (m.mentions.has(client.user) && !hasPermission(m.member)) return;
});

// ⚡ スラッシュコマンド
client.on(Events.InteractionCreate, async (i) => {
    if (!i.isChatInputCommand()) return;

    if (!hasPermission(i.member)) {
        return i.reply({
            content: "権限がありません。",
            flags: [MessageFlags.Ephemeral]
        });
    }

    try {
        if (i.commandName === 'dice') await handleDeathmatch(i);
        if (i.commandName === 'say') await handleSay(i);
        if (i.commandName === 'admin') await handleAdmin(i);
    } catch (error) {
        console.error("Interaction Error:", error);
    }
});

// 🔥 Discord接続トラブル対策
client.on("error", console.error);
client.on("shardError", console.error);
client.on("disconnect", () => {
    console.log("⚠️ Discord切断 → 自動復帰待ち");
});

// 🛑 Graceful Shutdown
process.on("SIGINT", async () => {
    console.log("🛑 Shutdown...");
    try {
        await client.destroy();
    } catch (e) {
        console.error(e);
    }
    process.exit(0);
});

// 🌐 Fly用HTTPサーバー（超重要）
require("http")
    .createServer((req, res) => res.end("OK"))
    .listen(3000, () => console.log("🌐 HTTP Server Ready"));

// 🧠 メモリ監視（任意）
setInterval(() => {
    const used = process.memoryUsage().rss / 1024 / 1024;
    console.log(`🧠 Memory: ${used.toFixed(2)} MB`);
}, 60000);

// 🚀 ログイン
client.login(process.env.DISCORD_TOKEN);
