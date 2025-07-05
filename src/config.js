/**
 * Configuration and constants for the macOS Live Video Wallpaper Setter
 */

const path = require('path');

const CONFIG = {
    // Output directory for downloaded videos
    OUTPUT_DIR: path.join(process.cwd(), 'outputs'),
    
    // Default video quality preferences
    VIDEO_PREFERENCES: {
        preferredFormats: ['mp4', 'mkv', 'webm'],
        preferredCodecs: ['h264', 'vp9', 'av01'],
        maxResolution: 2160, // 4K
        preferHighFps: true,
        prefer60fps: true
    },
    
    // Audio quality preferences
    AUDIO_PREFERENCES: {
        preferredFormats: ['m4a', 'mp3', 'webm'],
        preferredCodecs: ['aac', 'mp3', 'opus'],
        minBitrate: 128,
        preferredBitrate: 320
    },
    
    // Download settings
    DOWNLOAD_SETTINGS: {
        retryAttempts: 3,
        timeoutSeconds: 300,
        mergeOutputFormat: 'mp4',
        embedSubtitles: false,
        embedThumbnail: false,
        // Wallpaper-specific settings
        convertToMov: true,
        optimizeForWallpaper: true,
        useHEVC: true,
        targetFrameRate: 60,
        targetResolution: '3840x2160'
    },

    // Wallpaper-specific settings
    WALLPAPER_SETTINGS: {
        customerDir: '/Library/Application Support/com.apple.idleassetsd/Customer',
        targetSubDir: '4KSDR240FPS',
        backupDir: 'wallpaper_backups',
        requiredFormat: '.mov',
        minRecommendedResolution: 2160, // 4K
        minRecommendedDuration: 60, // 1 minute in seconds
        maxRetryAttempts: 30,
        retryInterval: 1000
    },
    
    // Logging configuration
    LOGGING: {
        level: process.env.LOG_LEVEL || 'info',
        colors: {
            info: '\x1b[36m',    // Cyan
            success: '\x1b[32m', // Green
            warning: '\x1b[33m', // Yellow
            error: '\x1b[31m',   // Red
            reset: '\x1b[0m'     // Reset
        },
        symbols: {
            info: 'ℹ️',
            success: '✅',
            warning: '⚠️',
            error: '❌',
            download: '⬇️',
            search: '🔍',
            video: '📺',
            audio: '🎵',
            file: '📁',
            stats: '📊',
            wallpaper: '🖼️',
            backup: '💾',
            install: '🔧',
            convert: '🔄'
        }
    },
    
    // Required dependencies
    DEPENDENCIES: {
        'yt-dlp': {
            command: 'yt-dlp',
            args: ['--version'],
            installHint: 'Install with: brew install yt-dlp (macOS) or pip install yt-dlp'
        },
        'ffmpeg': {
            command: 'ffmpeg',
            args: ['-version'],
            installHint: 'Install with: brew install ffmpeg (macOS) or apt install ffmpeg (Ubuntu)'
        }
    },
    
    // File naming patterns
    FILE_NAMING: {
        maxTitleLength: 50,
        invalidChars: /[^\w\s-]/g,
        spaceReplacement: '_',
        template: '{title}_{quality}.{ext}'
    }
};

module.exports = CONFIG;
