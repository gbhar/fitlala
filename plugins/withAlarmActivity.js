/**
 * Expo config plugin: let MainActivity appear over the lock screen and turn
 * the screen on — so tapping the alarm notification (or a full-screen intent)
 * puts the ringing UI in front of a sleeping user without unlocking.
 */
const { withAndroidManifest } = require('expo/config-plugins');

module.exports = function withAlarmActivity(config) {
  return withAndroidManifest(config, (cfg) => {
    const app = cfg.modResults.manifest.application?.[0];
    const activities = app?.activity ?? [];
    const main = activities.find(
      (a) => a.$['android:name'] === '.MainActivity',
    );
    if (main) {
      main.$['android:showWhenLocked'] = 'true';
      main.$['android:turnScreenOn'] = 'true';
    }
    return cfg;
  });
};
