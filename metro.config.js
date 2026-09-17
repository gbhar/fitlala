// Learn more: https://docs.expo.dev/guides/customizing-metro/
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Bundle .tflite models as assets.
config.resolver.assetExts.push('tflite');

module.exports = config;
