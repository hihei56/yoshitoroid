const fs = require('fs');
const path = require('path');
const EXCLUDE_FILE = path.join(__dirname, 'mod_exclude_list.json');

function getModExcludeList() {
    if (!fs.existsSync(EXCLUDE_FILE)) return [];
    try {
        return JSON.parse(fs.readFileSync(EXCLUDE_FILE, 'utf8'));
    } catch (e) { return []; }
}

function updateModExcludeList(userId, action) {
    let list = getModExcludeList();
    if (action === 'add') {
        if (!list.includes(userId)) list.push(userId);
    } else if (action === 'remove') {
        list = list.filter(id => id !== userId);
    }
    fs.writeFileSync(EXCLUDE_FILE, JSON.stringify(list, null, 2));
    return list;
}

module.exports = { getModExcludeList, updateModExcludeList };