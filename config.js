const fs = require('fs');
const SETTINGS_PATH = './settings.json';

function getSettings() {
    if (!fs.existsSync(SETTINGS_PATH)) {
        const initial = { deniedUsers: [] };
        fs.writeFileSync(SETTINGS_PATH, JSON.stringify(initial, null, 2));
        return initial;
    }
    return JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
}

function saveSettings(settings) {
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
}

module.exports = { getSettings, saveSettings };