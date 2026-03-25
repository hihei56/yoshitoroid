const { OpenAI } = require('openai');
const { getModExcludeList } = require('./exclude_manager');

const EXEMPT_ROLES = [
    '1486178659130933278', 
    '1477024387524857988', 
    '1478715790575538359'
];

const webhookCache = new Map();

/* =========================
   🔥 NGワード（完全一致型）
========================= */
const NG_WORDS = [
    "ロリ","ろり","ﾛﾘ","ロリコン","幼女","幼男","児ポ","ペド",
    "小学生","小学校","中学生","中学校",
    "処女","童貞","エプスタイン"
];

/* =========================
   🔥 年齢・補助検知
========================= */
const NG_REGEX = new RegExp(
    [
        "(?:[0-9０-９]{1,2})(?:歳|才|さい)?",   // 12歳 / 12
        "(?:一|二|三|四|五|六|七|八|九|十|十一|十二)(?:歳|才|さい)?",
        "小[1-6]",
        "中[1-3]",
        "😭","😋","🦀","🍽️","🍴","🍼","🎒","🏫","🧒","👧","👦"
    ].join("|"),
    "i"
);

/* =========================
   🔥 メイン処理
========================= */
async function handleModerator(message) {
    if (!message.content || message.author.bot) return;

    // 🛡️ 免除
    const isExempt =
        EXEMPT_ROLES.some(id => message.member?.roles.cache.has(id)) ||
        getModExcludeList().includes(message.author.id);

    if (isExempt) return;

    // 🔧 前処理（回避対策）
    const content = message.content
        .toLowerCase()
        .replace(/\s+/g, ""); // スペース除去

    // 🔥 完全一致検知（含んでたら即アウト）
    const hitWord =
        NG_WORDS.some(w => content.includes(w)) ||
        NG_REGEX.test(content);

    if (hitWord) {
        await instantDeleteAndWebhook(message);
        return;
    }

    /* =========================
       🤖 AI判定（それ以外のみ）
    ========================= */
    try {
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        const moderation = await openai.moderations.create({
            input: message.content
        });

        if (moderation.results[0].flagged) {
            await instantDeleteAndWebhook(message);
        }

    } catch (e) {
        console.error("[Moderator Error]:", e.message);
    }
}

/* =========================
   🚓 削除＋Webhook再現
========================= */
async function instantDeleteAndWebhook(message) {
    let finalContent = "";
    const originalMsg = message;

    // 💀 即削除
    if (message.deletable) {
        await message.delete().catch(() => {});
    }

    /* =========================
       🔁 DiscordリプライUI再現
    ========================= */
    if (originalMsg.reference?.messageId) {
        try {
            const repliedMsg = await originalMsg.channel.messages.fetch(originalMsg.reference.messageId);

            const jumpUrl = `https://discord.com/channels/${originalMsg.guildId}/${originalMsg.channelId}/${repliedMsg.id}`;

            // 👇 UI再現（超重要）
            finalContent =
`> **Reply to:** <@${repliedMsg.author.id}>
> ${repliedMsg.content}

🚓 <@${originalMsg.author.id}> ${originalMsg.content}
🔗 ${jumpUrl}`;

        } catch {
            // fallback
            finalContent = `🚓 <@${originalMsg.author.id}> ${originalMsg.content}`;
        }
    } else {
        finalContent = `🚓 <@${originalMsg.author.id}> ${originalMsg.content}`;
    }

    /* =========================
       🔗 Webhook取得/作成
    ========================= */
    let webhook = webhookCache.get(message.channel.id);

    if (!webhook) {
        const webhooks = await message.channel.fetchWebhooks();
        webhook =
            webhooks.find(w => w.token) ||
            await message.channel.createWebhook({ name: '検閲Bot' });

        webhookCache.set(message.channel.id, webhook);
    }

    /* =========================
       🚀 送信（完全な擬似再現）
    ========================= */
    await webhook.send({
        content: finalContent,
        username: message.member?.displayName || message.author.username,
        avatarURL: message.member?.displayAvatarURL({ dynamic: true }),
        allowedMentions: {
            parse: ['users'] // @全体暴発防止
        }
    });
}

module.exports = { handleModerator };