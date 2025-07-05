/**
 * Video download and processing functionality for wallpaper setup
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const CONFIG = require('./config');
const logger = require('./logger');
const Utils = require('./utils');

class VideoDownloader {
    constructor() {
        this.downloadSettings = CONFIG.DOWNLOAD_SETTINGS;
        this.isDownloading = false;
        this.currentProcess = null;
    }

    /**
     * Create output filename
     */
    createOutputFilename(info, videoFormat) {
        const quality = `${videoFormat.height}p_${videoFormat.fps || 30}fps`;
        const filename = Utils.createSafeFilename(info.title, quality, this.downloadSettings.mergeOutputFormat);
        return Utils.getOutputPath(filename);
    }

    /**
     * Check if video already exists in outputs (prioritize .mov files)
     */
    checkExistingVideo(outputPath) {
        // First check for .mov version (final format)
        const movPath = outputPath.replace(/\.[^.]+$/, '.mov');
        if (fs.existsSync(movPath)) {
            const stats = fs.statSync(movPath);
            logger.success(`📁 Final .mov video already exists: ${path.basename(movPath)}`);
            logger.stats(`📊 Size: ${Utils.formatFileSize(stats.size)}`);
            return { exists: true, path: movPath, needsConversion: false };
        }

        // Then check for original format (needs conversion)
        if (fs.existsSync(outputPath)) {
            const stats = fs.statSync(outputPath);
            logger.success(`📁 Source video exists: ${path.basename(outputPath)}`);
            logger.stats(`📊 Size: ${Utils.formatFileSize(stats.size)}`);
            logger.info('🔄 Will convert to .mov format for wallpaper compatibility');
            return { exists: true, path: outputPath, needsConversion: true };
        }

        return { exists: false, path: null, needsConversion: false };
    }

    /**
     * Check video quality and warn if below 4K
     */
    checkVideoQuality(videoFormat) {
        const resolution = videoFormat.height;
        const minRecommended = CONFIG.WALLPAPER_SETTINGS.minRecommendedResolution;

        if (resolution < minRecommended) {
            logger.warning(`⚠️  Video quality warning!`);
            logger.warning(`📊 Selected: ${resolution}p (${videoFormat.width}x${resolution})`);
            logger.warning(`🎯 Recommended: ${minRecommended}p for best wallpaper quality`);
            logger.info('💡 Consider finding a higher quality version for better results');
        } else {
            logger.success(`✅ Excellent quality: ${resolution}p - Perfect for wallpaper!`);
        }
    }

    /**
     * Get video duration in seconds
     */
    async getVideoDuration(inputPath) {
        return new Promise((resolve, reject) => {
            const ffprobeProcess = spawn('ffprobe', [
                '-v', 'quiet',
                '-print_format', 'json',
                '-show_format',
                inputPath
            ], { stdio: ['pipe', 'pipe', 'pipe'] });

            let stdout = '';
            let stderr = '';

            ffprobeProcess.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            ffprobeProcess.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            ffprobeProcess.on('close', (code) => {
                if (code === 0) {
                    try {
                        const info = JSON.parse(stdout);
                        const duration = parseFloat(info.format.duration);
                        resolve(duration);
                    } catch (error) {
                        reject(new Error(`Failed to parse video duration: ${error.message}`));
                    }
                } else {
                    reject(new Error(`ffprobe failed: ${stderr}`));
                }
            });

            ffprobeProcess.on('error', (error) => {
                reject(new Error(`ffprobe error: ${error.message}`));
            });
        });
    }

    /**
     * Convert video to .mov format for wallpaper compatibility using HEVC
     */
    async convertToMov(inputPath) {
        const outputPath = inputPath.replace(/\.[^.]+$/, '.mov');

        if (fs.existsSync(outputPath)) {
            logger.success(`📁 HEVC .mov version already exists: ${path.basename(outputPath)}`);
            return outputPath;
        }

        // Check video duration and extend if needed
        const duration = await this.getVideoDuration(inputPath);
        const minDuration = CONFIG.WALLPAPER_SETTINGS.minRecommendedDuration;

        let processedInputPath = inputPath;

        if (duration < minDuration) {
            logger.info(`⏱️  Video duration: ${Utils.formatTime(duration)} (${duration.toFixed(1)}s)`);
            logger.info(`🔄 Extending video to minimum 3 minutes for better wallpaper experience...`);
            processedInputPath = await this.extendVideo(inputPath, minDuration);
        } else {
            logger.info(`⏱️  Video duration: ${Utils.formatTime(duration)} - Perfect for wallpaper!`);
        }

        // Try hardware-accelerated HEVC first, fallback to software if needed
        const convertedPath = await this.convertWithHEVC(processedInputPath, outputPath);

        // Clean up temporary extended file if created
        if (processedInputPath !== inputPath) {
            try {
                fs.unlinkSync(processedInputPath);
                logger.info('🗑️  Cleaned up temporary extended video file');
            } catch (error) {
                logger.warning(`⚠️  Could not clean up temporary file: ${error.message}`);
            }
        }

        // Clean up original MP4 file after successful conversion
        await this.cleanupSourceFile(inputPath, convertedPath);

        return convertedPath;
    }

    /**
     * Extend video by looping it to reach minimum duration
     */
    async extendVideo(inputPath, minDuration) {
        return new Promise(async (resolve, reject) => {
            try {
                const originalDuration = await this.getVideoDuration(inputPath);
                const outputPath = inputPath.replace(/\.[^.]+$/, '_extended.mp4');

                // Calculate how many loops we need
                const loopsNeeded = Math.ceil(minDuration / originalDuration);

                logger.info(`🔄 Creating extended version by looping the video...`);
                logger.info(`📊 Original: ${Utils.formatTime(originalDuration)} → Target: ${Utils.formatTime(minDuration)} (${loopsNeeded} loops)`);

                // Use FFmpeg to loop the video
                const args = [
                    '-stream_loop', '-1', // Loop indefinitely
                    '-i', inputPath,
                    '-t', minDuration.toString(), // Stop at minimum duration
                    '-c', 'copy', // Copy streams without re-encoding for speed
                    '-avoid_negative_ts', 'make_zero',
                    '-fflags', '+genpts', // Generate presentation timestamps
                    '-y', // Overwrite output file
                    outputPath
                ];

                const ffmpegProcess = spawn('ffmpeg', args, {
                    stdio: ['pipe', 'pipe', 'pipe']
                });

                let stderr = '';

                ffmpegProcess.stderr.on('data', (data) => {
                    stderr += data.toString();
                });

                ffmpegProcess.on('close', (code) => {
                    if (code === 0) {
                        if (fs.existsSync(outputPath)) {
                            const stats = fs.statSync(outputPath);
                            logger.success(`✅ Video extended successfully: ${Utils.formatFileSize(stats.size)}`);
                            logger.info(`🎬 Extended duration: ${Utils.formatTime(minDuration)}`);
                            resolve(outputPath);
                        } else {
                            reject(new Error('Extended video file not found after processing'));
                        }
                    } else {
                        reject(new Error(`Video extension failed with code ${code}: ${stderr}`));
                    }
                });

                ffmpegProcess.on('error', (error) => {
                    reject(new Error(`FFmpeg extension error: ${error.message}`));
                });
            } catch (error) {
                reject(new Error(`Failed to get original video duration: ${error.message}`));
            }
        });
    }

    /**
     * Fix file permissions and ownership for converted files
     */
    async fixFilePermissions(filePath) {
        try {
            logger.info(`🔧 Fixing file permissions for: ${path.basename(filePath)}`);

            const success = await Utils.fixFilePermissions(filePath);

            if (success) {
                logger.success('✅ File permissions fixed successfully');
            } else {
                logger.warning('⚠️  Failed to fix file permissions completely');
                logger.info('💡 You may need to run the cleanup utility later');
            }
        } catch (error) {
            logger.warning(`⚠️  Permission fix failed: ${error.message}`);
        }
    }

    /**
     * Clean up source MP4 file after successful conversion to .mov
     */
    async cleanupSourceFile(sourcePath, convertedPath) {
        try {
            // Verify the converted file exists and has reasonable size
            if (!fs.existsSync(convertedPath)) {
                logger.warning('⚠️  Converted file not found, keeping source file');
                return;
            }

            const sourceStats = fs.statSync(sourcePath);
            const convertedStats = fs.statSync(convertedPath);

            // Basic sanity check - converted file should be at least 10% of source size
            if (convertedStats.size < sourceStats.size * 0.1) {
                logger.warning('⚠️  Converted file seems too small, keeping source file for safety');
                return;
            }

            // Only clean up MP4 files (not other formats)
            if (path.extname(sourcePath).toLowerCase() === '.mp4') {
                logger.info(`🗑️  Cleaning up source MP4 file: ${path.basename(sourcePath)}`);

                try {
                    // Try to delete the file
                    fs.unlinkSync(sourcePath);
                    logger.success('✅ Source MP4 file cleaned up successfully');
                } catch (deleteError) {
                    // If deletion fails due to permissions, try to fix permissions first
                    if (deleteError.code === 'EPERM' || deleteError.code === 'EACCES') {
                        logger.info('🔧 Fixing permissions before cleanup...');
                        try {
                            fs.chmodSync(sourcePath, 0o666); // Make writable
                            fs.unlinkSync(sourcePath);
                            logger.success('✅ Source MP4 file cleaned up after permission fix');
                        } catch (secondError) {
                            logger.warning(`⚠️  Could not delete MP4 file: ${secondError.message}`);
                            logger.info('💡 You may need to manually delete the MP4 file later');
                        }
                    } else {
                        throw deleteError; // Re-throw if it's not a permission issue
                    }
                }
            }

        } catch (error) {
            logger.warning(`⚠️  Failed to clean up source file: ${error.message}`);
            logger.info('💡 Source file will be kept for safety');
        }
    }

    /**
     * Convert video using HEVC with hardware acceleration
     */
    async convertWithHEVC(inputPath, outputPath, useFallback = false) {
        return new Promise((resolve, reject) => {
            if (useFallback) {
                logger.convert('🔄 Converting to HEVC .mov format (software encoding)...');
                logger.warning('⚠️  Hardware acceleration not available, using software encoding');
            } else {
                logger.convert('🔄 Converting to HEVC .mov format with hardware acceleration...');
                logger.info('🚀 Using Apple VideoToolbox for optimal performance');
            }

            logger.info('📊 Conversion settings:');
            logger.info('   • Codec: HEVC (H.265) 10-bit');
            logger.info('   • Resolution: 4K (3840x2160)');
            logger.info('   • Frame Rate: 60fps');
            logger.info('   • Bitrate: 50 Mbps');

            const videoCodec = useFallback ? 'libx265' : 'hevc_videotoolbox';
            const pixelFormat = useFallback ? 'yuv420p10le' : 'yuv420p10le';

            const args = [
                '-i', inputPath,
                '-c:v', videoCodec,
                '-c:a', 'aac',
                '-tag:v', 'hvc1', // Ensure proper HEVC tag for QuickTime compatibility
                '-movflags', '+faststart',
                '-pix_fmt', pixelFormat,
                '-r', '60', // Force 60fps for smooth wallpaper
                '-vf', 'scale=3840:2160:flags=lanczos', // Ensure 4K resolution
                '-b:v', '50M', // High bitrate for quality (50 Mbps)
                '-maxrate', '60M',
                '-bufsize', '100M'
            ];

            // Add profile settings for software encoding
            if (useFallback) {
                args.push('-profile:v', 'main10');
                args.push('-level', '5.1');
                args.push('-preset', 'medium'); // Balance between speed and quality
            }

            args.push('-progress', 'pipe:1'); // Enable progress output
            args.push('-y'); // Overwrite output file
            args.push(outputPath);

            const ffmpegProcess = spawn('ffmpeg', args, {
                stdio: ['pipe', 'pipe', 'pipe']
            });

            let videoDuration = null;
            let conversionStartTime = Date.now();

            // Parse stderr for duration and other info
            ffmpegProcess.stderr.on('data', (data) => {
                const output = data.toString();

                // Extract video duration from initial output
                if (!videoDuration && output.includes('Duration:')) {
                    const durationMatch = output.match(/Duration: (\d{2}):(\d{2}):(\d{2})/);
                    if (durationMatch) {
                        const hours = parseInt(durationMatch[1]);
                        const minutes = parseInt(durationMatch[2]);
                        const seconds = parseInt(durationMatch[3]);
                        videoDuration = hours * 3600 + minutes * 60 + seconds;
                    }
                }
            });

            // Parse stdout for progress information
            ffmpegProcess.stdout.on('data', (data) => {
                const output = data.toString();

                // Extract current time from progress output
                if (output.includes('out_time=')) {
                    const timeMatch = output.match(/out_time=(\d{2}):(\d{2}):(\d{2})/);
                    if (timeMatch && videoDuration) {
                        const hours = parseInt(timeMatch[1]);
                        const minutes = parseInt(timeMatch[2]);
                        const seconds = parseInt(timeMatch[3]);
                        const currentTime = hours * 3600 + minutes * 60 + seconds;

                        const progress = Math.min((currentTime / videoDuration) * 100, 100);
                        const elapsed = (Date.now() - conversionStartTime) / 1000;

                        let etaText = '';
                        if (progress > 5) { // Only show ETA after 5% to get better estimate
                            const estimatedTotal = elapsed / (progress / 100);
                            const eta = Math.max(0, estimatedTotal - elapsed);
                            etaText = ` | ETA: ${Utils.formatTime(eta)}`;
                        }

                        const progressBar = Utils.createProgressBar(progress, 20);
                        process.stdout.write(`\r🔄 Converting ${progressBar} | ${timeMatch[0].replace('out_time=', '')}${etaText}`);
                    }
                }
            });

            ffmpegProcess.on('close', (code) => {
                console.log(); // New line after progress

                if (code === 0) {
                    const conversionTime = ((Date.now() - conversionStartTime) / 1000).toFixed(1);
                    logger.success(`✅ HEVC conversion completed in ${conversionTime}s: ${path.basename(outputPath)}`);

                    // Verify output file
                    if (fs.existsSync(outputPath)) {
                        const stats = fs.statSync(outputPath);
                        logger.stats(`📊 HEVC .mov size: ${Utils.formatFileSize(stats.size)}`);
                        logger.info('🎬 Video optimized for macOS live wallpaper with 4K 60fps HEVC');

                        // Fix file permissions and ownership
                        this.fixFilePermissions(outputPath).then(() => {
                            // Permission fixing completed
                        }).catch((error) => {
                            logger.warning(`⚠️  Permission fix failed: ${error.message}`);
                        });

                        resolve(outputPath);
                    } else {
                        reject(new Error('Conversion completed but output file not found'));
                    }
                } else {
                    // If hardware encoding failed and we haven't tried software yet
                    if (!useFallback && (code === 1 || code === 69)) {
                        logger.warning('⚠️  Hardware acceleration failed, trying software encoding...');
                        // Retry with software encoding
                        this.convertWithHEVC(inputPath, outputPath, true)
                            .then(resolve)
                            .catch(reject);
                    } else {
                        reject(new Error(`FFmpeg HEVC conversion failed with code ${code}`));
                    }
                }
            });

            ffmpegProcess.on('error', (error) => {
                // If hardware encoding failed and we haven't tried software yet
                if (!useFallback && error.message.includes('videotoolbox')) {
                    logger.warning('⚠️  Hardware acceleration not available, trying software encoding...');
                    this.convertWithHEVC(inputPath, outputPath, true)
                        .then(resolve)
                        .catch(reject);
                } else {
                    reject(new Error(`FFmpeg error: ${error.message}`));
                }
            });
        });
    }

    /**
     * Setup process cleanup handlers
     */
    setupCleanupHandlers() {
        const cleanup = () => {
            if (this.currentProcess && !this.currentProcess.killed) {
                logger.warning('Cleaning up download process...');
                this.currentProcess.kill('SIGTERM');
            }
            process.exit(0);
        };

        process.on('SIGINT', cleanup);
        process.on('SIGTERM', cleanup);
        process.on('exit', cleanup);
    }

    /**
     * Parse yt-dlp output for progress
     */
    parseDownloadProgress(line) {
        // Remove ANSI escape codes
        const cleanLine = line.replace(/\x1b\[[0-9;]*m/g, '');
        
        // Parse progress
        const progress = Utils.parseProgress(cleanLine);
        if (progress) {
            const progressBar = Utils.createProgressBar(progress.percentage);
            const message = `${progressBar} ${progress.totalSize} at ${progress.speed} ETA ${progress.eta}`;
            logger.progress(message);
            return progress;
        }
        
        // Check for other status messages
        if (cleanLine.includes('[download] Destination:')) {
            const filename = cleanLine.split('Destination:')[1].trim();
            logger.info(`Downloading to: ${filename}`);
        } else if (cleanLine.includes('[download] 100%')) {
            logger.progressComplete('Download completed successfully!');
        } else if (cleanLine.includes('[ffmpeg]')) {
            logger.info('Processing with FFmpeg...');
        } else if (cleanLine.includes('Merging formats')) {
            logger.info('Merging video and audio streams...');
        }
        
        return null;
    }

    /**
     * Download video with progress tracking
     */
    async downloadVideo(url, videoFormat, audioFormat, outputPath) {
        return new Promise((resolve, reject) => {
            logger.header('Starting Download');
            logger.download(`Output: ${outputPath}`);
            
            // Ensure unique filename
            const finalOutputPath = Utils.getUniqueFilename(outputPath);
            if (finalOutputPath !== outputPath) {
                logger.warning(`File exists, using: ${finalOutputPath}`);
            }
            
            // Build yt-dlp arguments
            const args = [
                '-f', `${videoFormat.format_id}+${audioFormat.format_id}`,
                '-o', finalOutputPath,
                '--merge-output-format', this.downloadSettings.mergeOutputFormat,
                '--progress',
                '--newline'
            ];
            
            // Add optional settings
            if (this.downloadSettings.embedSubtitles) {
                args.push('--embed-subs');
            }
            
            if (this.downloadSettings.embedThumbnail) {
                args.push('--embed-thumbnail');
            }
            
            args.push(url);
            
            logger.info(`Command: yt-dlp ${args.join(' ')}`);
            
            // Start download process
            this.currentProcess = spawn('yt-dlp', args, {
                stdio: ['pipe', 'pipe', 'pipe']
            });
            
            this.isDownloading = true;
            
            // Handle stdout (progress)
            this.currentProcess.stdout.on('data', (data) => {
                const lines = data.toString().split('\n');
                lines.forEach(line => {
                    if (line.trim()) {
                        this.parseDownloadProgress(line);
                    }
                });
            });
            
            // Handle stderr (errors and additional info)
            this.currentProcess.stderr.on('data', (data) => {
                const lines = data.toString().split('\n');
                lines.forEach(line => {
                    if (line.trim() && !line.includes('WARNING')) {
                        logger.warning(line.trim());
                    }
                });
            });
            
            // Handle process completion
            this.currentProcess.on('close', (code) => {
                this.isDownloading = false;
                this.currentProcess = null;
                
                if (code === 0) {
                    logger.success('Download completed successfully!');
                    
                    // Check if file exists and show stats
                    const stats = Utils.getFileStats(finalOutputPath);
                    if (stats) {
                        logger.file(`Final file: ${finalOutputPath}`);
                        logger.stats(`File size: ${Utils.formatFileSize(stats.size)}`);
                        logger.stats(`Created: ${stats.birthtime.toLocaleString()}`);
                    }
                    
                    resolve(finalOutputPath);
                } else {
                    reject(new Error(`Download failed with exit code ${code}`));
                }
            });
            
            // Handle process errors
            this.currentProcess.on('error', (err) => {
                this.isDownloading = false;
                this.currentProcess = null;
                reject(new Error(`Download process error: ${err.message}`));
            });
        });
    }

    /**
     * Download with retry logic
     */
    async downloadWithRetry(url, videoFormat, audioFormat, outputPath) {
        let lastError;
        
        for (let attempt = 1; attempt <= this.downloadSettings.retryAttempts; attempt++) {
            try {
                if (attempt > 1) {
                    logger.warning(`Retry attempt ${attempt}/${this.downloadSettings.retryAttempts}`);
                    // Wait a bit before retrying
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
                
                const result = await this.downloadVideo(url, videoFormat, audioFormat, outputPath);
                return result;
                
            } catch (error) {
                lastError = error;
                logger.error(`Attempt ${attempt} failed: ${error.message}`);
                
                if (attempt === this.downloadSettings.retryAttempts) {
                    throw new Error(`Download failed after ${this.downloadSettings.retryAttempts} attempts. Last error: ${error.message}`);
                }
            }
        }
    }

    /**
     * Check if download is in progress
     */
    isDownloadInProgress() {
        return this.isDownloading;
    }

    /**
     * Cancel current download
     */
    cancelDownload() {
        if (this.currentProcess && !this.currentProcess.killed) {
            logger.warning('Cancelling download...');
            this.currentProcess.kill('SIGTERM');
            this.isDownloading = false;
            this.currentProcess = null;
            return true;
        }
        return false;
    }

    /**
     * Complete download and processing workflow for wallpaper
     */
    async performDownload(url, analysis) {
        try {
            // Setup cleanup handlers
            this.setupCleanupHandlers();

            // Check video quality and warn if needed
            this.checkVideoQuality(analysis.videoFormat);

            // Create output filename
            const outputPath = this.createOutputFilename(analysis.info, analysis.videoFormat);

            // Check if video already exists
            const existingCheck = this.checkExistingVideo(outputPath);
            let finalPath;

            if (existingCheck.exists && !existingCheck.needsConversion) {
                // .mov file already exists, we're done
                finalPath = existingCheck.path;
                logger.info('⏭️  Using existing .mov video, no processing needed');
                return finalPath;
            } else if (existingCheck.exists && existingCheck.needsConversion) {
                // Source file exists but needs conversion
                finalPath = existingCheck.path;
                logger.info('⏭️  Skipping download, using existing video for conversion');
            } else {
                // Need to download
                finalPath = await this.downloadWithRetry(
                    url,
                    analysis.videoFormat,
                    analysis.audioFormat,
                    outputPath
                );
                logger.success(`📥 Video downloaded successfully: ${path.basename(finalPath)}`);
            }

            // Convert to .mov format for wallpaper compatibility
            if (this.downloadSettings.convertToMov) {
                const movPath = await this.convertToMov(finalPath);
                return movPath;
            }

            return finalPath;

        } catch (error) {
            logger.error(`❌ Download/processing failed: ${error.message}`);
            throw error;
        }
    }
}

module.exports = VideoDownloader;
