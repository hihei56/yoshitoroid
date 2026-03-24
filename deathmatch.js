function isPrime(num) {
    if (num <= 1) return false;
    for (let i = 2; i <= Math.sqrt(num); i++) if (num % i === 0) return false;
    return true;
}

async function handleDeathmatch(message) {
    const numMatch = message.content.match(/\d+/);
    if (!numMatch) return;
    const num = parseInt(numMatch[0], 10);
    if (isPrime(num)) {
        try {
            await message.member.setNickname(`素数死闘-${num}`);
            await message.reply(`${num}は素数。`);
        } catch (e) { console.error('Nickname update failed'); }
    }
}
module.exports = { handleDeathmatch };