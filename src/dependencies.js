/**
 * Environment and dependency checking
 */

const { spawn } = require('child_process');
const CONFIG = require('./config');
const logger = require('./logger');

class DependencyChecker {
    constructor() {
        this.dependencies = CONFIG.DEPENDENCIES;
    }

    /**
     * Run a command and return promise
     */
    runCommand(command, args = []) {
        return new Promise((resolve, reject) => {
            const process = spawn(command, args, { 
                stdio: 'pipe',
                shell: true 
            });
            
            let stdout = '';
            let stderr = '';
            
            process.stdout.on('data', (data) => {
                stdout += data.toString();
            });
            
            process.stderr.on('data', (data) => {
                stderr += data.toString();
            });
            
            process.on('close', (code) => {
                if (code === 0) {
                    resolve({ stdout, stderr, code });
                } else {
                    reject(new Error(`Command '${command}' failed with code ${code}: ${stderr}`));
                }
            });
            
            process.on('error', (err) => {
                reject(err);
            });
        });
    }

    /**
     * Check if a single dependency is available
     */
    async checkDependency(name, config) {
        try {
            const result = await this.runCommand(config.command, config.args);
            
            // Extract version from output if possible
            let version = 'unknown';
            const versionMatch = result.stdout.match(/(\d+\.\d+\.\d+)/);
            if (versionMatch) {
                version = versionMatch[1];
            }
            
            return {
                name,
                available: true,
                version,
                command: config.command
            };
        } catch (error) {
            return {
                name,
                available: false,
                error: error.message,
                installHint: config.installHint,
                command: config.command
            };
        }
    }

    /**
     * Check all dependencies
     */
    async checkAllDependencies() {
        logger.header('Checking Dependencies');
        
        const results = [];
        const dependencyNames = Object.keys(this.dependencies);
        
        for (const name of dependencyNames) {
            logger.info(`Checking ${name}...`);
            const result = await this.checkDependency(name, this.dependencies[name]);
            results.push(result);
            
            if (result.available) {
                logger.success(`${name} v${result.version} - Available`);
            } else {
                logger.error(`${name} - Not available`);
                logger.warning(`Install hint: ${result.installHint}`);
            }
        }
        
        return results;
    }

    /**
     * Validate all dependencies are available
     */
    async validateEnvironment() {
        const results = await this.checkAllDependencies();
        const missing = results.filter(r => !r.available);
        
        if (missing.length > 0) {
            logger.error('Missing required dependencies:');
            missing.forEach(dep => {
                logger.error(`  - ${dep.name}: ${dep.installHint}`);
            });
            
            throw new Error(`Missing ${missing.length} required dependencies. Please install them and try again.`);
        }
        
        logger.success('All dependencies are available!');
        return results;
    }

    /**
     * Check Node.js version
     */
    checkNodeVersion() {
        const nodeVersion = process.version;
        const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);

        logger.info(`Node.js version: ${nodeVersion}`);

        if (majorVersion < 14) {
            logger.warning('Node.js version is older than 14. Some features may not work correctly.');
            return false;
        }

        logger.success('Node.js version is compatible');
        return true;
    }

    /**
     * Check if running with sudo privileges
     */
    checkSudoPrivileges() {
        const isRoot = process.getuid && process.getuid() === 0;
        const hasSudo = process.env.SUDO_USER !== undefined;

        if (isRoot || hasSudo) {
            logger.success('✅ Running with elevated privileges');
            if (process.env.SUDO_USER) {
                logger.info(`🔐 Original user: ${process.env.SUDO_USER}`);
            }
            return true;
        }

        return false;
    }

    /**
     * Prompt user to restart with sudo if needed
     */
    promptForSudo() {
        logger.warning('🔐 This application requires administrator privileges to access system wallpaper directories');
        logger.info('📋 Please restart the application with sudo:');
        logger.info('');
        logger.info(`   sudo ${process.argv.join(' ')}`);
        logger.info('');
        logger.info('💡 This is required to:');
        logger.info('   • Access /Library/Application Support/com.apple.idleassetsd/Customer');
        logger.info('   • Install wallpaper files in the system directory');
        logger.info('   • Create backups of existing wallpapers');
        logger.info('');
        logger.info('🔒 Note: Your downloads will be saved to the outputs/ directory with proper ownership');

        throw new Error('Administrator privileges required. Please restart with sudo.');
    }

    /**
     * Check system resources
     */
    async checkSystemResources() {
        logger.info('Checking system resources...');
        
        // Check available disk space (basic check)
        try {
            const fs = require('fs');
            const stats = fs.statSync(CONFIG.OUTPUT_DIR);
            logger.success('Output directory is accessible');
        } catch (error) {
            logger.warning(`Output directory not accessible: ${error.message}`);
        }
        
        // Check memory (basic)
        const totalMem = Math.round(require('os').totalmem() / 1024 / 1024 / 1024);
        logger.info(`Total system memory: ${totalMem}GB`);
        
        if (totalMem < 4) {
            logger.warning('Low system memory detected. Large video downloads may be slow.');
        }
    }

    /**
     * Complete environment check including sudo privileges
     */
    async performFullCheck() {
        try {
            logger.header('Environment Check');

            // Check sudo privileges first
            if (!this.checkSudoPrivileges()) {
                this.promptForSudo();
            }

            // Check Node.js version
            this.checkNodeVersion();

            // Check system resources
            await this.checkSystemResources();

            // Check dependencies
            await this.validateEnvironment();

            logger.success('Environment check completed successfully!');
            return true;

        } catch (error) {
            logger.error(`Environment check failed: ${error.message}`);
            throw error;
        }
    }
}

module.exports = new DependencyChecker();
