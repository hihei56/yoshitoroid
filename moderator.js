const { OpenAI } = require('openai');
const { getModExcludeList } = require('./exclude_manager');

// 監視対象ロール
const TARGET_ROLES = ['1476944370694488134', '1477105188128030861', '1478715790575538359'];

async function handleModerator(message) {
    // 1. Botによるメッセージ、または内容が空の場合は無視
    if (!message.content || message.author.bot) return;

    // 2. Tupperboxのプレフィックス(t!等)やBrackets(括弧)を判定して除外
    // アルファベットや記号から始まる、または括弧で囲まれているメッセージをスルー
    const isTupperBox = /^[a-zA-Z0-9!$%^&*()_+|~=`{}[\]:";'<>?,.\/-]+|^([\[\(\{].+[\]\)\}]|.+[:>]\s.+)/.test(message.content);
    if (isTupperBox) return;

    // 3. 管理コマンド (/admin mod_skip) で設定された例外ユーザーの保護
    const excludeList = getModExcludeList();
    if (excludeList.includes(message.author.id)) return;

    // 4. 監視対象ロールの確認
    const hasTargetRole = TARGET_ROLES.some(id => message.member?.roles.cache.has(id));
    if (!hasTargetRole) return;

    // 5. 判定用にテキストを正規化（スペースや記号を除去）
    const content = message.content.toLowerCase().replace(/[\s　.。、,・_ー-]/g, "");

    // 🚨 監視キーワード：ロリ・ショタ・年齢・隠語・エプスタイン
    const kwdChild = /ロリ|loli|ショタ|syota|shota|幼女|幼男|童貞|処女|js|jk|jd|幼い|小さい|児童|キッズ|児ポ|ペド|pedo|エプスタイン|epstein|島|園児|幼稚|稚児|ガキ|ちんしゅ|メスガキ|オスガキ/;
    const kwdAge = /(0|1|2|3|4|5|6|7|8|9|10|11|12|０|１|２|３|４|５|６|７|８|９|１０|１１|１２|一|二|三|四|五|六|七|八|九|十|十一|十二)[歳才さい]|(小学|しょうがく|中学|ちゅうがく|小[1-6]|中[1-3])/;
    const kwdSymbol = /😭|😋|🦀|🍽️|🍴|🍼|🎒|🏫|🧒|👧|👦/;

    let shouldDelete = kwdChild.test(content) || kwdAge.test(content) || kwdSymbol.test(content);

    try {
        // OpenAI Moderation API による詳細判定
        if (!shouldDelete) {
            const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
            const moderation = await openai.moderations.create({ input: message.content });
            if (moderation.results[0].categories['sexual/minors']) shouldDelete = true;
        }

        // 違反メッセージの削除と警告（再投稿はせず、削除のみ）
        if (shouldDelete) {
            if (message.deletable) await message.delete().catch(() => {});
            const warning = await message.channel.send(`🚓 [MODERATOR] 児童保護の観点から不適切な表現を検出し、削除しました。`).catch(() => {});
            if (warning) setTimeout(() => warning.delete().catch(() => {}), 5000);
        }
    } catch (e) { 
        console.error("[Moderator Error]:", e.message);
    }
}

module.exports = { handleModerator };