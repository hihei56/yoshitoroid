const { EmbedBuilder, MessageFlags } = require('discord.js');

const ROLE_JAKUSHA = '1476944370694488134'; // 弱者男性 (実行権限 & 免除)
const ROLE_RAIHIN = '1478715790575538359';   // 来賓 (免除)

async function handleJoker(interaction) {
    try {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const challenger = interaction.member;
        const channel = interaction.channel;

        // 1. 弱者男性ロール保持者のみ実行可能🤡
        if (!challenger.roles.cache.has(ROLE_JAKUSHA)) {
            return interaction.editReply("🤡「弱者男性」以外がジョーカーを語るなよぉ🤥💢");
        }

        // 2. 自爆判定 (50%) - 実行者のリスクは最大1日🤡🚓
        if (Math.random() < 0.5) {
            if (challenger.moderatable) {
                // 実行者のタイムアウトは1分〜24時間のランダム
                const selfTimeoutMs = Math.floor(Math.random() * (86400000 - 60000 + 1)) + 60000;
                const hours = Math.floor(selfTimeoutMs / 3600000);
                const mins = Math.floor((selfTimeoutMs % 3600000) / 60000);
                
                await challenger.timeout(selfTimeoutMs, 'JOKER: BACKFIRE').catch(() => {});
                return interaction.editReply(`残念！👮に取り押さえられてしまった！ ${challenger.displayName} は ${hours}時間${mins}分 拘束されたよぉ🤥`);
            }
            return interaction.editReply("残念！👮に取り押さえられたが、君はあまりにも無敵すぎて拘束できなかったよぉ🤥");
        }

        // 3. ターゲット選定 (弱者男性と来賓以外)
        const allMembers = await interaction.guild.members.fetch();
        const victims = allMembers.filter(m => 
            !m.user.bot && 
            m.id !== challenger.id && 
            !m.roles.cache.has(ROLE_JAKUSHA) && 
            !m.roles.cache.has(ROLE_RAIHIN)
        );
        
        if (victims.size === 0) return interaction.editReply("ターゲットが見つからないよぉ🤥");

        // 4. 犠牲者数の決定 (1〜10人)
        const rand = Math.random();
        let victimCount = 1;
        if (rand > 0.95) victimCount = 10;
        else if (rand > 0.85) victimCount = 5;
        else if (rand > 0.70) victimCount = 3;
        else if (rand > 0.50) victimCount = 2;

        const selectedVictims = victims.random(Math.min(victimCount, victims.size));
        const victimArray = Array.isArray(selectedVictims) ? selectedVictims : [selectedVictims];

        let resultList = "";
        
        // 5. 制裁実行 (1日〜27日のランダムタイムアウト🤡🔪)
        for (const victim of victimArray) {
            const timeoutMs = Math.floor(Math.random() * (27 * 86400000 - 86400000 + 1)) + 86400000;
            const days = Math.floor(timeoutMs / 86400000);

            if (victim.moderatable) {
                await victim.timeout(timeoutMs, `JOKER: MASS PURGE`).catch(console.error);
                resultList += `・${victim.user.tag} (${days}日間)\n`;
            } else {
                resultList += `・${victim.user.tag} (権限不足により回避)\n`;
            }
        }

        // 🖼️ ターゲット（一人目）のアイコン画像URLを取得して表示🤡💉
        const mainVictimAvatar = victimArray[0].user.displayAvatarURL({ dynamic: true, size: 512 });

        const embed = new EmbedBuilder()
            .setTitle('🤡🔪 JOKER: MASS REAPING')
            .setDescription(`弱者男性 ${challenger} による浄化（タイムアウト）が始まったよぉ🤥💢\n\n**粛清リスト:**\n${resultList}`)
            .setImage(mainVictimAvatar)
            .setColor(0xFF0000) // 真っ赤な警告色
            .setFooter({ text: "反過保護。例外は認めない🤡" })
            .setTimestamp();

        // 公開処刑
        await channel.send({ 
            content: victimArray.map(v => v.toString()).join(' '), 
            embeds: [embed] 
        });
        
        await interaction.deleteReply().catch(() => {});

    } catch (e) { 
        console.error("Joker Error:", e);
        await interaction.editReply("システムエラーだ。運が良かったな🤥").catch(() => {});
    }
}

module.exports = { handleJoker };