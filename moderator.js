const { OpenAI } = require('openai');
const { getModExcludeList } = require('./exclude_manager');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const EXEMPT_ROLES = [
    '1486178659130933278',
    '1477024387524857988',
    '1478715790575538359'
];

const webhookCache = new Map();

/* =========================
   🛡️ NGワード & 強化検知
========================= */

// 🔥 広範囲ロリ・ショタ検知（揺れ・隠語対応）
const LOLI_SHOTA_REGEX = new RegExp([
    // 基本
    "ロリ","ろり","ﾛﾘ","loli",
    "ショタ","しょた","ｼｮﾀ","shota",

    // 派生
    "ロリコン","ろりこん","lolicon",
    "ショタコン","しょたこん","shotacon",

    // 伏せ字・崩し
    "ろ\\W*り","しょ\\W*た",
    "l\\W*o\\W*l\\W*i",
    "s\\W*h\\W*o\\W*t\\W*a",

    // 児童系ワード
    "幼女","幼男","児童","未成年","未熟","キッズ",

    // 学校系（かなり重要）
    "小学生","中学生","小学校","中学校",

    // 危険人物系
    "エプスタイン",

    // 絵文字
    "🧒","👧","👦","🍼","🎒"
].join("|"), "i");

const AGE_REGEX = new RegExp([
    // 🔥 前に数字がない + 12歳以下
    "(?<![0-9０-９])(?:[0-9]|1[0-2])(?:歳|才|さい)",

    // 🔥 全角
    "(?<![0-9０-９])(?:[０-９]|１[０-２])(?:歳|才|さい)",

    // 🔥 漢数字
    "(?:一|二|三|四|五|六|七|八|九|十|十一|十二)(?:歳|才|さい)",

    // 🔥 明示的
    "13歳未満",

    // 学年
    "小[1-6]",
    "中[1-3]"
].join("|"), "i");
/* =========================
   ✨ テキスト整形
========================= */

function recodeText(text, isReplyParent = false) {
    if (!text) return "";
    let cleaned = text;

    cleaned = cleaned.replace(/^@(?:\[[^\]]+\]\s*)?[^\s]+\s*/, "");

    const policePatterns = [/ら?警察いた/g, /警察/g, /🚓/g];
    policePatterns.forEach(p => cleaned = cleaned.replace(p, ""));

    if (isReplyParent && cleaned.length > 100) {
        cleaned = cleaned.substring(0, 97) + "...";
    }

    return cleaned.trim();
}

/* =========================
   🔥 メイン処理
========================= */

async function handleModerator(message) {
    if (!message.content || message.author.bot) return;

    const isExempt =
        EXEMPT_ROLES.some(id => message.member?.roles.cache.has(id)) ||
        getModExcludeList().includes(message.author.id);

    if (isExempt) return;

    const normalized = message.content.toLowerCase().replace(/\s+/g, "");

    // 🔥 ロリショタ系
    const isLoliShota = LOLI_SHOTA_REGEX.test(normalized);

    // 🔥 年齢
    const isUnderAge = AGE_REGEX.test(normalized);

    // 🔥 コンボ強化（かなり重要）
    const isCombo = isLoliShota && isUnderAge;

    if (isLoliShota || isCombo || isUnderAge) {
        await instantDeleteAndRecode(message);
        return;
    }

    // 🤖 AI（最低限）
    try {
        const moderation = await openai.moderations.create({
            model: "omni-moderation-latest",
            input: message.content
        });

        const result = moderation.results[0];

        const isDanger = result.categories?.sexual_minors;

        if (isDanger) {
            await instantDeleteAndRecode(message);
        }

    } catch (e) {
        console.error("[Moderator Error]:", e.message);
    }
}

/* =========================
   🚓 削除＋再送
========================= */

async function instantDeleteAndRecode(message) {
    const originalMsg = message;

    if (message.deletable) {
        await message.delete().catch(() => {});
    }

    let finalContent = "";
    const cleanSelfContent = recodeText(originalMsg.content);

    if (originalMsg.reference?.messageId) {
        try {
            const repliedMsg = await originalMsg.channel.messages.fetch(originalMsg.reference.messageId);
            const cleanParentContent = recodeText(repliedMsg.content, true);

            const jumpUrl =
                `https://discord.com/channels/${originalMsg.guildId}/${originalMsg.channelId}/${repliedMsg.id}`;

            finalContent =
`> **Reply to:** <@${repliedMsg.author.id}>
> ${cleanParentContent}

${cleanSelfContent}
[Jump to Reply](${jumpUrl})`;

        } catch {
            finalContent = cleanSelfContent;
        }
    } else {
        finalContent = cleanSelfContent;
    }

    if (!finalContent) finalContent = "*(Message Removed)*";

    let webhook = webhookCache.get(message.channel.id);

    if (!webhook) {
        try {
            const webhooks = await message.channel.fetchWebhooks();
            webhook =
                webhooks.find(w => w.token) ||
                await message.channel.createWebhook({ name: 'Moderator' });

            webhookCache.set(message.channel.id, webhook);

        } catch (e) {
            return console.error("Webhook Error:", e.message);
        }
    }

    await webhook.send({
        content: finalContent,
        username: message.member?.displayName || message.author.username,
        avatarURL: message.member?.displayAvatarURL({ dynamic: true }),
        allowedMentions: { parse: [] }
    });
}

module.exports = { handleModerator };