const { OpenAI } = require('openai');
const { getModExcludeList } = require('./exclude_manager');

// OpenAI インスタンスの固定化（効率化）
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const EXEMPT_ROLES = [
    '1486178659130933278', 
    '1477024387524857988', 
    '1478715790575538359'
];

const webhookCache = new Map();

/* =========================
    🛡️ NGワード & 検知設定
========================= */
const NG_WORDS = ["ロリ","ろり","ﾛﾘ","ロリコン","幼女","幼男","児ポ","ペド","小学生","小学校","中学生","中学校","処女","童貞","エプスタイン"];
const NG_REGEX = new RegExp([
    "(?:[0-9０-９]{1,2})(?:歳|才|さい)?",
    "(?:一|二|三|四|五|六|七|八|九|十|十一|十二)(?:歳|才|さい)?",
    "小[1-6]", "中[1-3]",
    "😭","😋","🦀","🍽️","🍴","🍼","🎒","🏫","🧒","👧","👦"
].join("|"), "i");

/* =========================
    ✨ テキストのリコード（パージ）処理
========================= */
function recodeText(text, isReplyParent = false) {
    if (!text) return "";
    let cleaned = text;

    // 1. 自分へのメンションを削除 (文頭の @名前 等)
    cleaned = cleaned.replace(/^@(?:\[[^\]]+\]\s*)?[^\s]+\s*/, "");

    // 2. 警察・🚓 関連のキーワードを削除
    const policePatterns = [/ら?警察いた/g, /警察/g, /🚓/g];
    policePatterns.forEach(p => cleaned = cleaned.replace(p, ""));

    // 3. リプライ親メッセージの場合は短く丸める（UI崩れ防止）
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

    // 🛡️ 免除チェック
    const isExempt =
        EXEMPT_ROLES.some(id => message.member?.roles.cache.has(id)) ||
        getModExcludeList().includes(message.author.id);

    if (isExempt) return;

    // 検知用正規化（スペース除去）
    const normalizedContent = message.content.toLowerCase().replace(/\s+/g, "");

    const isHit = NG_WORDS.some(w => normalizedContent.includes(w)) || NG_REGEX.test(normalizedContent);

    if (isHit) {
        await instantDeleteAndRecode(message);
        return;
    }

    // 🤖 AI判定
    try {
        const moderation = await openai.moderations.create({ input: message.content });
        if (moderation.results[0].flagged) {
            await instantDeleteAndRecode(message);
        }
    } catch (e) {
        console.error("[Moderator Error]:", e.message);
    }
}

/* =========================
    🚓 削除 ＋ リコード再送
========================= */
async function instantDeleteAndRecode(message) {
    const originalMsg = message;

    // 💀 即削除
    if (message.deletable) {
        await message.delete().catch(() => {});
    }

    let finalContent = "";
    const cleanSelfContent = recodeText(originalMsg.content);

    // 🔁 リプライUIの構築
    if (originalMsg.reference?.messageId) {
        try {
            const repliedMsg = await originalMsg.channel.messages.fetch(originalMsg.reference.messageId);
            const cleanParentContent = recodeText(repliedMsg.content, true);
            const jumpUrl = `https://discord.com/channels/${originalMsg.guildId}/${originalMsg.channelId}/${repliedMsg.id}`;

            // 整形された引用UI
            finalContent = `> **Reply to:** <@${repliedMsg.author.id}>\n> ${cleanParentContent}\n\n${cleanSelfContent}\n[Jump to Reply](${jumpUrl})`;
        } catch {
            finalContent = cleanSelfContent;
        }
    } else {
        finalContent = cleanSelfContent;
    }

    // 文字列が空になった場合のフォールバック
    if (!finalContent) finalContent = "*(Message Removed)*";

    // 🔗 Webhook 取得
    let webhook = webhookCache.get(message.channel.id);
    if (!webhook) {
        try {
            const webhooks = await message.channel.fetchWebhooks();
            webhook = webhooks.find(w => w.token) || await message.channel.createWebhook({ name: 'Moderator' });
            webhookCache.set(message.channel.id, webhook);
        } catch (e) {
            return console.error("Webhook Error:", e.message);
        }
    }

    // 🚀 送信
    await webhook.send({
        content: finalContent,
        username: message.member?.displayName || message.author.username,
        avatarURL: message.member?.displayAvatarURL({ dynamic: true }),
        allowedMentions: { parse: [] } // @everyone, @here, @roles を完全に無効化
    });
}

module.exports = { handleModerator };