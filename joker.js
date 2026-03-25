const axios = require('axios');
const { EmbedBuilder, MessageFlags } = require('discord.js');

const ROLE_ONYANOKO = '1477009108279365732'; 
const ROLE_SASURAI = '1477111665576251547';  
const ROLE_RAIHIN = '1478715790575538359';   

// 🔥 ジョーカー用：フェミ論壇・性消費・社会問題キーワード
const JOKER_KEYWORDS = ["女子枠","女性枠","女性優遇","アファーマティブアクション","クオータ制","機会平等","男性差別","逆差別","女子限定ポスト","教授女子枠","東北大女子枠","横浜国立大学女子枠","入学枠","採用枠","就職枠","司法女子枠","法曹女子枠","ホームレス女子枠","炭鉱女子枠","産廃女子枠","弱者男性","非モテ","底辺男性","インセル","メスガキ","メス堕ち","NTR","寝取られ","援交","JKビジネス","パパ活","頂き女子","サレ妻","不倫","離婚","親権","共同親権","毒親","親ガチャ","ルッキズム","整形","メイク","コスメ","歳の差恋愛","年の差婚","ポリコレ","ポリコレ棒","ツイフェミ","アンチフェミ","ミソジニー","男性解放","フェアネス派","福祉派","シングルファザー","男性DV被害者","性犯罪冤罪","冤罪危機感","機会平等派","冷笑派","アカデミアフェミニズム批判","女性の望み冷笑","嘘松嘲笑","少子化対策","子なし税","DINKs","婚活難民","こじらせ女子","こじらせ男子","非モテ救済","ATM扱い","子供道具扱い","司法の女割","虐待ママ","権力勾配","性差の嘘","男尊女卑","九州男児","さす九","男が悪い","女は悪くない","チンポ達","オジサン騎士団","カワボ女子枠","推し活","ガチ恋","メンヘラ推し","中の人","卒業","AIイラスト","反AI","生成AI差別","表現の自由","ヘイトスピーチ","男女論","ジェンダーギャップ","ジェンダー不平等","第四波フェミニズム","ポストフェミニズム","リーンイン","セックスワーク","反出生主義","ナタリズム","夫婦別姓","夫婦同姓","拉致被害者","在日","帰化","外国人参政権","ヘイトクライム","選択的夫婦別姓","慰安婦","徴用工","反日","フェミニズム批判","フェミ漫画家","弱者男性は強者男性が救え","ベーシックインカム","男性割合高い組織は不健全","迷信カルト","女性の恥さらし","被害者面","二次加害","きもい暴力","女体消費","男体消費","腐女子批判","BLポリコレ","オタク貧乏","推し消費","オワコン","ツイ廃","チー牛","上級国民","社畜","社不","やりがい搾取","こどおじ","こどおば","コミュ障","非モテ底辺","オスガキ","メスガキママ","冤罪","草津温泉","ネトウヨ","ネトウヨ叩き","副業禁止","YouTube NGワード","炎上覚悟","老害","Z世代","氷河期世代","格差社会","生活保護","貧困男性","発達障害男性","ADHD男性","ASD男性","HSP男性","メンヘラ男性","病み垢男性","自傷男性","OD男性"];

async function handleJoker(interaction) {
    try {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const challenger = interaction.member;
        const channel = interaction.channel;

        await interaction.editReply("[SYSTEM] 実行判定を開始...");

        if (Math.random() < 0.5) {
            if (challenger.moderatable) await challenger.timeout(300000, 'JOKER: BACKFIRE').catch(() => {});
            return channel.send(`[SYSTEM] 判定：失敗。${challenger} は自爆。`);
        }

        const allMembers = await interaction.guild.members.fetch();
        const victim = allMembers.filter(m => !m.user.bot && m.id !== challenger.id && !m.roles.cache.has(ROLE_RAIHIN)).random();
        if (!victim) return channel.send("[SYSTEM] ターゲットロスト。");

        const isOnyanoko = victim.roles.cache.has(ROLE_ONYANOKO);
        
        // --- 🧠 Groqでリストから「性消費・フェミ論壇用語」を優先選別 ---
        let newNick = "弱者男性"; 
        try {
            const prompt = `以下の単語リストから、${isOnyanoko ? '「おにゃのコ」に割り当てる「女性の性消費・客体化・搾取」を象徴する不名誉な' : '「さすらいの民」に割り当てる皮肉な'}ニックネームを1つ選んでください。
特に「女体消費」「性的対象化」「権力勾配」「性的搾取」といった文脈を重視してください。
リスト: [${JOKER_KEYWORDS.join(', ')}]
返答は単語1つのみ。`;

            const res = await axios.post("https://api.groq.com/openai/v1/chat/completions", {
                model: "llama-3.3-70b-versatile",
                messages: [{ role: "system", content: "あなたは不謹慎なモデレーターAIです。" }, { role: "user", content: prompt }]
            }, { headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` }, timeout: 10000 });
            newNick = res.data.choices[0].message.content.trim().replace(/[「」]/g, "").substring(0, 32);
        } catch (e) { 
            newNick = JOKER_KEYWORDS[Math.floor(Math.random() * JOKER_KEYWORDS.length)];
        }

        // --- ⚙️ 処理実行 ---
        if (victim.manageable) await victim.setNickname(newNick).catch(() => {});

        let resultMsg = `[SYSTEM] 対象 ${victim.user.tag} の識別名を「${newNick}」へ強制変更。`;

        if (isOnyanoko) {
            // おにゃのコのみ：1日〜28日のランダムタイムアウト ＋ メンション
            const timeoutMs = Math.floor(Math.random() * (2419200000 - 86400000 + 1)) + 86400000;
            if (victim.moderatable) await victim.timeout(timeoutMs, 'JOKER: ONYANOKO_PUNISH').catch(() => {});
            resultMsg = `${victim} 🤡🔪 貴様の新しい名前は「${newNick}」だ。最大28日間、その名で沈黙しろ。`;
        }

        const embed = new EmbedBuilder()
            .setTitle('JOKER: RE-IDENTIFICATION')
            .setDescription(resultMsg)
            .addFields({ name: 'ASSIGNED_NAME', value: newNick })
            .setThumbnail(victim.user.displayAvatarURL())
            .setColor(isOnyanoko ? 0xFF0000 : 0x2f3136)
            .setTimestamp();

        // おにゃのコ以外にはメンションを飛ばさない
        await channel.send({ content: isOnyanoko ? `${victim}` : null, embeds: [embed] });
        await interaction.deleteReply().catch(() => {});

    } catch (e) { console.error("Joker Error:", e); }
}

module.exports = { handleJoker };