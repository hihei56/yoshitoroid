const { OpenAI } = require('openai');

const TARGET_ROLES = ['1476944370694488134', '1477105188128030861', '1478715790575538359'];
const TARGET_USERS = ['1092367375355088947'];

// Webhookキャッシュ（ラグ対策）
const webhookCache = new Map();

async function handleModerator(message) {
    if (!message.content || message.author.bot) return;

    const hasTargetRole = TARGET_ROLES.some(id => message.member?.roles.cache.has(id));
    const isTargetUser = TARGET_USERS.includes(message.author.id);
    if (!hasTargetRole && !isTargetUser) return;

    // --- 🚨 1. 手動NGワード（AIを待たずに即判定） ---
    const kwdUnder13 = /(0|1|2|3|4|5|6|7|8|9|10|11|12|０|１|２|３|４|５|６|７|８|９|１０|１１|１２|一|二|三|四|五|六|七|八|九|十|十一|十二)[歳才]/;
    const kwdElementary = /(小学生|小学校|小[1-6]|小[１-６]|小[一二三四五六]|小学[1-6]年生|小学[１-６]年生|小学[一二三四五六]年生)/;
    const kwdPreschool = /(保育園|幼稚園|年少|年中|年長|未就学児|幼児|乳児|赤ちゃん)/;
    const kwdDrugs = /(大麻|野菜手押し|アイス手押し|シャブ|コカイン|MDMA)/;
    const kwdViolence = /(殺す|死ね|自殺|リスカ)/;

    const hasKwd = kwdUnder13.test(message.content) || 
                   kwdElementary.test(message.content) || 
                   kwdPreschool.test(message.content) ||
                   kwdDrugs.test(message.content) || 
                   kwdViolence.test(message.content);

    try {
        let shouldDelete = hasKwd;
        
        // キーワードに引っかからなかった場合のみ AI を使う（5ドルの節約）
        if (!shouldDelete) {
            const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
            const moderation = await openai.moderations.create({ input: message.content });
            const result = moderation.results[0];
            if (result.flagged || result.categories['sexual/minors']) {
                shouldDelete = true;
            }
        }

        if (shouldDelete) {
            // --- 🚨 2. 削除を最優先（ラグを感じさせない） ---
            if (message.deletable) await message.delete().catch(() => {});

            // Webhookの取得（キャッシュから探す）
            let webhook = webhookCache.get(message.channel.id);
            if (!webhook) {
                const webhooks = await message.channel.fetchWebhooks();
                webhook = webhooks.find(wh => wh.token);
                if (!webhook) webhook = await message.channel.createWebhook({ name: '検閲Bot' });
                webhookCache.set(message.channel.id, webhook);
            }

            // リプライ装飾
            let replyPrefix = "";
            if (message.reference?.messageId) {
                const repliedMsg = await message.channel.messages.fetch(message.reference.messageId).catch(() => null);
                if (repliedMsg) {
                    const msgUrl = `https://discord.com/channels/${message.guild.id}/${message.channel.id}/${repliedMsg.id}`;
                    replyPrefix = `> [Reply to:](${msgUrl}) @${repliedMsg.author.displayName || repliedMsg.author.username}\n`;
                }
            }

            const displayName = message.member?.displayName || message.author.displayName || message.author.username;
            const displayAvatar = message.member?.displayAvatarURL();

            // Webhook送信（🚓）
            await webhook.send({
                content: `${replyPrefix}🚓 ${message.content}`,
                username: displayName, 
                avatarURL: displayAvatar,
            });
        }
    } catch (e) {
        console.error("[Moderator Error]:", e.message);
    }
}
module.exports = { handleModerator };
