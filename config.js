const fs = require('fs');
const path = require('path');
const settingsPath = path.join(__dirname, 'settings.json');

function getSettings() {
    if (!fs.existsSync(settingsPath)) {
        const defaultSettings = { allowedRoles: [], deniedRoles: [], allowedUsers: [], deniedUsers: [] };
        fs.writeFileSync(settingsPath, JSON.stringify(defaultSettings, null, 2));
        return defaultSettings;
    }
    return JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
}

function saveSettings(settings) {
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
}

module.exports = { getSettings, saveSettings };