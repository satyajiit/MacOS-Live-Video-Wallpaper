/**
 * Clean and interactive logging system
 */

const CONFIG = require('./config');

class Logger {
    constructor() {
        this.colors = CONFIG.LOGGING.colors;
        this.symbols = CONFIG.LOGGING.symbols;
        this.level = CONFIG.LOGGING.level;
        this.startTime = Date.now();
    }

    /**
     * Get colored text
     */
    colorize(text, color) {
        return `${this.colors[color]}${text}${this.colors.reset}`;
    }

    /**
     * Get elapsed time since logger creation
     */
    getElapsedTime() {
        const elapsed = Date.now() - this.startTime;
        const seconds = (elapsed / 1000).toFixed(1);
        return `[${seconds}s]`;
    }

    /**
     * Format log message with timestamp and symbol
     */
    formatMessage(level, symbol, message) {
        const timestamp = this.getElapsedTime();
        const coloredSymbol = this.colorize(symbol, level);
        const coloredMessage = this.colorize(message, level);
        return `${timestamp} ${coloredSymbol} ${coloredMessage}`;
    }

    /**
     * Info level logging
     */
    info(message) {
        console.log(this.formatMessage('info', this.symbols.info, message));
    }

    /**
     * Success level logging
     */
    success(message) {
        console.log(this.formatMessage('success', this.symbols.success, message));
    }

    /**
     * Warning level logging
     */
    warning(message) {
        console.log(this.formatMessage('warning', this.symbols.warning, message));
    }

    /**
     * Error level logging
     */
    error(message) {
        console.error(this.formatMessage('error', this.symbols.error, message));
    }

    /**
     * Log video information
     */
    video(message) {
        console.log(this.formatMessage('info', this.symbols.video, message));
    }

    /**
     * Log audio information
     */
    audio(message) {
        console.log(this.formatMessage('info', this.symbols.audio, message));
    }

    /**
     * Log file information
     */
    file(message) {
        console.log(this.formatMessage('info', this.symbols.file, message));
    }

    /**
     * Log statistics
     */
    stats(message) {
        console.log(this.formatMessage('info', this.symbols.stats, message));
    }

    /**
     * Log download progress
     */
    download(message) {
        console.log(this.formatMessage('info', this.symbols.download, message));
    }

    /**
     * Log search/analysis
     */
    search(message) {
        console.log(this.formatMessage('info', this.symbols.search, message));
    }

    /**
     * Log wallpaper operations
     */
    wallpaper(message) {
        console.log(this.formatMessage('info', this.symbols.wallpaper, message));
    }

    /**
     * Log backup operations
     */
    backup(message) {
        console.log(this.formatMessage('info', this.symbols.backup, message));
    }

    /**
     * Log installation operations
     */
    install(message) {
        console.log(this.formatMessage('info', this.symbols.install, message));
    }

    /**
     * Log conversion operations
     */
    convert(message) {
        console.log(this.formatMessage('info', this.symbols.convert, message));
    }

    /**
     * Clear current line (for progress updates)
     */
    clearLine() {
        process.stdout.write('\r\x1b[K');
    }

    /**
     * Update progress on same line
     */
    progress(message) {
        this.clearLine();
        process.stdout.write(this.formatMessage('info', this.symbols.download, message));
    }

    /**
     * Finish progress update with newline
     */
    progressComplete(message) {
        this.clearLine();
        this.success(message);
    }

    /**
     * Print a separator line
     */
    separator() {
        console.log(this.colorize('─'.repeat(60), 'info'));
    }

    /**
     * Print header with title
     */
    header(title) {
        console.log();
        this.separator();
        console.log(this.colorize(`  ${title}`, 'info'));
        this.separator();
    }
}

module.exports = new Logger();
