/**
 * Video information retrieval and analysis
 */

const { spawn } = require('child_process');
const CONFIG = require('./config');
const logger = require('./logger');
const Utils = require('./utils');

class VideoInfoAnalyzer {
    constructor() {
        this.videoPrefs = CONFIG.VIDEO_PREFERENCES;
        this.audioPrefs = CONFIG.AUDIO_PREFERENCES;
    }

    /**
     * Run yt-dlp command and return promise
     */
    runYtDlp(args, options = {}) {
        return new Promise((resolve, reject) => {
            const process = spawn('yt-dlp', args, { 
                stdio: options.silent ? 'pipe' : 'inherit',
                ...options 
            });
            
            let stdout = '';
            let stderr = '';
            
            if (options.silent) {
                process.stdout.on('data', (data) => {
                    stdout += data.toString();
                });
                
                process.stderr.on('data', (data) => {
                    stderr += data.toString();
                });
            }
            
            process.on('close', (code) => {
                if (code === 0) {
                    resolve({ stdout, stderr });
                } else {
                    reject(new Error(`yt-dlp failed with code ${code}: ${stderr}`));
                }
            });
            
            process.on('error', (err) => {
                reject(err);
            });
        });
    }

    /**
     * Get video information from URL
     */
    async getVideoInfo(url) {
        try {
            logger.search('Retrieving video information...');
            
            const result = await this.runYtDlp([
                '--dump-json',
                '--no-download',
                url
            ], { silent: true });
            
            const info = JSON.parse(result.stdout);
            logger.success('Video information retrieved successfully');
            
            return info;
        } catch (error) {
            throw new Error(`Failed to get video info: ${error.message}`);
        }
    }

    /**
     * Display video information
     */
    displayVideoInfo(info) {
        logger.header('Video Information');
        
        logger.video(`Title: ${info.title}`);
        logger.video(`Uploader: ${info.uploader || 'Unknown'}`);
        logger.video(`Duration: ${Utils.formatDuration(info.duration)}`);
        logger.video(`Views: ${Utils.formatNumber(info.view_count)}`);
        logger.video(`Upload Date: ${Utils.formatDate(info.upload_date)}`);
        
        if (info.description) {
            const shortDesc = info.description.substring(0, 100) + (info.description.length > 100 ? '...' : '');
            logger.video(`Description: ${shortDesc}`);
        }
    }

    /**
     * Analyze and filter video formats
     */
    analyzeFormats(formats) {
        logger.search('Analyzing available formats...');
        
        // Filter video formats
        const videoFormats = formats.filter(f => 
            f.vcodec && 
            f.vcodec !== 'none' && 
            f.height && 
            f.ext !== 'mhtml' &&
            this.videoPrefs.preferredFormats.includes(f.ext)
        );
        
        // Filter audio formats
        const audioFormats = formats.filter(f => 
            f.acodec && 
            f.acodec !== 'none' && 
            (!f.vcodec || f.vcodec === 'none') &&
            this.audioPrefs.preferredFormats.includes(f.ext)
        );
        
        logger.stats(`Found ${videoFormats.length} video formats and ${audioFormats.length} audio formats`);
        
        return { videoFormats, audioFormats };
    }

    /**
     * Find best video format based on preferences
     */
    findBestVideoFormat(videoFormats) {
        if (videoFormats.length === 0) {
            throw new Error('No suitable video formats found');
        }
        
        // Group by resolution
        const resolutions = [...new Set(videoFormats.map(f => f.height))].sort((a, b) => b - a);
        const maxResolution = Math.min(resolutions[0], this.videoPrefs.maxResolution);
        
        logger.stats(`Available resolutions: ${resolutions.join('p, ')}p`);
        logger.stats(`Selected resolution: ${maxResolution}p`);
        
        // Filter by max resolution
        const candidateFormats = videoFormats.filter(f => f.height === maxResolution);
        
        // Sort by preferences
        const bestVideo = candidateFormats.sort((a, b) => {
            // Prefer specific formats
            const aFormatScore = this.videoPrefs.preferredFormats.indexOf(a.ext);
            const bFormatScore = this.videoPrefs.preferredFormats.indexOf(b.ext);
            if (aFormatScore !== bFormatScore) {
                return aFormatScore - bFormatScore;
            }
            
            // Prefer higher fps if enabled
            if (this.videoPrefs.preferHighFps) {
                const aFps = a.fps || 30;
                const bFps = b.fps || 30;
                if (aFps !== bFps) {
                    return bFps - aFps;
                }
            }
            
            // Prefer better codecs
            const aCodecScore = this.videoPrefs.preferredCodecs.indexOf(a.vcodec);
            const bCodecScore = this.videoPrefs.preferredCodecs.indexOf(b.vcodec);
            if (aCodecScore !== -1 && bCodecScore !== -1) {
                return aCodecScore - bCodecScore;
            }
            
            // Prefer larger file size (usually better quality)
            return (b.filesize || 0) - (a.filesize || 0);
        })[0];
        
        return bestVideo;
    }

    /**
     * Find best audio format based on preferences
     */
    findBestAudioFormat(audioFormats) {
        if (audioFormats.length === 0) {
            throw new Error('No suitable audio formats found');
        }
        
        // Sort by preferences
        const bestAudio = audioFormats.sort((a, b) => {
            // Prefer specific formats
            const aFormatScore = this.audioPrefs.preferredFormats.indexOf(a.ext);
            const bFormatScore = this.audioPrefs.preferredFormats.indexOf(b.ext);
            if (aFormatScore !== bFormatScore) {
                return aFormatScore - bFormatScore;
            }
            
            // Prefer higher bitrate
            const aBitrate = a.abr || 0;
            const bBitrate = b.abr || 0;
            if (aBitrate !== bBitrate) {
                return bBitrate - aBitrate;
            }
            
            // Prefer better codecs
            const aCodecScore = this.audioPrefs.preferredCodecs.indexOf(a.acodec);
            const bCodecScore = this.audioPrefs.preferredCodecs.indexOf(b.acodec);
            if (aCodecScore !== -1 && bCodecScore !== -1) {
                return aCodecScore - bCodecScore;
            }
            
            return 0;
        })[0];
        
        return bestAudio;
    }

    /**
     * Display selected formats
     */
    displaySelectedFormats(videoFormat, audioFormat) {
        logger.header('Selected Formats');
        
        const videoInfo = [
            `${videoFormat.height}p`,
            `${videoFormat.fps || 30}fps`,
            videoFormat.ext,
            `(${videoFormat.vcodec})`,
            Utils.formatFileSize(videoFormat.filesize)
        ].join(' ');
        
        const audioInfo = [
            `${audioFormat.abr || 'unknown'}kbps`,
            audioFormat.ext,
            `(${audioFormat.acodec})`,
            Utils.formatFileSize(audioFormat.filesize)
        ].join(' ');
        
        logger.video(`Video: ${videoInfo}`);
        logger.audio(`Audio: ${audioInfo}`);
    }

    /**
     * Complete video analysis
     */
    async analyzeVideo(url) {
        try {
            // Get video information
            const info = await this.getVideoInfo(url);
            
            // Display basic info
            this.displayVideoInfo(info);
            
            // Analyze formats
            const { videoFormats, audioFormats } = this.analyzeFormats(info.formats);
            
            // Find best formats
            const bestVideo = this.findBestVideoFormat(videoFormats);
            const bestAudio = this.findBestAudioFormat(audioFormats);
            
            // Display selected formats
            this.displaySelectedFormats(bestVideo, bestAudio);
            
            return {
                info,
                videoFormat: bestVideo,
                audioFormat: bestAudio
            };
            
        } catch (error) {
            logger.error(`Video analysis failed: ${error.message}`);
            throw error;
        }
    }
}

module.exports = VideoInfoAnalyzer;
