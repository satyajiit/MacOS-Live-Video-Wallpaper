/**
 * macOS Wallpaper Management System
 * 
 * Handles intelligent wallpaper detection, backup, installation,
 * and System Preferences automation for live video wallpapers.
 */

const fs = require('fs');
const path = require('path');
const { spawn, exec } = require('child_process');
const logger = require('./logger');
const Utils = require('./utils');

class WallpaperManager {
    constructor() {
        this.customerDir = '/Library/Application Support/com.apple.idleassetsd/Customer';
        this.targetDir = path.join(this.customerDir, '4KSDR240FPS');
        this.backupDir = path.join(process.cwd(), 'outputs', 'wallpaper_backups');
        this.retryAttempts = 30; // 30 seconds of checking
        this.retryInterval = 1000; // 1 second intervals
    }

    /**
     * Check if the Customer directory exists and is accessible
     */
    async checkCustomerDirectory() {
        try {
            if (!fs.existsSync(this.customerDir)) {
                logger.error('❌ Customer directory not found');
                logger.info('This usually means macOS wallpaper system is not initialized');
                return false;
            }

            if (!fs.existsSync(this.targetDir)) {
                logger.warning('⚠️  4KSDR240FPS directory not found, creating...');
                fs.mkdirSync(this.targetDir, { recursive: true });
            }

            // Test write permissions
            const testFile = path.join(this.targetDir, '.test_write');
            try {
                fs.writeFileSync(testFile, 'test');
                fs.unlinkSync(testFile);
                logger.success('✅ Customer directory is accessible');
                return true;
            } catch (error) {
                logger.error('❌ No write permissions to Customer directory');
                logger.warning('🔐 This application requires administrator privileges');
                logger.info('💡 Please restart with: sudo node index.js "YOUR_VIDEO_URL"');
                return false;
            }
        } catch (error) {
            logger.error(`❌ Error checking Customer directory: ${error.message}`);
            return false;
        }
    }

    /**
     * Get list of files in the target directory with detailed info
     */
    getExistingWallpapers() {
        try {
            if (!fs.existsSync(this.targetDir)) {
                return [];
            }

            const files = fs.readdirSync(this.targetDir)
                .filter(file => file.endsWith('.mov') || file.endsWith('.mp4'))
                .map(file => {
                    const filePath = path.join(this.targetDir, file);
                    const stats = fs.statSync(filePath);
                    return {
                        name: file,
                        path: filePath,
                        size: stats.size,
                        created: stats.birthtime,
                        modified: stats.mtime
                    };
                })
                .sort((a, b) => b.modified - a.modified); // Sort by most recently modified

            return files;
        } catch (error) {
            logger.error(`Error reading wallpaper directory: ${error.message}`);
            return [];
        }
    }

    /**
     * Check if target directory is empty (needs wallpaper setup)
     */
    isTargetDirectoryEmpty() {
        const wallpapers = this.getExistingWallpapers();
        return wallpapers.length === 0;
    }

    /**
     * Open System Preferences to Wallpaper section
     */
    async openWallpaperSettings() {
        return new Promise((resolve, reject) => {
            logger.info('🔧 Opening System Preferences > Wallpaper...');

            // Use AppleScript to open wallpaper settings
            const script = `
                tell application "System Preferences"
                    activate
                    set current pane to pane "com.apple.preference.desktopscreeneffect"
                end tell
            `;

            exec(`osascript -e '${script}'`, (error, stdout, stderr) => {
                if (error) {
                    logger.warning('Could not open System Preferences automatically');
                    logger.info('Please manually open: System Preferences > Wallpaper');
                    resolve(false);
                } else {
                    logger.success('✅ System Preferences opened');
                    resolve(true);
                }
            });
        });
    }

    /**
     * Open Finder at the wallpaper directory
     */
    async openFinderAtWallpaperDir() {
        return new Promise((resolve) => {
            logger.info('📁 Opening Finder at wallpaper directory...');

            exec(`open "${this.targetDir}"`, (error, stdout, stderr) => {
                if (error) {
                    logger.warning('Could not open Finder automatically');
                    logger.info(`Please manually open: ${this.targetDir}`);
                    resolve(false);
                } else {
                    logger.success('✅ Finder opened at wallpaper directory');
                    resolve(true);
                }
            });
        });
    }

    /**
     * Monitor target directory for new wallpaper files
     */
    async waitForWallpaperSetup() {
        logger.info('🔍 Waiting for you to download a landscape wallpaper...');
        logger.info('📋 Steps:');
        logger.info('   1. In System Preferences > Wallpaper');
        logger.info('   2. Scroll to "Landscape" section');
        logger.info('   3. Download any landscape wallpaper (e.g., "Sonoma Horizon")');
        logger.info('   4. This tool will detect it automatically');
        
        let attempts = 0;
        
        while (attempts < this.retryAttempts) {
            const wallpapers = this.getExistingWallpapers();
            
            if (wallpapers.length > 0) {
                logger.success(`✅ Detected wallpaper: ${wallpapers[0].name}`);
                return wallpapers[0];
            }
            
            // Show progress dots
            process.stdout.write('.');
            await new Promise(resolve => setTimeout(resolve, this.retryInterval));
            attempts++;
        }
        
        console.log(); // New line after dots
        throw new Error('Timeout waiting for wallpaper setup. Please download a landscape wallpaper and try again.');
    }

    /**
     * Create backup of existing wallpaper
     */
    async createBackup(wallpaperFile) {
        try {
            Utils.ensureDirectoryExists(this.backupDir);

            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupName = `${path.parse(wallpaperFile.name).name}_backup_${timestamp}.mov`;
            const backupPath = path.join(this.backupDir, backupName);

            fs.copyFileSync(wallpaperFile.path, backupPath);

            // Fix permissions for the backup file
            logger.info('🔧 Fixing backup file permissions...');
            const permissionFixed = await Utils.fixFilePermissions(backupPath);

            if (permissionFixed) {
                logger.success(`💾 Backup created with proper permissions: ${backupName}`);
            } else {
                logger.success(`💾 Backup created: ${backupName}`);
                logger.warning('⚠️  Backup file may require sudo to delete - run cleanup utility if needed');
            }

            return backupPath;
        } catch (error) {
            logger.warning(`Could not create backup: ${error.message}`);
            return null;
        }
    }

    /**
     * Install video as wallpaper
     */
    async installWallpaper(videoPath, targetWallpaperName) {
        try {
            const targetPath = path.join(this.targetDir, targetWallpaperName);

            logger.info(`🔄 Installing wallpaper: ${targetWallpaperName}`);

            // Copy video to target location
            fs.copyFileSync(videoPath, targetPath);

            // Verify installation
            if (fs.existsSync(targetPath)) {
                const stats = fs.statSync(targetPath);
                logger.success(`✅ Wallpaper installed successfully`);
                logger.stats(`📊 Size: ${Utils.formatFileSize(stats.size)}`);

                // Refresh wallpaper system to ensure animation works
                await this.refreshWallpaperSystem();

                return true;
            } else {
                throw new Error('Installation verification failed');
            }
        } catch (error) {
            logger.error(`❌ Failed to install wallpaper: ${error.message}`);
            return false;
        }
    }

    /**
     * Refresh the wallpaper system to fix animation issues
     */
    async refreshWallpaperSystem() {
        try {
            logger.info('🔄 Refreshing wallpaper system to ensure animation works...');

            // Method 1: Restart the wallpaper daemon
            await this.restartWallpaperDaemon();

            // Method 2: Force refresh through AppleScript
            await this.forceWallpaperRefresh();

            logger.success('✅ Wallpaper system refreshed');
            logger.info('💡 If wallpaper appears static after screen lock, run: npm run refresh-wallpaper');

        } catch (error) {
            logger.warning(`⚠️  Could not refresh wallpaper system: ${error.message}`);
            logger.info('💡 You may need to manually restart your Mac for best results');
        }
    }

    /**
     * Restart the wallpaper daemon
     */
    async restartWallpaperDaemon() {
        return new Promise((resolve) => {
            logger.info('🔄 Restarting wallpaper daemon...');

            const commands = [
                'sudo launchctl unload /System/Library/LaunchDaemons/com.apple.idleassetsd.plist',
                'sudo launchctl load /System/Library/LaunchDaemons/com.apple.idleassetsd.plist'
            ];

            let completed = 0;
            commands.forEach((command, index) => {
                exec(command, (error, stdout, stderr) => {
                    completed++;
                    if (completed === commands.length) {
                        if (error) {
                            logger.warning('⚠️  Could not restart daemon (this is normal on some macOS versions)');
                        } else {
                            logger.success('✅ Wallpaper daemon restarted');
                        }
                        resolve();
                    }
                });
            });
        });
    }

    /**
     * Force wallpaper refresh using multiple methods
     */
    async forceWallpaperRefresh() {
        return new Promise((resolve) => {
            logger.info('🔄 Forcing wallpaper refresh...');

            // Method 1: Desktop refresh via AppleScript
            const script = `
                tell application "System Events"
                    tell every desktop
                        set picture rotation to 0
                        delay 0.5
                        set picture rotation to 1
                        delay 0.5
                        set picture rotation to 0
                    end tell
                end tell
            `;

            exec(`osascript -e '${script}'`, (error, stdout, stderr) => {
                if (error) {
                    // Method 2: Touch wallpaper files as fallback
                    const touchCommand = `find "${this.targetDir}" -name "*.mov" -exec touch {} \\; 2>/dev/null`;
                    exec(touchCommand, (touchError) => {
                        if (touchError) {
                            logger.warning('⚠️  Could not force wallpaper refresh');
                        } else {
                            logger.success('✅ Wallpaper files touched - refresh triggered');
                        }
                        resolve();
                    });
                } else {
                    logger.success('✅ Wallpaper refresh triggered');
                    resolve();
                }
            });
        });
    }

    /**
     * Display wallpaper selection menu and get user choice
     */
    async selectWallpaperFromList(wallpapers) {
        return new Promise((resolve) => {
            const readline = require('readline');
            const rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout
            });

            logger.wallpaper('🖼️  Multiple wallpapers found in directory');
            logger.info('📁 Opening Finder to help you identify the current wallpaper...');

            // Open Finder to help user identify current wallpaper
            this.openFinderAtWallpaperDir();

            console.log();
            logger.info('📋 Available wallpapers:');
            console.log();

            wallpapers.forEach((wallpaper, index) => {
                const createdDate = Utils.formatDate(wallpaper.created);
                const size = Utils.formatFileSize(wallpaper.size);

                console.log(`  ${index + 1}. ${wallpaper.name}`);
                console.log(`     📅 Created: ${createdDate}`);
                console.log(`     📊 Size: ${size}`);
                console.log();
            });

            logger.info('💡 Instructions:');
            logger.info('   1. Check which wallpaper is currently active in System Preferences');
            logger.info('   2. Find the matching file in the Finder window that opened');
            logger.info('   3. Enter the number corresponding to that wallpaper');
            console.log();

            const promptUser = () => {
                rl.question(`🔢 Select wallpaper to replace (1-${wallpapers.length}) or 'c' to cancel: `, (answer) => {
                    if (answer.toLowerCase() === 'c' || answer.toLowerCase() === 'cancel') {
                        rl.close();
                        resolve(null);
                        return;
                    }

                    const choice = parseInt(answer);
                    if (isNaN(choice) || choice < 1 || choice > wallpapers.length) {
                        logger.warning(`❌ Invalid choice. Please enter a number between 1 and ${wallpapers.length}, or 'c' to cancel.`);
                        promptUser();
                        return;
                    }

                    rl.close();
                    resolve(wallpapers[choice - 1]);
                });
            };

            promptUser();
        });
    }

    /**
     * Get user confirmation for wallpaper replacement
     */
    async getUserConfirmation(selectedWallpaper, newVideoPath) {
        return new Promise((resolve) => {
            const readline = require('readline');
            const rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout
            });

            logger.warning(`⚠️  About to replace: ${selectedWallpaper.name}`);
            logger.info(`📊 Current size: ${Utils.formatFileSize(selectedWallpaper.size)}`);

            const newStats = fs.statSync(newVideoPath);
            logger.info(`📊 New video size: ${Utils.formatFileSize(newStats.size)}`);

            rl.question('\n🤔 Proceed with replacement? (y/N): ', (answer) => {
                rl.close();
                resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
            });
        });
    }

    /**
     * Complete wallpaper setup workflow
     */
    async setupWallpaper(videoPath) {
        try {
            logger.header('🖼️  Wallpaper Installation');
            
            // Check directory access
            const hasAccess = await this.checkCustomerDirectory();
            if (!hasAccess) {
                throw new Error('Cannot access wallpaper directory. Please check permissions.');
            }
            
            // Check if directory is empty
            if (this.isTargetDirectoryEmpty()) {
                logger.warning('📭 Wallpaper directory is empty');
                logger.info('🎯 You need to download a landscape wallpaper first');
                
                // Open System Preferences
                await this.openWallpaperSettings();
                
                // Wait for user to setup wallpaper
                const wallpaperFile = await this.waitForWallpaperSetup();
                
                // Create backup
                await this.createBackup(wallpaperFile);
                
                // Install new wallpaper
                const success = await this.installWallpaper(videoPath, wallpaperFile.name);
                return success;
            } else {
                // Directory has existing wallpapers
                const existingWallpapers = this.getExistingWallpapers();

                if (existingWallpapers.length === 0) {
                    logger.warning('📭 No .mov/.mp4 files found in wallpaper directory');
                    logger.info('🎯 You need to download a landscape wallpaper first');

                    // Open System Preferences
                    await this.openWallpaperSettings();

                    // Wait for user to setup wallpaper
                    const wallpaperFile = await this.waitForWallpaperSetup();

                    // Create backup
                    await this.createBackup(wallpaperFile);

                    // Install new wallpaper
                    const success = await this.installWallpaper(videoPath, wallpaperFile.name);
                    return success;
                } else if (existingWallpapers.length === 1) {
                    // Single wallpaper found - use existing logic
                    const targetWallpaper = existingWallpapers[0];

                    // Get user confirmation
                    const confirmed = await this.getUserConfirmation(targetWallpaper, videoPath);

                    if (!confirmed) {
                        logger.info('❌ Wallpaper installation cancelled by user');
                        return false;
                    }

                    // Create backup
                    await this.createBackup(targetWallpaper);

                    // Install new wallpaper
                    const success = await this.installWallpaper(videoPath, targetWallpaper.name);
                    return success;
                } else {
                    // Multiple wallpapers found - let user choose
                    logger.info(`🔍 Found ${existingWallpapers.length} wallpapers in directory`);

                    const selectedWallpaper = await this.selectWallpaperFromList(existingWallpapers);

                    if (!selectedWallpaper) {
                        logger.info('❌ Wallpaper installation cancelled by user');
                        return false;
                    }

                    // Get user confirmation for the selected wallpaper
                    const confirmed = await this.getUserConfirmation(selectedWallpaper, videoPath);

                    if (!confirmed) {
                        logger.info('❌ Wallpaper installation cancelled by user');
                        return false;
                    }

                    // Create backup
                    await this.createBackup(selectedWallpaper);

                    // Install new wallpaper
                    const success = await this.installWallpaper(videoPath, selectedWallpaper.name);
                    return success;
                }
            }
        } catch (error) {
            logger.error(`❌ Wallpaper setup failed: ${error.message}`);
            return false;
        }
    }
}

module.exports = WallpaperManager;
