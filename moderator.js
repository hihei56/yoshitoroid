const { OpenAI } = require('openai');

const TARGET_ROLES = ['1476944370694488134', '1477105188128030861', '1478715790575538359'];
const TARGET_USERS = ['1092367375355088947'];

async function handleModerator(message) {
    if (!message.content || message.author.bot) return;

    const hasTargetRole = TARGET_ROLES.some(id => message.member?.roles.cache.has(id));
    const isTargetUser = TARGET_USERS.includes(message.author.id);
    if (!hasTargetRole && !isTargetUser) return;

    try {
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        
        const moderation = await openai.moderations.create({ input: message.content });
        const result = moderation.results[0];
        
        // 🚨 13歳未満を連想させる全キーワード（半角・全角・漢数字・才/歳に対応）
        const kwdUnder13 = /(0|1|2|3|4|5|6|7|8|9|10|11|12|０|１|２|３|４|５|６|７|８|９|１０|１１|１２|一|二|三|四|五|六|七|八|九|十|十一|十二)[歳才]/;
        const kwdElementary = /(小学生|小学校|小[1-6]|小[１-６]|小[一二三四五六]|小学[1-6]年生|小学[１-６]年生|小学[一二三四五六]年生)/;
        const kwdPreschool = /(保育園|幼稚園|年少|年中|年長|未就学児|幼児|乳児|赤ちゃん)/;
        const kwdItems = /(ランドセル|キッズケータイ)/;

        // 既存のNGワード
        const kwdDrugs = /(大麻|覚せい剤|シャブ|コカイン|MDMA|LSD|脱法ハーブ|野菜手押し|アイス手押し)/;
        const kwdPII = /(マイナンバー|クレカ番号|口座番号|住所特定|電話番号晒|IP抜く|特定した)/;
        const kwdViolence = /(殺す|爆破予告|死ね|自殺|リスカ)/;

        // どれか一つでも引っかかったらアウト
        const hasKwd = kwdUnder13.test(message.content) || 
                       kwdElementary.test(message.content) || 
                       kwdPreschool.test(message.content) || 
                       kwdItems.test(message.content) ||
                       kwdDrugs.test(message.content) || 
                       kwdPII.test(message.content) || 
                       kwdViolence.test(message.content);

        if (result.flagged || hasKwd || result.categories['sexual/minors']) {
            
            // --- リプライ装飾の作成 ---
            let replyPrefix = "";
            if (message.reference && message.reference.messageId) {
                try {
                    const repliedMsg = await message.channel.messages.fetch(message.reference.messageId);
                    const msgUrl = `https://discord.com/channels/${message.guild.id}/${message.channel.id}/${repliedMsg.id}`;
                    const repliedName = repliedMsg.member?.displayName || repliedMsg.author.displayName || repliedMsg.author.username;
                    replyPrefix = `> [Reply to:](${msgUrl}) @${repliedName}\n`;
                } catch (err) {
                    replyPrefix = `> Reply to: (削除されたメッセージ)\n`;
                }
            }

            // 1. 本人の発言を削除
            if (message.deletable) {
                await message.delete().catch(console.error);
            }

            // 2. Webhookの確保
            const webhooks = await message.channel.fetchWebhooks();
            let webhook = webhooks.find(wh => wh.token);
            
            if (!webhook) {
                webhook = await message.channel.createWebhook({ name: '検閲Bot' });
            }

            const displayName = message.member?.displayName || message.author.displayName || message.author.username;
            const displayAvatar = message.member?.displayAvatarURL() || message.author.displayAvatarURL();

            // 3. 原文オウム返し（※パトカー付き）
            await webhook.send({
                content: `${replyPrefix}🚓 ${message.content}`,
                username: displayName, 
                avatarURL: displayAvatar,
            });

            console.log(`[Moderator] 🚨 手動NGワード検閲完了: ${displayName} (${message.author.tag})`);
        }
    } catch (e) {
        console.error("[Moderator Error]:", e.message);
    }
}
module.exports = { handleModerator };