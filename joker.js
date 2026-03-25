const { EmbedBuilder, MessageFlags } = require('discord.js');

const ROLE_JAKUSHA = '1476944370694488134'; // 実行権限 & 免除
const ROLE_RAIHIN = '1478715790575538359';  // 免除

async function handleJoker(interaction) {
    try {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        const challenger = interaction.member;
        const channel = interaction.channel;

        // 1. 実行権限チェック
        if (!challenger.roles.cache.has(ROLE_JAKUSHA)) {
            return interaction.editReply("🤡「弱者男性」以外がジョーカーを語るなよぉ🤥💢");
        }

        // ====================================
        // 🤡 2. 自爆判定（65%）
        // ====================================
        if (Math.random() < 0.65) {
            if (challenger.moderatable) {

                // ⏱️ 1分〜15分
                const selfTimeoutMs =
                    Math.floor(Math.random() * (15 * 60000 - 60000 + 1)) + 60000;

                const mins = Math.floor(selfTimeoutMs / 60000);

                await challenger.timeout(selfTimeoutMs, 'JOKER: BACKFIRE').catch(() => {});

                return interaction.editReply(
                    `🤡💥 ほぼ負けイベント！ ${challenger.displayName} は ${mins}分 拘束されたよぉ🤥`
                );
            }

            return interaction.editReply(
                "🤡💥 自爆したけど拘束できなかったよぉ🤥"
            );
        }

        // ====================================
        // 🎯 3. ターゲット選定（完全修正版）
        // ====================================
        const allMembers = await interaction.guild.members.fetch();

        const victims = allMembers.filter(m => {
            if (m.user.bot) return false;
            if (m.id === challenger.id) return false;

            // 🔥 免除ロール
            if (m.roles.cache.has(ROLE_JAKUSHA)) return false;
            if (m.roles.cache.has(ROLE_RAIHIN)) return false;

            return true;
        });

        if (victims.size === 0) {
            return interaction.editReply("ターゲットが見つからないよぉ🤥");
        }

        // 🎯 1人だけ選択
        const victim = victims.random();

        // ====================================
        // 🔪 4. 制裁実行
        // ====================================
        const timeoutMs =
            Math.floor(Math.random() * (27 * 86400000 - 86400000 + 1)) + 86400000;

        const days = Math.floor(timeoutMs / 86400000);

        let resultText = "";

        if (victim.moderatable) {
            await victim.timeout(timeoutMs, `JOKER: SINGLE PURGE`).catch(console.error);
            resultText = `・${victim.user.tag} (${days}日間)`;
        } else {
            resultText = `・${victim.user.tag} (権限不足により回避)`;
        }

        // ====================================
        // 🖼️ 5. Embed生成
        // ====================================
        const avatar = victim.user.displayAvatarURL({ dynamic: true, size: 512 });

        const embed = new EmbedBuilder()
            .setTitle('🤡🔪 JOKER: SINGLE REAPING')
            .setDescription(
                `弱者男性 ${challenger.displayName} による浄化が始まったよぉ🤥💢\n\n**対象:**\n${resultText}`
            )
            .setImage(avatar)
            .setColor(0xFF0000)
            .setFooter({ text: "反過保護。例外は認めない🤡" })
            .setTimestamp();

        // ====================================
        // 📢 6. 公開処刑（メンションあり）
        // ====================================
        await channel.send({
            content: victim.toString(), // 1人だけ
            embeds: [embed],
            allowedMentions: { users: [victim.id] } // ← 無駄な通知防止（対象のみ）
        });

        // 自分のコマンドメッセージ消す
        await interaction.deleteReply().catch(() => {});

    } catch (e) {
        console.error("Joker Error:", e);
        await interaction.editReply("システムエラーだ。運が良かったな🤥").catch(() => {});
    }
}

module.exports = { handleJoker };