// Expo's default config handles pnpm workspaces (SDK 52+); kept explicit for clarity.
const { getDefaultConfig } = require('expo/metro-config');
module.exports = getDefaultConfig(__dirname);
