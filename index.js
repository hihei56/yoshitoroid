// 🚀 --- クラッシュ防止機構 ---
// 未処理のエラーでBotが落ちるのを防ぎます
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
    // サーバー管理者は無条件でパス
    if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
    // 指定ロールを持っているか確認
    return ALLOWED_ROLES.some(roleId => member.roles.cache.has(roleId));
}

// 🚀 起動処理
client.once(Events.ClientReady, async (c) => {
    console.log(`✅ [Bot Ready] ${c.user.tag} 起動成功`);

    // OpenAI SDK 接続診断
    try {
        const testClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        await testClient.moderations.create({ input: "test" });
        console.log("✨ OpenAI OK");
    } catch (err) {
        console.error("❌ OpenAI Error:", err.message);
    }

    // スケジューラー（時報＆ゆめちゃん襲来）の初期化
    initScheduler(client);
});

// 📩 メッセージ送信時のイベント処理
client.on(Events.MessageCreate, async (m) => {
    if (m.author.bot || !m.guild) return;

    // 検閲パトロールの実行（非同期）
    handleModerator(m).catch(err => console.error("[Mod Error]:", err));

    // 権限のないユーザーからのメンションは無視
    if (m.mentions.has(client.user) && !hasPermission(m.member)) return;
});

// ⚡ スラッシュコマンド実行処理
client.on(Events.InteractionCreate, async (i) => {
    if (!i.isChatInputCommand()) return;

    // 実行者の権限チェック
    if (!hasPermission(i.member)) {
        return i.reply({
            content: "このボットを使用する権限がありません。",
            flags: [MessageFlags.Ephemeral]
        });
    }

    try {
        // コマンド分岐
        if (i.commandName === 'dice') await handleDeathmatch(i);
        if (i.commandName === 'say') await handleSay(i);
        if (i.commandName === 'admin') await handleAdmin(i);
        if (i.commandName === 'joker') await handleJoker(i);
    } catch (error) {
        console.error("Interaction Error:", error);
    }
});

// 🛡️ Discord接続トラブル対策
client.on("error", console.error);
client.on("shardError", console.error);
client.on("disconnect", () => {
    console.log("⚠️ Discord切断 → 自動復帰を待機中");
});

// 🛑 プロセス終了時の安全なログアウト処理
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

// 🧠 メモリ使用量の監視
setInterval(() => {
    const used = process.memoryUsage().rss / 1024 / 1024;
    // デバッグモード時のみログ出力
    if (process.env.DEBUG_MODE === 'true') {
        console.log(`🧠 [DEBUG] Memory Usage: ${used.toFixed(2)} MB`);
    }
}, 60000);

// 🚀 ログイン実行
client.login(process.env.DISCORD_TOKEN);