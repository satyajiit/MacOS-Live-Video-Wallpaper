#!/usr/bin/env node

/**
 * macOS Live Video Wallpaper Setter - Production Ready
 *
 * A robust, modular macOS live video wallpaper setter that downloads YouTube videos
 * and automatically sets them as dynamic wallpapers with intelligent automation.
 */

const CONFIG = require('./src/config');
const logger = require('./src/logger');
const dependencyChecker = require('./src/dependencies');
const Utils = require('./src/utils');
const VideoInfoAnalyzer = require('./src/videoInfo');
const VideoDownloader = require('./src/downloader');
const WallpaperManager = require('./src/wallpaperManager');

class MacOSLiveWallpaperSetter {
    constructor() {
        this.analyzer = new VideoInfoAnalyzer();
        this.downloader = new VideoDownloader();
        this.wallpaperManager = new WallpaperManager();
        this.startTime = Date.now();
    }

    /**
     * Display application header
     */
    displayHeader() {
        console.clear();
        logger.header('macOS Live Video Wallpaper Setter v1.0.0');
        console.log();
        logger.info('🎥 Transform YouTube videos into stunning live wallpapers for macOS');
        logger.info('🤖 Intelligent automation with comprehensive error handling');
        console.log();
    }

    /**
     * Get YouTube URL from user interactively
     */
    async getYouTubeUrl() {
        return new Promise((resolve) => {
            const readline = require('readline');
            const rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout
            });

            const promptForUrl = () => {
                console.log();
                logger.info('📺 Supported URL formats:');
                logger.info('   • https://www.youtube.com/watch?v=VIDEO_ID');
                logger.info('   • https://youtu.be/VIDEO_ID');
                logger.info('   • https://www.youtube.com/embed/VIDEO_ID');
                logger.info('   • https://www.youtube.com/v/VIDEO_ID');
                console.log();

                rl.question('🔗 Please enter the YouTube video URL: ', (url) => {
                    const trimmedUrl = url.trim();

                    if (!trimmedUrl) {
                        logger.warning('❌ URL cannot be empty. Please try again.');
                        promptForUrl();
                        return;
                    }

                    // Validate URL
                    if (!Utils.validateYouTubeUrl(trimmedUrl)) {
                        logger.error('❌ Invalid YouTube URL provided');
                        logger.warning('Please provide a valid YouTube video URL and try again.');
                        console.log();
                        promptForUrl();
                        return;
                    }

                    logger.success(`✅ Valid YouTube URL detected: ${Utils.extractVideoId(trimmedUrl)}`);
                    rl.close();
                    resolve(trimmedUrl);
                });
            };

            promptForUrl();
        });
    }

    /**
     * Display final summary
     */
    displaySummary(downloadPath, wallpaperInstalled = false) {
        const totalTime = ((Date.now() - this.startTime) / 1000).toFixed(1);

        logger.header('Wallpaper Setup Summary');
        logger.success(`⏱️  Total time: ${totalTime} seconds`);
        logger.file(`📁 Video saved to: ${downloadPath}`);

        const stats = Utils.getFileStats(downloadPath);
        if (stats) {
            logger.stats(`📊 Final size: ${Utils.formatFileSize(stats.size)}`);
        }

        if (wallpaperInstalled) {
            logger.success('🎉 Live wallpaper installed successfully!');
            console.log();
            logger.info('📋 Next Steps:');
            logger.info('   1. 🔄 Restart your Mac to see the live wallpaper in action');
            logger.info('   2. 🔒 If wallpaper becomes static after screen lock, run: npm run refresh-wallpaper');
            logger.info('   3. 🎬 For best results, ensure your Mac stays plugged in (power saving can pause animation)');
            console.log();
            logger.warning('💡 Common Issue: Live wallpapers may appear static after unlocking from lock screen');
            logger.info('   This is a known macOS behavior - use the refresh utility to fix it');
        } else {
            logger.success('📥 Video download completed successfully!');
        }
    }

    /**
     * Handle application errors
     */
    handleError(error) {
        logger.error(`Application error: ${error.message}`);
        
        // Provide helpful hints based on error type
        if (error.message.includes('yt-dlp')) {
            logger.warning('Make sure yt-dlp is installed and accessible');
            logger.info('Install with: brew install yt-dlp (macOS) or pip install yt-dlp');
        } else if (error.message.includes('ffmpeg')) {
            logger.warning('Make sure ffmpeg is installed and accessible');
            logger.info('Install with: brew install ffmpeg (macOS) or apt install ffmpeg (Ubuntu)');
        } else if (error.message.includes('Video unavailable')) {
            logger.warning('The video might be private, deleted, or region-locked');
        } else if (error.message.includes('network') || error.message.includes('connection')) {
            logger.warning('Check your internet connection and try again');
        }
        
        // Cancel any ongoing download
        if (this.downloader.isDownloadInProgress()) {
            this.downloader.cancelDownload();
        }
        
        process.exit(1);
    }

    /**
     * Setup graceful shutdown handlers
     */
    setupShutdownHandlers() {
        const gracefulShutdown = (signal) => {
            logger.warning(`\nReceived ${signal}. Shutting down gracefully...`);
            
            if (this.downloader.isDownloadInProgress()) {
                logger.info('Cancelling ongoing download...');
                this.downloader.cancelDownload();
            }
            
            logger.info('Cleanup completed. Goodbye!');
            process.exit(0);
        };

        process.on('SIGINT', () => gracefulShutdown('SIGINT'));
        process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
        
        // Handle uncaught exceptions
        process.on('uncaughtException', (error) => {
            logger.error(`Uncaught exception: ${error.message}`);
            this.handleError(error);
        });
        
        process.on('unhandledRejection', (reason, promise) => {
            logger.error(`Unhandled rejection at: ${promise}, reason: ${reason}`);
            this.handleError(new Error(reason));
        });
    }

    /**
     * Main application flow
     */
    async run() {
        try {
            // Display header
            this.displayHeader();
            
            // Setup shutdown handlers
            this.setupShutdownHandlers();
            
            // Get YouTube URL interactively
            const url = await this.getYouTubeUrl();
            
            // Check environment and dependencies
            await dependencyChecker.performFullCheck();
            
            // Analyze video
            const analysis = await this.analyzer.analyzeVideo(url);

            // Perform download and conversion
            const downloadPath = await this.downloader.performDownload(url, analysis);

            // Setup wallpaper
            logger.info('🎯 Starting wallpaper installation process...');
            const wallpaperInstalled = await this.wallpaperManager.setupWallpaper(downloadPath);

            // Display summary
            this.displaySummary(downloadPath, wallpaperInstalled);
            
        } catch (error) {
            this.handleError(error);
        }
    }
}

// Run the application if this file is executed directly
if (require.main === module) {
    const args = process.argv.slice(2);

    // Check for help or cleanup commands
    if (args.includes('--help') || args.includes('-h')) {
        displayUsage();
        process.exit(0);
    }

    if (args.includes('--cleanup') || args.includes('cleanup')) {
        const CleanupUtility = require('./cleanup');
        const cleanup = new CleanupUtility();
        cleanup.run().catch((error) => {
            logger.error(`❌ Cleanup failed: ${error.message}`);
            process.exit(1);
        });
        return;
    }

    const app = new MacOSLiveWallpaperSetter();
    app.run();
}

/**
 * Display usage information
 */
function displayUsage() {
    logger.info('🎬 macOS Live Video Wallpaper Setter');
    logger.info('═══════════════════════════════════════');
    logger.info('');
    logger.info('📋 Usage:');
    logger.info('   node index.js                       (interactive mode)');
    logger.info('   sudo node index.js                  (recommended)');
    logger.info('   node index.js --cleanup             (fix file permissions)');
    logger.info('   node cleanup.js                     (alternative cleanup)');
    logger.info('');
    logger.info('📝 Examples:');
    logger.info('   node index.js                       # Start interactive video downloader');
    logger.info('   sudo node index.js                  # With wallpaper installation');
    logger.info('   node index.js --cleanup             # Fix permission issues');
    logger.info('');
    logger.info('💡 Tips:');
    logger.info('   • Use sudo for automatic wallpaper installation');
    logger.info('   • Videos are converted to 4K 60fps HEVC .mov format');
    logger.info('   • Original files are cleaned up after conversion');
    logger.info('   • Run --cleanup if files require sudo to delete');
    logger.info('   • Supports YouTube, Vimeo, and many other platforms');
    logger.info('');
}

module.exports = MacOSLiveWallpaperSetter;
