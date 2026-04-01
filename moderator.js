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
const MAX_FILE_SIZE_MB = 8;
const MAX_VIDEO_GIF_COUNT = 3;
const USER_ID_FOOTER_REGEX = /-# 👤 (\d+)/;

const TUPPERBOX_APP_ID = '431544605209788416';
// 英字+! (例: name!) にマッチ
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

// 🔥 修正: スコープ外に出し、正規表現を統一
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
   📁 メディア分類
========================= */

function classifyAttachments(message) {
    const images = [];
    const heavyFiles = [];
    let videoGifCount = 0;

    for (const att of message.attachments.values()) {
        const sizeMB = att.size / (1024 * 1024);
        const isVideo = att.contentType?.startsWith('video/');
        const isGif = att.contentType === 'image/gif' || att.name?.endsWith('.gif');
        const isImage = att.contentType?.startsWith('image/');

        if (sizeMB > MAX_FILE_SIZE_MB) {
            heavyFiles.push(att);
            continue;
        }
        if (isVideo || isGif) videoGifCount++;
        if (isImage) images.push(att.url);
    }

    return { images, heavyFiles, tooManyVideoGif: videoGifCount > MAX_VIDEO_GIF_COUNT };
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
    if (!targetChannel) {
        console.error("[Webhook] ❌ targetChannel が null");
        return null;
    }

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
            console.log(`[Webhook] 🆕 作成: ${webhook.id}`);
        }
        webhookCache.set(cacheKey, webhook);
        return webhook;
    } catch (e) {
        console.error(`[Webhook] ❌ 失敗: ${e.message} code=${e.code}`);
        return null;
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
    } catch {
        return false;
    }

    if (!referencedMsg.webhookId) return false;

    if (referencedMsg.applicationId === TUPPERBOX_APP_ID) {
        return false;
    }

    const match = referencedMsg.content?.match(USER_ID_FOOTER_REGEX);
    if (!match) return false;

    const originalUserId = match[1];
    let originalUsername = `<@${originalUserId}>`;
    try {
        const member = await message.guild.members.fetch(originalUserId);
        originalUsername = `@${member.displayName}`;
    } catch {}

    const parentRaw = referencedMsg.content
        ?.replace(USER_ID_FOOTER_REGEX, "")
        .replace(/-#.*$/gm, "")
        .trim() || "";

    const parentPreview = parentRaw.length > 80
        ? parentRaw.substring(0, 77) + "..."
        : parentRaw;

    const jumpUrl = `https://discord.com/channels/${message.guildId}/${message.channelId}/${referencedMsg.id}`;

    const replyContent =
`[↩ ${originalUsername}: ${parentPreview}](${jumpUrl})
${recodeText(message.content)}
-# 👤 ${message.author.id}`;

    if (message.deletable) await message.delete().catch(() => {});

    const webhook = await getOrCreateWebhook(message.channel);
    if (!webhook) return true;

    const sendOptions = {
        content: replyContent,
        username: message.member?.displayName || message.author.username,
        avatarURL: message.member?.displayAvatarURL({ dynamic: true }),
        allowedMentions: { parse: [] }
    };

    if (message.channel.isThread()) sendOptions.threadId = message.channel.id;

    await webhook.send(sendOptions).catch(e =>
        console.error(`[PseudoReply] ❌ ${e.message} code=${e.code}`)
    );
    return true;
}

/* =========================
   🔞 センシティブ投稿処理
========================= */

async function handleSensitivePost(message) {
    const hasPermission = SENSITIVE_ALLOWED_ROLES.some(id =>
        message.member?.roles.cache.has(id)
    );
    if (!hasPermission) return false;

    const hasTrigger = message.content?.includes(SENSITIVE_TRIGGER_EMOJI);
    const hasAttachment = message.attachments.size > 0;
    if (!hasTrigger || !hasAttachment) return false;

    if (message.deletable) await message.delete().catch(() => {});

    const webhook = await getOrCreateWebhook(message.channel);
    if (!webhook) return true;

    const files = [...message.attachments.values()].map(att => ({
        attachment: att.url,
        name: `SPOILER_${att.name || 'image.png'}`
    }));

    const cleanContent = (message.content || "")
        .replace(SENSITIVE_TRIGGER_EMOJI, "")
        .trim();

    const sendOptions = {
        content: (cleanContent || "\u200b") + `\n-# 👤 ${message.author.id}`,
        files,
        username: message.member?.displayName || message.author.username,
        avatarURL: message.member?.displayAvatarURL({ dynamic: true }),
        allowedMentions: { parse: [] }
    };

    if (message.channel.isThread()) sendOptions.threadId = message.channel.id;

    await webhook.send(sendOptions).catch(e =>
        console.error(`[Sensitive] ❌ ${e.message} code=${e.code}`)
    );
    return true;
}

/* =========================
   🔥 メイン処理
========================= */

async function handleModerator(message) {
    if (!message.content && !message.attachments.size) return;
    if (message.author.bot) return;

    const isExempt =
        EXEMPT_ROLES.some(id => message.member?.roles.cache.has(id)) ||
        getModExcludeList().includes(message.author.id);

    const sensitiveHandled = await handleSensitivePost(message);
    if (sensitiveHandled) return;

    const pseudoHandled = await handlePseudoReply(message);
    if (pseudoHandled) return;

    if (isExempt) return;

    if (checkSpam(message.author.id)) {
        await message.delete().catch(() => {});
        console.log(`[Spam] ${message.author.tag}`);
        return;
    }

    const { images, heavyFiles, tooManyVideoGif } = classifyAttachments(message);
    
    // 🔥 改善: 重いファイルがあっても、テキストがあるならテキストは残して代理送信する
    if (heavyFiles.length > 0 || tooManyVideoGif) {
        if (message.deletable) await message.delete().catch(() => {});
        console.log(`[Heavy Media] 削除: ${message.author.tag}`);
        
        if (message.content) {
            // 元のテキストに警告を加えて再送
            const warningMsg = Object.assign({}, message);
            warningMsg.content = message.content + "\n*(⚠️ ファイルサイズ超過または動画・GIFが多すぎるため、メディアは削除されました)*";
            await instantDeleteAndRecode(warningMsg);
        }
        return;
    }  

    const rawContent = message.content || "";
    const strippedContent = stripTupperPrefix(rawContent);
    const normalized = strippedContent.toLowerCase().replace(/\s+/g, "");

    const isLoliShota = LOLI_SHOTA_REGEX.test(normalized);
    const isUnderAge = AGE_REGEX.test(normalized);
    const isThreat = THREAT_REGEX.test(normalized);
    const isDrug = DRUG_REGEX.test(normalized);

    if (isLoliShota || (isLoliShota && isUnderAge) || isThreat || isDrug) {
        await instantDeleteAndRecode(message);
        return;
    }

    // 🔥 改善: テキストが空欄の場合はOpenAIへリクエストを送らない（エラー防止）
    const [textResult, imageResult] = await Promise.all([
        strippedContent.trim().length > 0
            ? openai.moderations.create({
                model: "omni-moderation-latest",
                input: strippedContent
            }).catch(e => { console.error("[Text Mod Error]:", e.message); return null; })
            : Promise.resolve(null),
        moderateImages(images)
    ]);

    const cats = textResult?.results[0]?.categories ?? {};
    const textDanger = cats.sexual_minors || cats.hate || cats['self-harm'] || cats.harassment;

    if (textDanger || imageResult) {
        await instantDeleteAndRecode(message);
    }
}

/* =========================
   🚓 削除＋Webhook再送
========================= */

async function instantDeleteAndRecode(message) {
    if (message.deletable) await message.delete().catch(() => {});

    let finalContent = recodeText(message.content);
    if (!finalContent) finalContent = "*(Message Removed)*";
    finalContent += `\n-# 👤 ${message.author.id}`;

    const webhook = await getOrCreateWebhook(message.channel);
    if (!webhook) {
        console.error("[Recode] ❌ Webhook取得失敗");
        return;
    }

    const sendOptions = {
        content: finalContent,
        username: message.member?.displayName || message.author.username,
        avatarURL: message.member?.displayAvatarURL({ dynamic: true }),
        allowedMentions: { parse: [] }
    };

    if (message.channel.isThread()) sendOptions.threadId = message.channel.id;

    await webhook.send(sendOptions).catch(e =>
        console.error(`[Recode] ❌ ${e.message}`, JSON.stringify(e.rawError ?? {}))
    );
}

module.exports = { handleModerator };