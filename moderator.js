async function handleModerator(message) {
    const content = message.content;
    if (content.includes('自民党支持') || content.includes('高市早苗')) {
        await message.reply('🏺スパイの書き込みかな？🤥💢 膿を出し切りなよぉ🤥🚿');
    }
}
module.exports = { handleModerator };