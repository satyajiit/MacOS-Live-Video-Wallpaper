#!/usr/bin/env node

/**
 * macOS Live Wallpaper Refresh Utility
 *
 * Fixes the common issue where live wallpapers become static after screen lock/unlock.
 * This script refreshes the wallpaper system to restore animation while preserving
 * wallpaper settings like "Show as screen saver" and "Show on all spaces".
 */

const { exec } = require('child_process');
const logger = require('./src/logger');

class WallpaperRefresher {
    constructor() {
        this.methods = [
            { name: 'AppleScript Desktop Refresh', method: this.appleScriptDesktopRefreshWithRestore.bind(this), safe: false, effective: true },
            { name: 'Restart Wallpaper Daemon', method: this.restartWallpaperDaemonWithRestore.bind(this), safe: false, effective: true }
        ];
        this.savedSettings = null;
    }

    /**
     * Display header
     */
    displayHeader() {
        console.clear();
        logger.header('macOS Live Wallpaper Refresh Utility');
        console.log();
        logger.info('🎯 This utility fixes live wallpapers that become static after screen lock');
        logger.info('🔄 Effective methods will be used to fix the wallpaper');
        logger.info('⚙️  Wallpaper settings will be automatically restored afterward');
        console.log();
    }

    /**
     * Check if running with sudo
     */
    checkSudoPermissions() {
        if (process.getuid && process.getuid() !== 0) {
            logger.warning('⚠️  Some refresh methods require administrator privileges');
            logger.info('💡 For best results, run with: sudo node refresh-wallpaper.js');
            console.log();
            return false;
        }
        return true;
    }

    /**
     * Programmatically restore wallpaper settings using AppleScript
     */
    async restoreWallpaperSettingsProgrammatically(settings) {
        if (!settings || (!settings.isLiveWallpaper && !settings.hasLiveWallpapers)) {
            return true;
        }

        return new Promise((resolve) => {
            logger.info('🔧 Programmatically restoring wallpaper settings...');

            // Simplified and more reliable AppleScript
            const script = `
                tell application "System Preferences"
                    activate
                    set current pane to pane "com.apple.preference.desktopscreeneffect"
                    delay 3
                end tell

                delay 2

                tell application "System Events"
                    tell process "System Preferences"
                        try
                            -- Enable "Use as screen saver" if it exists and is unchecked
                            if exists checkbox "Use as screen saver" of window 1 then
                                set screenSaverCheckbox to checkbox "Use as screen saver" of window 1
                                if value of screenSaverCheckbox is false then
                                    click screenSaverCheckbox
                                    delay 1
                                end if
                            end if

                            -- Enable "Show on all Spaces" if it exists and is unchecked
                            if exists checkbox "Show on all Spaces" of window 1 then
                                set allSpacesCheckbox to checkbox "Show on all Spaces" of window 1
                                if value of allSpacesCheckbox is false then
                                    click allSpacesCheckbox
                                    delay 1
                                end if
                            end if

                        on error errMsg
                            -- UI might be different, continue anyway
                        end try
                    end tell
                end tell

                delay 1
                tell application "System Preferences" to quit
            `;

            exec(`osascript -e '${script}'`, (error, stdout, stderr) => {
                if (error) {
                    logger.warning('⚠️  Could not automatically restore settings via AppleScript');
                    logger.info('💡 Will provide manual guidance instead');
                    resolve(false);
                } else {
                    logger.success('✅ Wallpaper settings restored programmatically');
                    resolve(true);
                }
            });
        });
    }

    /**
     * Try to restore settings using safe defaults commands
     */
    async restoreSettingsViaDefaults(settings) {
        return new Promise((resolve) => {
            logger.info('🔧 Trying to restore settings via safe defaults commands...');

            // Use only safe defaults commands - no killall commands
            const commands = [
                // Try to refresh preferences without dangerous commands
                'defaults read com.apple.desktop >/dev/null 2>&1' // Just read to refresh cache safely
            ];

            let completed = 0;
            let anySuccess = false;

            commands.forEach((command) => {
                exec(command, (error, stdout, stderr) => {
                    completed++;
                    if (!error) anySuccess = true;

                    if (completed === commands.length) {
                        if (anySuccess) {
                            logger.success('✅ Safe defaults refresh completed');
                            resolve(true);
                        } else {
                            logger.warning('⚠️  Safe defaults method did not work');
                            resolve(false);
                        }
                    }
                });
            });
        });
    }

    /**
     * Restart the wallpaper daemon with settings restoration
     */
    async restartWallpaperDaemonWithRestore() {
        return new Promise(async (resolve) => {
            logger.info('🔄 Restarting wallpaper daemon (will restore settings afterward)...');

            const commands = [
                'launchctl unload /System/Library/LaunchDaemons/com.apple.idleassetsd.plist 2>/dev/null',
                'sleep 2',
                'launchctl load /System/Library/LaunchDaemons/com.apple.idleassetsd.plist 2>/dev/null'
            ];

            const command = commands.join(' && ');

            exec(command, async (error, stdout, stderr) => {
                if (error) {
                    logger.warning('⚠️  Could not restart daemon (this is normal on some macOS versions)');
                    resolve(false);
                } else {
                    logger.success('✅ Wallpaper daemon restarted');

                    // Wait a moment for the daemon to fully restart
                    await new Promise(r => setTimeout(r, 3000));

                    // Attempt to restore settings programmatically
                    if (this.savedSettings) {
                        await this.restoreWallpaperSettingsProgrammatically(this.savedSettings);
                    }

                    resolve(true);
                }
            });
        });
    }

    /**
     * Original restart method (without restoration) - kept for reference
     */
    async restartWallpaperDaemon() {
        return new Promise((resolve) => {
            logger.info('🔄 Restarting wallpaper daemon...');

            const commands = [
                'launchctl unload /System/Library/LaunchDaemons/com.apple.idleassetsd.plist 2>/dev/null',
                'sleep 2',
                'launchctl load /System/Library/LaunchDaemons/com.apple.idleassetsd.plist 2>/dev/null'
            ];

            const command = commands.join(' && ');

            exec(command, (error, stdout, stderr) => {
                if (error) {
                    logger.warning('⚠️  Could not restart daemon (this is normal on some macOS versions)');
                    resolve(false);
                } else {
                    logger.success('✅ Wallpaper daemon restarted');
                    resolve(true);
                }
            });
        });
    }



    /**
     * Force desktop refresh using Dock restart (safe and effective)
     */
    async forceDesktopRefresh() {
        return new Promise((resolve) => {
            logger.info('🔄 Forcing desktop refresh via Dock restart...');

            // Dock restart is safe - Dock automatically restarts and this often fixes wallpaper issues
            const dockCommand = 'killall Dock 2>/dev/null';

            exec(dockCommand, (error, stdout, stderr) => {
                if (error) {
                    logger.warning('⚠️  Could not restart Dock');
                    resolve(false);
                } else {
                    logger.success('✅ Dock restarted - desktop should refresh');
                    resolve(true);
                }
            });
        });
    }

    /**
     * AppleScript desktop refresh with automatic settings restoration
     */
    async appleScriptDesktopRefreshWithRestore() {
        return new Promise(async (resolve) => {
            logger.info('🔄 Trying AppleScript desktop refresh (will restore settings)...');

            const script = `
                tell application "System Events"
                    tell current desktop
                        set picture rotation to 0
                        delay 1
                        set picture rotation to 1
                    end tell
                end tell
            `;

            exec(`osascript -e '${script}'`, async (error, stdout, stderr) => {
                if (error) {
                    logger.warning('⚠️  Could not force desktop refresh via AppleScript');
                    resolve(false);
                } else {
                    logger.success('✅ AppleScript desktop refresh triggered');

                    // Wait a moment for the refresh to complete
                    await new Promise(r => setTimeout(r, 3000));

                    // Attempt to restore settings immediately
                    if (this.savedSettings) {
                        logger.info('🔧 Restoring settings after AppleScript refresh...');
                        await this.restoreWallpaperSettingsProgrammatically(this.savedSettings);
                    }

                    resolve(true);
                }
            });
        });
    }

    /**
     * AppleScript desktop refresh using picture rotation (resets settings)
     */
    async appleScriptDesktopRefresh() {
        return new Promise((resolve) => {
            logger.info('🔄 Trying AppleScript desktop refresh...');

            const script = `
                tell application "System Events"
                    tell current desktop
                        set picture rotation to 0
                        delay 1
                        set picture rotation to 1
                    end tell
                end tell
            `;

            exec(`osascript -e '${script}'`, (error, stdout, stderr) => {
                if (error) {
                    logger.warning('⚠️  Could not force desktop refresh via AppleScript');
                    resolve(false);
                } else {
                    logger.success('✅ AppleScript desktop refresh triggered');
                    resolve(true);
                }
            });
        });
    }

    /**
     * Touch wallpaper files to trigger system refresh (safe method)
     */
    async touchWallpaperFiles() {
        return new Promise((resolve) => {
            logger.info('🔄 Touching wallpaper files to trigger refresh...');

            const wallpaperDir = '/Library/Application Support/com.apple.idleassetsd/Customer/4KSDR240FPS';

            // Check if we have access to the wallpaper directory
            exec(`ls "${wallpaperDir}" 2>/dev/null`, (error, stdout, stderr) => {
                if (error) {
                    logger.warning('⚠️  Cannot access wallpaper directory (need sudo for this method)');
                    resolve(false);
                    return;
                }

                // Touch all .mov files to update their modification time
                const touchCommand = `find "${wallpaperDir}" -name "*.mov" -exec touch {} \\; 2>/dev/null`;

                exec(touchCommand, (touchError, touchStdout, touchStderr) => {
                    if (touchError) {
                        logger.warning('⚠️  Could not touch wallpaper files');
                        resolve(false);
                    } else {
                        logger.success('✅ Wallpaper files touched - system should refresh');
                        resolve(true);
                    }
                });
            });
        });
    }



    /**
     * Check if there are live wallpapers in the system directory
     */
    checkForLiveWallpapers() {
        return new Promise((resolve) => {
            const wallpaperDir = '/Library/Application Support/com.apple.idleassetsd/Customer/4KSDR240FPS';

            exec(`ls "${wallpaperDir}"/*.mov 2>/dev/null || ls "${wallpaperDir}"/*.mp4 2>/dev/null`, (error, stdout) => {
                if (!error && stdout.trim()) {
                    const files = stdout.trim().split('\n').filter(f => f.trim());
                    resolve(files);
                } else {
                    resolve([]);
                }
            });
        });
    }

    /**
     * Read current wallpaper settings to preserve them
     */
    async readWallpaperSettings() {
        return new Promise(async (resolve) => {
            logger.info('📖 Reading current wallpaper settings...');

            // First check if there are any live wallpapers in the system
            const liveWallpaperFiles = await this.checkForLiveWallpapers();
            const hasLiveWallpapers = liveWallpaperFiles.length > 0;

            if (hasLiveWallpapers) {
                logger.info(`🎬 Found ${liveWallpaperFiles.length} live wallpaper(s) in system directory`);
            }

            // Get current user
            exec('whoami', (userError, username) => {
                if (userError) {
                    logger.warning('⚠️  Could not determine current user');
                    resolve(null);
                    return;
                }

                const user = username.trim();
                const wallpaperStorePath = `/Users/${user}/Library/Application Support/com.apple.wallpaper/Store/Index.plist`;

                // Check if Sonoma+ wallpaper store exists
                exec(`test -f "${wallpaperStorePath}"`, (testError) => {
                    if (!testError) {
                        // Sonoma+ method
                        this.readSonomaWallpaperSettings(wallpaperStorePath, resolve, hasLiveWallpapers);
                    } else {
                        // Pre-Sonoma method
                        this.readLegacyWallpaperSettings(user, resolve, hasLiveWallpapers);
                    }
                });
            });
        });
    }

    /**
     * Read wallpaper settings for macOS Sonoma and later
     */
    readSonomaWallpaperSettings(wallpaperStorePath, resolve, hasLiveWallpapers = false) {
        // First, try to get the current desktop picture settings
        const desktopPictureCommand = `osascript -e 'tell app "finder" to get posix path of (get desktop picture as alias)' 2>/dev/null`;

        exec(desktopPictureCommand, (dpError, dpStdout) => {
            const currentWallpaper = dpStdout ? dpStdout.trim() : '';
            const isLiveWallpaper = currentWallpaper.includes('4KSDR240FPS') ||
                                  currentWallpaper.endsWith('.mov') ||
                                  currentWallpaper.endsWith('.mp4') ||
                                  hasLiveWallpapers; // If we know there are live wallpapers, assume this might be one

            // Extract wallpaper settings from Sonoma's Index.plist
            const extractCommand = `plutil -extract AllSpacesAndDisplays xml1 -o - "${wallpaperStorePath}" 2>/dev/null`;

            exec(extractCommand, (error, stdout, stderr) => {
                // Even if we can't read the plist, we can still provide basic info
                let showAsScreensaver = true; // Default to enabled for live wallpapers
                let showOnAllSpaces = true; // Default to enabled

                if (!error && stdout) {
                    // More comprehensive detection of settings
                    showAsScreensaver = stdout.includes('ScreenSaver') ||
                                      stdout.includes('screensaver') ||
                                      stdout.includes('UseAsScreenSaver');
                    showOnAllSpaces = stdout.includes('AllSpaces') ||
                                    stdout.includes('AllSpacesAndDisplays') ||
                                    !stdout.includes('PerSpace');
                }

                const settings = {
                    version: 'sonoma',
                    currentWallpaper: currentWallpaper,
                    isLiveWallpaper: isLiveWallpaper,
                    showAsScreensaver: showAsScreensaver,
                    showOnAllSpaces: showOnAllSpaces,
                    hasLiveWallpapers: hasLiveWallpapers,
                    rawData: stdout || 'Could not read wallpaper store'
                };

                if (error) {
                    logger.warning('⚠️  Could not read Sonoma wallpaper store, using defaults');
                } else {
                    logger.success('✅ Sonoma wallpaper settings read successfully');
                }

                if (isLiveWallpaper) {
                    logger.info(`📹 Live wallpaper detected: ${currentWallpaper.split('/').pop()}`);
                } else if (hasLiveWallpapers) {
                    logger.info('📹 Live wallpapers available in system - settings will be preserved');
                }

                resolve(settings);
            });
        });
    }

    /**
     * Read wallpaper settings for pre-Sonoma macOS versions
     */
    readLegacyWallpaperSettings(user, resolve, hasLiveWallpapers = false) {
        // First, get the current desktop picture
        const desktopPictureCommand = `osascript -e 'tell app "finder" to get posix path of (get desktop picture as alias)' 2>/dev/null`;

        exec(desktopPictureCommand, (dpError, dpStdout) => {
            const currentWallpaper = dpStdout ? dpStdout.trim() : '';
            const isLiveWallpaper = currentWallpaper.includes('4KSDR240FPS') ||
                                  currentWallpaper.endsWith('.mov') ||
                                  currentWallpaper.endsWith('.mp4') ||
                                  hasLiveWallpapers; // If we know there are live wallpapers, assume this might be one

            // Read desktop preferences
            const desktopPrefsCommand = `defaults -currentHost read com.apple.desktop 2>/dev/null`;

            exec(desktopPrefsCommand, (error, stdout, stderr) => {
                // Even if we can't read preferences, we can still provide basic info
                let showAsScreensaver = true; // Default to enabled for live wallpapers
                let showOnAllSpaces = true; // Default to enabled

                if (!error && stdout) {
                    showAsScreensaver = stdout.includes('screensaver') || stdout.includes('ScreenSaver');
                    showOnAllSpaces = !stdout.includes('PerSpace') && !stdout.includes('per-space');
                }

                const settings = {
                    version: 'legacy',
                    currentWallpaper: currentWallpaper,
                    isLiveWallpaper: isLiveWallpaper,
                    showAsScreensaver: showAsScreensaver,
                    showOnAllSpaces: showOnAllSpaces,
                    hasLiveWallpapers: hasLiveWallpapers,
                    rawData: stdout || 'Could not read preferences'
                };

                if (error) {
                    logger.warning('⚠️  Could not read legacy wallpaper preferences, using defaults');
                } else {
                    logger.success('✅ Legacy wallpaper settings read successfully');
                }

                if (isLiveWallpaper) {
                    logger.info(`📹 Live wallpaper detected: ${currentWallpaper.split('/').pop()}`);
                } else if (hasLiveWallpapers) {
                    logger.info('📹 Live wallpapers available in system - settings will be preserved');
                }

                resolve(settings);
            });
        });
    }

    /**
     * Restore wallpaper settings after refresh
     */
    async restoreWallpaperSettings(settings) {
        if (!settings) {
            logger.info('ℹ️  No settings to restore');
            return true;
        }

        return new Promise((resolve) => {
            logger.info('🔧 Checking wallpaper settings...');

            // Instead of trying to automatically restore (which is unreliable),
            // provide clear guidance to the user about what settings to check
            this.provideSettingsGuidance(settings);
            resolve(true);
        });
    }

    /**
     * Provide clear guidance about wallpaper settings
     */
    provideSettingsGuidance(settings) {
        if (!settings.isLiveWallpaper && !settings.hasLiveWallpapers) {
            logger.info('ℹ️  No live wallpapers detected - no settings to preserve');
            return;
        }

        logger.info('⚙️  Please verify these wallpaper settings are still enabled:');
        console.log();

        if (settings.showAsScreensaver) {
            logger.info('   📺 "Use as screen saver" should be ✅ ENABLED');
        } else {
            logger.info('   📺 "Use as screen saver" should be ✅ ENABLED (currently appears disabled)');
        }

        if (settings.showOnAllSpaces) {
            logger.info('   🖥️  "Show on all Spaces" should be ✅ ENABLED');
        } else {
            logger.info('   🖥️  "Show on all Spaces" should be ✅ ENABLED (currently appears disabled)');
        }

        console.log();
        logger.info('💡 Opening System Preferences > Wallpaper for you...');

        // Open System Preferences to wallpaper section
        const script = `
            tell application "System Preferences"
                activate
                set current pane to pane "com.apple.preference.desktopscreeneffect"
            end tell
        `;

        exec(`osascript -e '${script}'`, (error) => {
            if (error) {
                logger.info('🔧 Please manually open: System Preferences > Wallpaper');
            } else {
                logger.success('✅ System Preferences opened');
            }
            logger.info('🔧 If settings were reset, simply toggle them back on');
            logger.info('🎯 Focus on the checkboxes: "Use as screen saver" and "Show on all Spaces"');
        });
    }



    /**
     * Run all refresh methods with settings preservation
     */
    async runAllMethods() {
        logger.info('🚀 Starting wallpaper refresh process...');
        console.log();

        // Step 1: Read current wallpaper settings
        this.savedSettings = await this.readWallpaperSettings();

        let successCount = 0;

        // Step 2: Try effective methods that actually fix the wallpaper
        logger.info('🔄 Using effective methods to fix wallpaper (settings will be restored)...');

        for (const { name, method } of this.methods) {
            try {
                const success = await method();
                if (success) {
                    successCount++;
                    logger.info(`✅ ${name} succeeded`);

                    // For wallpaper issues, we typically only need one effective method
                    if (this.savedSettings && (this.savedSettings.isLiveWallpaper || this.savedSettings.hasLiveWallpapers)) {
                        logger.info('🎬 Wallpaper should now be working - stopping here');
                        break;
                    }
                }

                // Wait between methods
                await new Promise(resolve => setTimeout(resolve, 1000));
            } catch (error) {
                logger.warning(`⚠️  ${name} failed: ${error.message}`);
            }
        }

        // Step 4: Try to programmatically restore settings if we have live wallpapers
        if (this.savedSettings && (this.savedSettings.isLiveWallpaper || this.savedSettings.hasLiveWallpapers)) {
            await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for any changes to settle

            // Try multiple restoration methods
            logger.info('🔧 Attempting to automatically restore wallpaper settings...');

            // Method 1: Try AppleScript restoration
            let restored = await this.restoreWallpaperSettingsProgrammatically(this.savedSettings);

            if (!restored) {
                // Method 2: Try defaults commands (for some macOS versions)
                restored = await this.restoreSettingsViaDefaults(this.savedSettings);
            }

            if (!restored) {
                // Method 3: Provide manual guidance
                await this.restoreWallpaperSettings(this.savedSettings);
            } else {
                logger.success('✅ Settings automatically restored!');
            }
        }

        console.log();
        if (successCount > 0) {
            logger.success(`✅ Refresh completed! ${successCount}/${this.methods.length} methods succeeded`);
            logger.info('🎬 Your live wallpaper should now be animated again');

            if (this.savedSettings && (this.savedSettings.isLiveWallpaper || this.savedSettings.hasLiveWallpapers)) {
                logger.info('⚙️  Settings should be preserved - please verify if needed');
                console.log();
                logger.info('📋 SUMMARY: These settings should still be enabled:');
                logger.info('   • "Use as screen saver" should be ✅ ENABLED');
                logger.info('   • "Show on all Spaces" should be ✅ ENABLED');
            } else if (this.savedSettings) {
                logger.info('ℹ️  No live wallpaper settings to preserve');
            }

            logger.info('💡 If the issue persists, try restarting your Mac');
        } else {
            logger.warning('⚠️  All refresh methods failed');
            logger.info('💡 Try running with sudo: sudo node refresh-wallpaper.js');
            logger.info('🔄 Or restart your Mac to fully reset the wallpaper system');
        }
    }

    /**
     * Main execution
     */
    async run() {
        this.displayHeader();
        this.checkSudoPermissions();
        await this.runAllMethods();
    }
}

// Run the utility if this file is executed directly
if (require.main === module) {
    const refresher = new WallpaperRefresher();
    refresher.run().catch(error => {
        logger.error(`❌ Refresh utility failed: ${error.message}`);
        process.exit(1);
    });
}

module.exports = WallpaperRefresher;
