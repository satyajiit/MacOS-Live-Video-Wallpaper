#!/usr/bin/env node

/**
 * File Cleanup Utility for macOS Live Video Wallpaper
 *
 * This utility helps fix permission issues with .mov files and backups
 * that were created with sudo privileges, making them easily deletable.
 */

const fs = require('fs');
const path = require('path');
const {spawn} = require('child_process');
const logger = require('./src/logger');
const Utils = require('./src/utils');
const CONFIG = require('./src/config');

class CleanupUtility {
    constructor() {
        this.outputDir = CONFIG.OUTPUT_DIR;
        this.backupDir = path.join(this.outputDir, 'wallpaper_backups');
        this.problematicFiles = [];
    }

    /**
     * Main cleanup function
     */
    async run() {
        logger.info('🧹 macOS Live Video Wallpaper - File Cleanup Utility');
        logger.info('═══════════════════════════════════════════════════');

        // Check if running with appropriate permissions
        if (process.getuid && process.getuid() === 0) {
            logger.warning('⚠️  Running as root - will fix ownership for original user');
        }

        // Scan for problematic files
        await this.scanForProblematicFiles();

        if (this.problematicFiles.length === 0) {
            logger.success('✅ No files with permission issues found!');
            logger.info('🎉 All your video files should be easily deletable');
            return;
        }

        // Display found files
        this.displayProblematicFiles();

        // Get user choice
        const action = await this.getUserChoice();

        switch (action) {
            case 'fix':
                await this.fixPermissions();
                break;
            case 'delete':
                await this.deleteFiles();
                break;
            case 'exit':
                logger.info('👋 Cleanup cancelled');
                break;
        }
    }

    /**
     * Scan directories for files with permission issues
     */
    async scanForProblematicFiles() {
        logger.info('🔍 Scanning for files with permission issues...');

        const dirsToScan = [
            this.outputDir,
            this.backupDir
        ];

        for (const dir of dirsToScan) {
            if (fs.existsSync(dir)) {
                logger.info(`📂 Scanning: ${dir}`);
                const files = Utils.findFilesWithPermissionIssues(dir);
                this.problematicFiles.push(...files);
            }
        }

        logger.info(`📊 Found ${this.problematicFiles.length} files with permission issues`);
    }

    /**
     * Display list of problematic files
     */
    displayProblematicFiles() {
        logger.warning('⚠️  Files requiring sudo to delete:');
        logger.info('');

        this.problematicFiles.forEach((filePath, index) => {
            try {
                const stats = fs.statSync(filePath);
                const size = Utils.formatFileSize(stats.size);
                const relativePath = path.relative(process.cwd(), filePath);

                logger.info(`   ${index + 1}. ${relativePath}`);
                logger.info(`      Size: ${size} | Owner: ${stats.uid === 0 ? 'root' : stats.uid}`);
            } catch (error) {
                logger.info(`   ${index + 1}. ${filePath} (error reading stats)`);
            }
        });

        logger.info('');
    }

    /**
     * Get user choice for action
     */
    async getUserChoice() {
        return new Promise((resolve) => {
            const readline = require('readline');
            const rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout
            });

            logger.info('🤔 What would you like to do?');
            logger.info('   1. Fix permissions (make files deletable without sudo)');
            logger.info('   2. Delete all problematic files');
            logger.info('   3. Exit without changes');
            logger.info('');

            rl.question('Enter your choice (1/2/3): ', (answer) => {
                rl.close();

                switch (answer.trim()) {
                    case '1':
                        resolve('fix');
                        break;
                    case '2':
                        resolve('delete');
                        break;
                    case '3':
                    default:
                        resolve('exit');
                        break;
                }
            });
        });
    }

    /**
     * Fix permissions for all problematic files
     */
    async fixPermissions() {
        logger.info('🔧 Fixing file permissions...');

        let successCount = 0;
        let failCount = 0;

        for (const filePath of this.problematicFiles) {
            try {
                logger.info(`🔄 Fixing: ${path.basename(filePath)}`);

                const success = await Utils.fixFilePermissions(filePath);

                if (success) {
                    logger.success(`✅ Fixed: ${path.basename(filePath)}`);
                    successCount++;
                } else {
                    logger.warning(`⚠️  Failed to fix: ${path.basename(filePath)}`);
                    failCount++;
                }
            } catch (error) {
                logger.error(`❌ Error fixing ${path.basename(filePath)}: ${error.message}`);
                failCount++;
            }
        }

        logger.info('');
        logger.info('📊 Permission Fix Summary:');
        logger.success(`✅ Successfully fixed: ${successCount} files`);
        if (failCount > 0) {
            logger.warning(`⚠️  Failed to fix: ${failCount} files`);
            logger.info('💡 You may need to run this utility with sudo for remaining files');
        }
    }

    /**
     * Delete all problematic files
     */
    async deleteFiles() {
        const confirmed = await this.confirmDeletion();

        if (!confirmed) {
            logger.info('👋 Deletion cancelled');
            return;
        }

        logger.info('🗑️  Deleting files...');

        let successCount = 0;
        let failCount = 0;

        for (const filePath of this.problematicFiles) {
            try {
                logger.info(`🗑️  Deleting: ${path.basename(filePath)}`);

                // Try to fix permissions first, then delete
                await Utils.fixFilePermissions(filePath);
                fs.unlinkSync(filePath);

                logger.success(`✅ Deleted: ${path.basename(filePath)}`);
                successCount++;
            } catch (error) {
                logger.error(`❌ Failed to delete ${path.basename(filePath)}: ${error.message}`);
                failCount++;
            }
        }

        logger.info('');
        logger.info('📊 Deletion Summary:');
        logger.success(`✅ Successfully deleted: ${successCount} files`);
        if (failCount > 0) {
            logger.warning(`⚠️  Failed to delete: ${failCount} files`);
            logger.info('💡 You may need to run this utility with sudo for remaining files');
        }
    }

    /**
     * Confirm deletion with user
     */
    async confirmDeletion() {
        return new Promise((resolve) => {
            const readline = require('readline');
            const rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout
            });

            logger.warning('⚠️  This will permanently delete all listed files!');
            logger.info('');

            rl.question('🤔 Are you sure you want to delete these files? (y/N): ', (answer) => {
                rl.close();
                resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
            });
        });
    }
}

// Run the cleanup utility if called directly
if (require.main === module) {
    const cleanup = new CleanupUtility();
    cleanup.run().catch((error) => {
        logger.error(`❌ Cleanup failed: ${error.message}`);
        process.exit(1);
    });
}

module.exports = CleanupUtility;
