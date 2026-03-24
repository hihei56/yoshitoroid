async function handleDeathmatch(message) {
    if (message.content === '!deathmatch') {
        await message.reply('地獄のデスマッチ開始だもん🤥✌ 生き残った奴だけがナマポを貰えるよぉ🤥');
    }
}
module.exports = { handleDeathmatch };