const { OpenAI } = require('openai');
const { getModExcludeList } = require('./exclude_manager');

const TARGET_ROLES = ['1476944370694488134', '1477105188128030861', '1478715790575538359'];
const TARGET_USERS = ['1092367375355088947'];
const webhookCache = new Map();

async function handleModerator(message) {
    if (!message.content || message.author.bot) return;

    // 🛡️ Tupperbox競合回避
    const isTupperBox = /^[a-zA-Z0-9!$%^&*()_+|~=`{}[\]:";'<>?,.\/-]+|^([\[\(\{].+[\]\)\}]|.+[:>]\s.+)/.test(message.content);
    if (isTupperBox) return;

    // 🛡️ 例外リスト判定
    const excludeList = getModExcludeList();
    if (excludeList.includes(message.author.id)) return;

    const hasTargetRole = TARGET_ROLES.some(id => message.member?.roles.cache.has(id));
    const isTargetUser = TARGET_USERS.includes(message.author.id);
    if (!hasTargetRole && !isTargetUser) return;

    // 🚨 1. 手動NGワード判定（元の仕様を維持）
    const kwdUnder13 = /(0|1|2|3|4|5|6|7|8|9|10|11|12|０|１|２|３|４|５|６|７|８|９|１０|１１|１２|一|二|三|四|五|六|七|八|九|十|十一|十二)[歳才さい]/;
    const kwdElementary = /(小学|小学校|小[1-6]|中[1-3]|児ポ|ペド|エプスタイン|幼女|幼男|処女|童貞)/;
    const kwdSymbol = /😭|😋|🦀|🍽️|🍴|🍼|🎒|🏫|🧒|👧|👦/;

    let shouldDelete = kwdUnder13.test(message.content) || kwdElementary.test(message.content) || kwdSymbol.test(message.content);

    try {
        // 🚨 2. OpenAIによる検閲
        if (!shouldDelete) {
            const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
            const moderation = await openai.moderations.create({ input: message.content });
            if (moderation.results[0].categories['sexual/minors'] || moderation.results[0].flagged) shouldDelete = true;
        }

        if (shouldDelete) {
            if (message.deletable) await message.delete().catch(() => {});

            // 🚨 3. Webhookによる🚓再投稿（元の仕様を維持）
            let webhook = webhookCache.get(message.channel.id);
            if (!webhook) {
                const webhooks = await message.channel.fetchWebhooks();
                webhook = webhooks.find(wh => wh.token) || await message.channel.createWebhook({ name: '検閲Bot' });
                webhookCache.set(message.channel.id, webhook);
            }

            const displayName = message.member?.displayName || message.author.username;
            const displayAvatar = message.member?.displayAvatarURL();

            await webhook.send({
                content: `🚓 ${message.content}`,
                username: displayName,
                avatarURL: displayAvatar,
            });
        }
    } catch (e) { 
        console.error("[Moderator Error]:", e.message);
    }
}

module.exports = { handleModerator };