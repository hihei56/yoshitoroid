const { EmbedBuilder, MessageFlags } = require('discord.js');
const fs = require('fs');
const path = require('path');

// ロールIDの設定
const ROLE_ONYANOKO = '1477009108279365732'; // おんなにょこ
const ROLE_KENKA = '1477566044712210525';    // 喧嘩自慢
const LOG_FILE = path.join(__dirname, 'dice_logs.json');

const getToday = () => new Date().toLocaleDateString('ja-JP');
const diceFaces = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

async function handleDeathmatch(interaction) {
    try {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        
        const challenger = interaction.member;
        const today = getToday();

        // 🛡️ 管理者・許可ロールは制限をバイパス
        const isAdmin = challenger.permissions.has('Administrator');
        
        let logs = {};
        if (fs.existsSync(LOG_FILE)) {
            try {
                logs = JSON.parse(fs.readFileSync(LOG_FILE, 'utf8'));
            } catch (e) { logs = {}; }
        }
        
        // 管理者でない場合のみ、1日1回制限をチェック
        if (!isAdmin && logs[challenger.id] === today) {
            return interaction.editReply("本日の運試しは既に終了しています。");
        }

        // 1. ダイス判定 (1/6)
        const diceIndex = Math.floor(Math.random() * 6);
        const diceIcon = diceFaces[diceIndex];
        const isHit = (diceIndex === 0);

        // 実行者のみに結果を表示
        await interaction.editReply(`運試しの結果: **${diceIcon}** ${isHit ? '…不穏な予感がします。' : '…平穏な一日のようです。'}`);

        // 2. 的中時：ランダムな生贄を選出
        if (isHit) {
            const allMembers = await interaction.guild.members.fetch();
            // ボットと実行者本人を除外したリスト
            const eligibleMembers = allMembers.filter(m => !m.user.bot && m.id !== challenger.id);
            
            if (eligibleMembers.size > 0) {
                const victim = eligibleMembers.random();
                
                let timeoutMs = 60000; // 一般：1分
                const isVictimRole = victim.roles.cache.has(ROLE_ONYANOKO) || victim.roles.cache.has(ROLE_KENKA);

                if (isVictimRole) {
                    // 被差別ロールなら1日〜28日のランダム
                    const min = 86400000; // 1日
                    const max = 2419200000; // 28日
                    timeoutMs = Math.floor(Math.random() * (max - min + 1)) + min;
                }

                if (victim.moderatable) {
                    await victim.timeout(timeoutMs, '運試しダイスの巻き添え').catch(() => {});
                }

                const days = Math.floor(timeoutMs / (24 * 60 * 60 * 1000));
                const hours = Math.floor(timeoutMs / (60 * 60 * 1000));

                const embed = new EmbedBuilder()
                    .setTitle('💀 判定：的中 (⚀)')
                    .setDescription(`${victim} が本日の犠牲者として選ばれました。\n制限時間: **${days > 0 ? days + '日間' : hours + '時間'}**`)
                    .setThumbnail(victim.user.displayAvatarURL({ size: 512 }))
                    .setColor(0xFF0000)
                    .setTimestamp();

                await interaction.channel.send({ embeds: [embed] }).catch(() => {});
            }
        }

        // 3. ログ保存（管理者は無制限なので、一般ユーザーのみ記録）
        if (!isAdmin) {
            logs[challenger.id] = today;
            fs.writeFileSync(LOG_FILE, JSON.stringify(logs));
        }

    } catch (e) {
        console.error("Dice Error:", e);
        if (interaction.deferred) await interaction.deleteReply().catch(() => {});
    }
}

module.exports = { handleDeathmatch };