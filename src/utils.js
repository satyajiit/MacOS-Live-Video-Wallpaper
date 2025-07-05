/**
 * Utility functions for file handling, validation, and formatting
 */

const fs = require('fs');
const path = require('path');
const CONFIG = require('./config');

class Utils {
    /**
     * Format file size in human readable format
     */
    static formatFileSize(bytes) {
        if (!bytes || bytes === 0) return 'Unknown size';
        
        const units = ['B', 'KB', 'MB', 'GB', 'TB'];
        let size = bytes;
        let unitIndex = 0;
        
        while (size >= 1024 && unitIndex < units.length - 1) {
            size /= 1024;
            unitIndex++;
        }
        
        return `${size.toFixed(1)}${units[unitIndex]}`;
    }

    /**
     * Format duration in MM:SS format
     */
    static formatDuration(seconds) {
        if (!seconds) return 'Unknown duration';
        
        const hours = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);
        
        if (hours > 0) {
            return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }
        
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    /**
     * Format number with thousands separator
     */
    static formatNumber(num) {
        if (!num) return 'Unknown';
        return num.toLocaleString();
    }

    /**
     * Create safe filename from title
     */
    static createSafeFilename(title, quality, extension) {
        const config = CONFIG.FILE_NAMING;
        
        // Clean title
        const safeTitle = title
            .replace(config.invalidChars, '')
            .replace(/\s+/g, config.spaceReplacement)
            .substring(0, config.maxTitleLength)
            .trim();
        
        // Create filename
        return config.template
            .replace('{title}', safeTitle)
            .replace('{quality}', quality)
            .replace('{ext}', extension);
    }

    /**
     * Ensure directory exists
     */
    static ensureDirectoryExists(dirPath) {
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
        }
    }

    /**
     * Get file stats if file exists
     */
    static getFileStats(filePath) {
        try {
            if (fs.existsSync(filePath)) {
                return fs.statSync(filePath);
            }
        } catch (error) {
            // File doesn't exist or can't be accessed
        }
        return null;
    }

    /**
     * Validate YouTube URL
     */
    static validateYouTubeUrl(url) {
        const patterns = [
            /^https?:\/\/(www\.)?youtube\.com\/watch\?v=[\w-]+/,
            /^https?:\/\/(www\.)?youtu\.be\/[\w-]+/,
            /^https?:\/\/(www\.)?youtube\.com\/embed\/[\w-]+/,
            /^https?:\/\/(www\.)?youtube\.com\/v\/[\w-]+/
        ];
        
        return patterns.some(pattern => pattern.test(url));
    }

    /**
     * Extract video ID from YouTube URL
     */
    static extractVideoId(url) {
        const patterns = [
            /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([^&\n?#]+)/
        ];
        
        for (const pattern of patterns) {
            const match = url.match(pattern);
            if (match) {
                return match[1];
            }
        }
        
        return null;
    }

    /**
     * Create progress bar string
     */
    static createProgressBar(percentage, width = 30) {
        const filled = Math.round((percentage / 100) * width);
        const empty = width - filled;

        const bar = '█'.repeat(filled) + '░'.repeat(empty);
        return `[${bar}] ${percentage.toFixed(1)}%`;
    }

    /**
     * Format time in seconds to human readable format
     */
    static formatTime(seconds) {
        if (seconds < 60) {
            return `${Math.round(seconds)}s`;
        } else if (seconds < 3600) {
            const mins = Math.floor(seconds / 60);
            const secs = Math.round(seconds % 60);
            return `${mins}m ${secs}s`;
        } else {
            const hours = Math.floor(seconds / 3600);
            const mins = Math.floor((seconds % 3600) / 60);
            const secs = Math.round(seconds % 60);
            return `${hours}h ${mins}m ${secs}s`;
        }
    }

    /**
     * Format date to readable string
     */
    static formatDate(date) {
        const options = {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        };
        return date.toLocaleDateString('en-US', options);
    }

    /**
     * Parse yt-dlp progress output
     */
    static parseProgress(line) {
        // Match yt-dlp progress format: [download]  45.2% of 123.45MiB at 1.23MiB/s ETA 00:30
        const progressMatch = line.match(/\[download\]\s+(\d+\.?\d*)%\s+of\s+([\d.]+\w+)\s+at\s+([\d.]+\w+\/s)(?:\s+ETA\s+(\d+:\d+))?/);
        
        if (progressMatch) {
            return {
                percentage: parseFloat(progressMatch[1]),
                totalSize: progressMatch[2],
                speed: progressMatch[3],
                eta: progressMatch[4] || 'Unknown'
            };
        }
        
        return null;
    }

    /**
     * Sanitize input for shell commands
     */
    static sanitizeInput(input) {
        // Remove potentially dangerous characters
        return input.replace(/[;&|`$(){}[\]]/g, '');
    }

    /**
     * Get output file path
     */
    static getOutputPath(filename) {
        this.ensureDirectoryExists(CONFIG.OUTPUT_DIR);
        return path.join(CONFIG.OUTPUT_DIR, filename);
    }

    /**
     * Check if file already exists and get alternative name
     */
    static getUniqueFilename(basePath) {
        if (!fs.existsSync(basePath)) {
            return basePath;
        }
        
        const dir = path.dirname(basePath);
        const ext = path.extname(basePath);
        const name = path.basename(basePath, ext);
        
        let counter = 1;
        let newPath;
        
        do {
            newPath = path.join(dir, `${name}_${counter}${ext}`);
            counter++;
        } while (fs.existsSync(newPath));
        
        return newPath;
    }

    /**
     * Format date for display
     */
    static formatDate(dateString) {
        if (!dateString) return 'Unknown date';

        try {
            // yt-dlp date format is usually YYYYMMDD
            if (dateString.length === 8) {
                const year = dateString.substring(0, 4);
                const month = dateString.substring(4, 6);
                const day = dateString.substring(6, 8);
                return `${year}-${month}-${day}`;
            }

            return dateString;
        } catch (error) {
            return dateString;
        }
    }

    /**
     * Fix file permissions for files created with sudo
     */
    static async fixFilePermissions(filePath) {
        return new Promise((resolve) => {
            try {
                const {spawn} = require('child_process');

                // Get the original user info when running with sudo
                const originalUser = process.env.SUDO_USER || process.env.USER;
                const originalUid = process.env.SUDO_UID;
                const originalGid = process.env.SUDO_GID;

                if (originalUser && originalUid && originalGid) {
                    // Change ownership back to original user
                    const chownProcess = spawn('chown', [`${originalUid}:${originalGid}`, filePath], {
                        stdio: 'pipe'
                    });

                    chownProcess.on('close', (code) => {
                        if (code === 0) {
                            try {
                                // Set readable/writable permissions for user and group
                                fs.chmodSync(filePath, 0o664); // rw-rw-r--
                                resolve(true);
                            } catch (chmodError) {
                                resolve(false);
                            }
                        } else {
                            resolve(false);
                        }
                    });

                    chownProcess.on('error', () => {
                        resolve(false);
                    });
                } else {
                    // Not running with sudo, just ensure good permissions
                    try {
                        fs.chmodSync(filePath, 0o664); // rw-rw-r--
                        resolve(true);
                    } catch (error) {
                        resolve(false);
                    }
                }
            } catch (error) {
                resolve(false);
            }
        });
    }

    /**
     * Check if file has permission issues (requires sudo to delete)
     */
    static hasPermissionIssues(filePath) {
        try {
            if (!fs.existsSync(filePath)) return false;

            const stats = fs.statSync(filePath);
            const currentUser = process.getuid ? process.getuid() : null;

            // Check if file is owned by root but we're not root
            if (stats.uid === 0 && currentUser !== 0) {
                return true;
            }

            // Check if we can write to the file
            try {
                fs.accessSync(filePath, fs.constants.W_OK);
                return false;
            } catch (error) {
                return true;
            }
        } catch (error) {
            return true;
        }
    }

    /**
     * Find all files with permission issues in a directory
     */
    static findFilesWithPermissionIssues(dirPath, extensions = ['.mov', '.mp4']) {
        const problematicFiles = [];

        try {
            if (!fs.existsSync(dirPath)) return problematicFiles;

            const files = fs.readdirSync(dirPath, {withFileTypes: true});

            for (const file of files) {
                const fullPath = path.join(dirPath, file.name);

                if (file.isDirectory()) {
                    // Recursively check subdirectories
                    problematicFiles.push(...this.findFilesWithPermissionIssues(fullPath, extensions));
                } else if (file.isFile()) {
                    const ext = path.extname(file.name).toLowerCase();
                    if (extensions.includes(ext) && this.hasPermissionIssues(fullPath)) {
                        problematicFiles.push(fullPath);
                    }
                }
            }
        } catch (error) {
            // Directory might not be accessible
        }

        return problematicFiles;
    }
}

module.exports = Utils;
