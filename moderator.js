const { OpenAI } = require('openai');
const { getModExcludeList } = require('./exclude_manager');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const EXEMPT_ROLES = [
    '1486178659130933278',
    '1477024387524857988',
    '1478715790575538359'
];

const SENSITIVE_ALLOWED_ROLES = [
    '1486178659130933278',
    '1477024387524857988',
];

const SENSITIVE_TRIGGER_EMOJI = '👶';
const USER_ID_FOOTER_REGEX = /-# 👤 (\d+)/;

const TUPPERBOX_APP_ID = '431544605209788416';
const TUPPERBOX_PREFIX_REGEX = /^([a-zA-Z]+!)(.*)$/;

const webhookCache = new Map();

/* =========================
   🛡️ スパム対策
========================= */
const spamTracker = new Map();

function checkSpam(userId) {
    const now = Date.now();
    const entry = spamTracker.get(userId);
    if (!entry || now > entry.resetAt) {
        spamTracker.set(userId, { count: 1, resetAt: now + 10_000 });
        return false;
    }
    entry.count++;
    return entry.count >= 5;
}

setInterval(() => {
    const now = Date.now();
    for (const [id, entry] of spamTracker) {
        if (now > entry.resetAt) spamTracker.delete(id);
    }
}, 60_000);

/* =========================
   🛡️ NGワード検知
========================= */

const LOLI_SHOTA_REGEX = new RegExp([
    "ロリ","ろり","ﾛﾘ","loli",
    "ショタ","しょた","ｼｮﾀ","shota",
    "ロリコン","ろりこん","lolicon",
    "ショタコン","しょたこん","shotacon",
    "ろ\\W*り","しょ\\W*た",
    "l\\W*o\\W*l\\W*i",
    "s\\W*h\\W*o\\W*t\\W*a",
    "幼女","幼男","児童","未成年","キッズ",
    "小学生","中学生","小学校","中学校",
    "エプスタイン",
    "🧒","👧","👦","🍼","🎒"
].join("|"), "i");

const AGE_REGEX = new RegExp([
    "(?<![0-9０-９])(?:[0-9]|1[0-2])(?:歳|才|さい)",
    "(?<![0-9０-９])(?:[０-９]|１[０-２])(?:歳|才|さい)",
    "(?:一|二|三|四|五|六|七|八|九|十|十一|十二)(?:歳|才|さい)",
    "13歳未満","小[1-6]","中[1-3]"
].join("|"), "i");

const THREAT_REGEX = new RegExp([
    "死ね","しね","殺す","ころす","殺してやる",
    "爆破","爆殺","刺す","刺してやる",
    "kill\\s*you","i'll\\s*kill","gonna\\s*kill",
    "自殺しろ","死んでください"
].join("|"), "i");

const DRUG_REGEX = new RegExp([
    "覚醒剤","覚せい剤","MDM[Aa]","コカイン","ヘロイン",
    "大麻","マリファナ","危険ドラッグ","脱法ドラッグ",
    "シャブ","やく(?:を|買|売|やる)",
    "drug\\s*deal","sell\\s*drug"
].join("|"), "i");

/* =========================
   ✨ テキスト整形
========================= */

function stripTupperPrefix(content) {
    if (!content) return content;
    const match = content.match(TUPPERBOX_PREFIX_REGEX);
    if (!match) return content;
    return match[2].trim();
}

function recodeText(text, isReplyParent = false) {
    if (!text) return "";
    let cleaned = text;
    cleaned = cleaned.replace(/^@(?:\[[^\]]+\]\s*)?[^\s]+\s*/, "");
    [/ら?警察いた/g, /警察/g, /🚓/g].forEach(p => cleaned = cleaned.replace(p, ""));
    if (isReplyParent && cleaned.length > 100) cleaned = cleaned.substring(0, 97) + "...";
    return cleaned.trim();
}

/* =========================
   🖼️ 画像モデレーション
========================= */

async function moderateImages(imageUrls) {
    if (!imageUrls.length) return false;
    try {
        const results = await Promise.all(
            imageUrls.map(url =>
                openai.moderations.create({
                    model: "omni-moderation-latest",
                    input: [{ type: "image_url", image_url: { url } }]
                })
            )
        );
        // 画像もロリ関連(sexual_minors)のみ検知
        return results.some(r => r.results[0]?.categories?.sexual_minors);
    } catch (e) {
        console.error("[Image Mod Error]:", e.message);
        return false;
    }
}

/* =========================
   📍 Webhook取得（フォーラム対応）
========================= */

async function getOrCreateWebhook(channel) {
    const targetChannel = channel.isThread() ? channel.parent : channel;
    if (!targetChannel) return null;

    const cacheKey = targetChannel.id;
    const cached = webhookCache.get(cacheKey);
    if (cached) {
        if (cached.token) return cached;
        webhookCache.delete(cacheKey);
    }

    try {
        const webhooks = await targetChannel.fetchWebhooks();
        let webhook = webhooks.find(w => w.token);
        if (!webhook) {
            webhook = await targetChannel.createWebhook({ name: 'Moderator' });
        }
        webhookCache.set(cacheKey, webhook);
        return webhook;
    } catch (e) {
        console.error(`[Webhook] ❌ 失敗: ${e.message}`);
        return null;
    }
}

/* =========================
   💬 リプライ装飾の生成 (共通化)
========================= */
async function buildReplyPrefix(message) {
    if (!message.reference?.messageId) return "";

    try {
        const referencedMsg = await message.channel.messages.fetch(message.reference.messageId);
        
        let targetId = referencedMsg.author.id;
        const match = referencedMsg.content?.match(USER_ID_FOOTER_REGEX);
        if (referencedMsg.webhookId && match) targetId = match[1];

        let parentRaw = referencedMsg.content || "";
        parentRaw = parentRaw.replace(USER_ID_FOOTER_REGEX, "").replace(/-#.*$/gm, "");

        const currentHeaderRegex = /^> \[Reply to:\]\(https?:\/\/[^\)]+\) <@[0-9]+>\n> .*\n/;
        parentRaw = parentRaw.replace(currentHeaderRegex, "");

        const oldHeaderRegex = /^\[↩ [^\]]+\]\(https?:\/\/[^\)]+\)\n/;
        parentRaw = parentRaw.replace(oldHeaderRegex, "");

        parentRaw = parentRaw.trim();

        const parentPreview = parentRaw.length > 80
            ? parentRaw.substring(0, 77).replace(/\n/g, ' ') + "..."
            : parentRaw.replace(/\n/g, ' ');

        const jumpUrl = `https://discord.com/channels/${message.guildId}/${message.channelId}/${referencedMsg.id}`;

        return `> [Reply to:](${jumpUrl}) <@${targetId}>\n> ${parentPreview}\n`;
    } catch {
        return "";
    }
}

/* =========================
   💬 疑似リプライ処理
========================= */

async function handlePseudoReply(message) {
    if (!message.reference?.messageId) return false;

    let referencedMsg;
    try {
        referencedMsg = await message.channel.messages.fetch(message.reference.messageId);
    } catch { return false; }

    if (!referencedMsg.webhookId || referencedMsg.applicationId === TUPPERBOX_APP_ID) {
        return false;
    }

    if (!referencedMsg.content?.match(USER_ID_FOOTER_REGEX)) return false;

    if (message.deletable) await message.delete().catch(() => {});

    const replyPrefix = await buildReplyPrefix(message);
    const replyContent = `${replyPrefix}${recodeText(message.content)}\n-# 👤 ${message.author.id}`;

    const webhook = await getOrCreateWebhook(message.channel);
    if (!webhook) return true;

    // 疑似リプライでは画像を引き継がない（負荷対策・放棄）
    const sendOptions = {
        content: replyContent,
        files: [],
        username: message.member?.displayName || message.author.username,
        avatarURL: message.member?.displayAvatarURL({ dynamic: true }),
        allowedMentions: { parse: [] } 
    };

    if (message.channel.isThread()) sendOptions.threadId = message.channel.id;

    await webhook.send(sendOptions).catch(e => console.error(`[PseudoReply] ❌ ${e.message}`));
    return true;
}

/* =========================
   🔞 センシティブ投稿処理
========================= */

async function handleSensitivePost(message) {
    const hasPermission = SENSITIVE_ALLOWED_ROLES.some(id => message.member?.roles.cache.has(id));
    if (!hasPermission) return false;

    const hasTrigger = message.content?.includes(SENSITIVE_TRIGGER_EMOJI);
    const hasAttachment = message.attachments.size > 0;
    if (!hasTrigger || !hasAttachment) return false;

    if (message.deletable) await message.delete().catch(() => {});

    const webhook = await getOrCreateWebhook(message.channel);
    if (!webhook) return true;

    // ここだけ画像を引き継ぐ
    const files = [...message.attachments.values()].map(att => ({
        attachment: att.url,
        name: `SPOILER_${att.name || 'image.png'}`
    }));

    const cleanContent = (message.content || "").replace(SENSITIVE_TRIGGER_EMOJI, "").trim();

    const sendOptions = {
        content: (cleanContent || "\u200b") + `\n-# 👤 ${message.author.id}`,
        files,
        username: message.member?.displayName || message.author.username,
        avatarURL: message.member?.displayAvatarURL({ dynamic: true }),
        allowedMentions: { parse: [] }
    };

    if (message.channel.isThread()) sendOptions.threadId = message.channel.id;

    await webhook.send(sendOptions).catch(e => console.error(`[Sensitive] ❌ ${e.message}`));
    return true;
}

/* =========================
   🔥 メイン処理（閾値調整版）
========================= */

async function handleModerator(message) {
    if (!message.content && !message.attachments.size) return;
    if (message.author.bot) return;

    // Tupperbox優先
    const rawContent = message.content || "";
    if (TUPPERBOX_PREFIX_REGEX.test(rawContent)) {
        return;
    }

    const isExempt =
        EXEMPT_ROLES.some(id => message.member?.roles.cache.has(id)) ||
        getModExcludeList().includes(message.author.id);

    if (checkSpam(message.author.id)) {
        await message.delete().catch(() => {});
        return;
    }

    const strippedContent = stripTupperPrefix(rawContent);
    const normalized = strippedContent.toLowerCase().replace(/\s+/g, "");

    // 1. 正規表現による検知
    const isLoliShota = LOLI_SHOTA_REGEX.test(normalized);
    const isUnderAge = AGE_REGEX.test(normalized);
    const isThreat = THREAT_REGEX.test(normalized);
    const isDrug = DRUG_REGEX.test(normalized);

    const images = [...message.attachments.values()]
        .filter(att => att.contentType?.startsWith('image/'))
        .map(att => att.url);

    // 2. AI判定の取得（スコアベース）
    const [textResult, imageResult] = await Promise.all([
        strippedContent.trim().length > 0
            ? openai.moderations.create({
                model: "omni-moderation-latest",
                input: strippedContent
            }).catch(() => null)
            : Promise.resolve(null),
        moderateImages(images)
    ]);

    const scores = textResult?.results[0]?.category_scores ?? {};

    // 🔥 閾値の適用
    // ロリ関連 (sexual/minors) は 50% 以上でアウト
    const isAiLoliDanger = scores['sexual/minors'] > 0.5;

    // それ以外（ハラスメント、ヘイト等）は 90% 以上でアウト
    const isOtherHighDanger = 
        scores.harassment > 0.9 || 
        scores['harassment/threatening'] > 0.9 ||
        scores.hate > 0.9 ||
        scores['hate/threatening'] > 0.9 ||
        scores.sexual > 0.9 ||
        scores['self-harm'] > 0.9 ||
        scores.violence > 0.9 ||
        scores['violence/graphic'] > 0.9;

    // 検閲実行条件
    if ((isLoliShota || (isLoliShota && isUnderAge) || isThreat || isDrug || isAiLoliDanger || isOtherHighDanger || imageResult) && !isExempt) {
        await instantDeleteAndRecode(message);
        return;
    }

    const sensitiveHandled = await handleSensitivePost(message);
    if (sensitiveHandled) return;

    const pseudoHandled = await handlePseudoReply(message);
    if (pseudoHandled) return;
}

/* =========================
   🚓 削除＋Webhook再送
========================= */

async function instantDeleteAndRecode(message) {
    if (message.deletable) await message.delete().catch(() => {});

    let finalContent = recodeText(message.content);
    if (!finalContent) finalContent = "*(Message Removed)*";

    const replyPrefix = await buildReplyPrefix(message);
    finalContent = `${replyPrefix}${finalContent}\n-# 👤 ${message.author.id}`;

    const webhook = await getOrCreateWebhook(message.channel);
    if (!webhook) return;

    // 検閲削除時は画像を引き継がない（負荷対策・放棄）
    const sendOptions = {
        content: finalContent,
        files: [], 
        username: message.member?.displayName || message.author.username,
        avatarURL: message.member?.displayAvatarURL({ dynamic: true }),
        allowedMentions: { parse: [] }
    };

    if (message.channel.isThread()) sendOptions.threadId = message.channel.id;

    await webhook.send(sendOptions).catch(e => console.error(`[Recode] ❌ ${e.message}`));
}

module.exports = { handleModerator };