const { OpenAI } = require('openai');
const { getModExcludeList } = require('./exclude_manager');

// 🛡️ 検閲を完全にスルーする「神」ロール
const EXEMPT_ROLES = [
    '1486178659130933278', // 反過保護ロール
    '1477024387524857988', // 追加された除外ロール
    '1478715790575538359'  // 来賓
];

const webhookCache = new Map();

async function handleModerator(message) {
    if (!message.content || message.author.bot) return;

    // 🛡️ Tupperbox競合回避
    const isTupperBox = /^[a-zA-Z0-9!$%^&*()_+|~=`{}[\]:";'<>?,.\/-]+|^([\[\(\{].+[\]\)\}]|.+[:>]\s.+)/.test(message.content);
    if (isTupperBox) return;

    // 🛡️ 個別例外リスト判定
    const excludeList = getModExcludeList();
    if (excludeList.includes(message.author.id)) return;

    // 🛡️ 免除ロール保持判定
    const isExempt = EXEMPT_ROLES.some(id => message.member?.roles.cache.has(id));
    if (isExempt) return;

    // 🚨 1. 手動NGワード判定（含まれてる時点で即削除判定🤡🔪）
    const kwdUnder13 = /(0|1|2|3|4|5|6|7|8|9|10|11|12|０|１|２|３|４|５|６|７|８|９|１０|１１|１２|一|二|三|四|五|六|七|八|九|十|十一|十二)[歳才さい]/;
    const kwdElementary = /(小学|小学校|小[1-6]|中[1-3]|児ポ|ペド|エプスタイン|幼女|幼男|処女|童貞)/;
    const kwdSymbol = /😭|😋|🦀|🍽️|🍴|🍼|🎒|🏫|🧒|👧|👦/;

    const isNgWordIncluded = kwdUnder13.test(message.content) || kwdElementary.test(message.content) || kwdSymbol.test(message.content);

    try {
        let shouldDelete = isNgWordIncluded;

        // 🚨 2. NGワードがない場合のみAI検閲
        if (!shouldDelete) {
            const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
            const moderation = await openai.moderations.create({ input: message.content });
            if (moderation.results[0].categories['sexual/minors'] || moderation.results[0].flagged) {
                shouldDelete = true;
            }
        }

        if (shouldDelete) {
            // 元のメッセージを保存（リンクやメンションを維持するため）
            const originalContent = message.content;

            // 違反メッセージを即座に削除
            if (message.deletable) await message.delete().catch(() => {});

            // 🚨 3. Webhookによる🚓再投稿
            let webhook = webhookCache.get(message.channel.id);
            if (!webhook) {
                const webhooks = await message.channel.fetchWebhooks();
                webhook = webhooks.find(wh => wh.token) || await message.channel.createWebhook({ name: '検閲Bot' });
                webhookCache.set(message.channel.id, webhook);
            }

            const displayName = message.member?.displayName || message.author.username;
            const displayAvatar = message.member?.displayAvatarURL({ dynamic: true });

            // 🚓マークを先頭に付け、元の内容（リンク・メンション込み）を送信
            await webhook.send({
                content: ` ${originalContent}`,
                username: displayName,
                avatarURL: displayAvatar,
                // メンション設定を維持（必要に応じて）
                allowedMentions: { parse: ['users', 'roles', 'everyone'] }
            });
        }
    } catch (e) { 
        console.error("[Moderator Error]:", e.message);
    }
}

module.exports = { handleModerator };