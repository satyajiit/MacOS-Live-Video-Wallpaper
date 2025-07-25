#!/bin/bash

# macOS Live Video Wallpaper Setter - Easy Setup Script
# This script handles all dependencies and setup automatically
# Tested on macOS Sequoia 15.5

set -e  # Exit on any error

# Cleanup function to kill background sudo process
cleanup() {
    if [[ -n "$SUDO_PID" ]]; then
        kill "$SUDO_PID" 2>/dev/null || true
    fi
}

# Set trap to cleanup on exit
trap cleanup EXIT

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Emojis for better UX
CHECKMARK="✅"
CROSS="❌"
ARROW="➜"
GEAR="⚙️"
DOWNLOAD="⬇️"
ROCKET="🚀"
WARNING="⚠️"
INFO="ℹ️"

# Function to print colored output
print_header() {
    echo -e "\n${PURPLE}================================${NC}"
    echo -e "${PURPLE}$1${NC}"
    echo -e "${PURPLE}================================${NC}\n"
}

print_success() {
    echo -e "${GREEN}${CHECKMARK} $1${NC}"
}

print_error() {
    echo -e "${RED}${CROSS} $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}${WARNING} $1${NC}"
}

print_info() {
    echo -e "${CYAN}${INFO} $1${NC}"
}

print_step() {
    echo -e "\n${BLUE}${ARROW} $1${NC}"
}

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to get macOS version
get_macos_version() {
    sw_vers -productVersion
}

# Function to check if running on macOS
check_macos() {
    if [[ "$OSTYPE" != "darwin"* ]]; then
        print_error "This script only works on macOS"
        exit 1
    fi
    
    local version=$(get_macos_version)
    print_success "Running on macOS $version"
    
    # Check if it's macOS 10.15 or later
    local major_version=$(echo $version | cut -d. -f1)
    local minor_version=$(echo $version | cut -d. -f2)
    
    if [[ $major_version -lt 10 ]] || [[ $major_version -eq 10 && $minor_version -lt 15 ]]; then
        print_warning "This tool is tested on macOS 10.15+. Your version ($version) may not be fully supported."
        read -p "Do you want to continue anyway? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi
}



# Function to request sudo permissions upfront
request_sudo() {
    print_step "Requesting administrator privileges"
    print_info "This tool needs admin access to:"
    print_info "  • Install dependencies via Homebrew"
    print_info "  • Access system wallpaper directories"
    print_info "  • Install wallpaper files"
    echo

    # Request sudo and keep it alive
    sudo -v

    # Keep sudo alive in background with more frequent refresh
    (
        while true; do
            sleep 30  # Refresh every 30 seconds to be safe
            if ! sudo -n true 2>/dev/null; then
                break  # Exit if sudo is no longer valid
            fi
        done
    ) &
    SUDO_PID=$!

    print_success "Administrator privileges granted"
}

# Function to install Homebrew
install_homebrew() {
    print_step "Checking Homebrew installation"
    
    if command_exists brew; then
        print_success "Homebrew is already installed"
        # Update Homebrew
        print_info "Updating Homebrew..."
        brew update >/dev/null 2>&1 || true
    else
        print_info "Installing Homebrew..."
        /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
        
        # Add Homebrew to PATH for Apple Silicon Macs
        if [[ -f "/opt/homebrew/bin/brew" ]]; then
            echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
            eval "$(/opt/homebrew/bin/brew shellenv)"
        fi
        
        print_success "Homebrew installed successfully"
    fi
}

# Function to install Node.js
install_nodejs() {
    print_step "Checking Node.js installation"
    
    local required_version=14
    local current_version=""
    
    if command_exists node; then
        current_version=$(node --version | sed 's/v//' | cut -d. -f1)
        if [[ $current_version -ge $required_version ]]; then
            print_success "Node.js v$(node --version | sed 's/v//') is already installed"
            return
        else
            print_warning "Node.js v$(node --version | sed 's/v//') is too old (need v$required_version+)"
        fi
    fi
    
    print_info "Installing Node.js via Homebrew..."
    brew install node
    print_success "Node.js installed successfully"
}

# Function to install system dependencies
install_system_deps() {
    print_step "Installing system dependencies"
    
    local deps=("ffmpeg" "yt-dlp")
    
    for dep in "${deps[@]}"; do
        if command_exists "$dep"; then
            print_success "$dep is already installed"
        else
            print_info "Installing $dep..."
            brew install "$dep"
            print_success "$dep installed successfully"
        fi
    done
}

# Function to ensure git is available
ensure_git() {
    print_step "Checking git installation"

    if command_exists git; then
        print_success "git is already installed"
    else
        print_info "Installing git via Homebrew..."
        brew install git
        print_success "git installed successfully"
    fi
}

# Function to clone repository if needed
clone_repository() {
    print_step "Setting up project files"

    if [[ -f "package.json" ]]; then
        print_success "Already in project directory"
        return 0
    fi

    # Check if we're running from curl (no local files)
    if [[ ! -f "setup.sh" ]]; then
        # Ensure git is available before cloning
        ensure_git

        # Handle existing directory more robustly
        local repo_dir="MacOS-Live-Video-Wallpaper"
        if [[ -d "$repo_dir" ]]; then
            print_warning "Directory $repo_dir already exists"
            print_info "Removing existing directory to ensure clean installation..."
            rm -rf "$repo_dir" 2>/dev/null || {
                print_warning "Could not remove directory, trying with sudo..."
                sudo rm -rf "$repo_dir"
            }
        fi

        # Ensure directory is completely gone
        if [[ -d "$repo_dir" ]]; then
            print_error "Failed to remove existing directory $repo_dir"
            exit 1
        fi

        print_info "Cloning repository..."
        if git clone https://github.com/satyajiit/MacOS-Live-Video-Wallpaper.git; then
            print_success "Repository cloned successfully"
        else
            print_error "Failed to clone repository"
            print_info "Trying alternative approach..."
            # Alternative: clone to a temporary name and rename
            local temp_dir="temp-repo-$$"
            git clone https://github.com/satyajiit/MacOS-Live-Video-Wallpaper.git "$temp_dir"
            mv "$temp_dir" "$repo_dir"
            print_success "Repository cloned successfully (alternative method)"
        fi

        # Change to the repository directory and export it
        cd MacOS-Live-Video-Wallpaper
        export REPO_DIR="$(pwd)"
    else
        print_error "package.json not found. Are you in the correct directory?"
        print_info "Please run this script from the MacOS-Live-Video-Wallpaper directory"
        exit 1
    fi
}

# Function to install npm dependencies
install_npm_deps() {
    print_step "Installing Node.js dependencies"

    if [[ ! -f "package.json" ]]; then
        print_error "package.json not found in $(pwd)"
        print_info "Directory contents:"
        ls -la
        exit 1
    fi

    print_info "Running npm install..."
    npm install
    print_success "Node.js dependencies installed successfully"
}

# Function to verify installation
verify_installation() {
    print_step "Verifying installation"
    
    local all_good=true
    
    # Check Node.js
    if command_exists node; then
        print_success "Node.js v$(node --version | sed 's/v//')"
    else
        print_error "Node.js not found"
        all_good=false
    fi
    
    # Check npm
    if command_exists npm; then
        print_success "npm v$(npm --version)"
    else
        print_error "npm not found"
        all_good=false
    fi
    
    # Check ffmpeg
    if command_exists ffmpeg; then
        print_success "ffmpeg installed"
    else
        print_error "ffmpeg not found"
        all_good=false
    fi
    
    # Check yt-dlp
    if command_exists yt-dlp; then
        print_success "yt-dlp installed"
    else
        print_error "yt-dlp not found"
        all_good=false
    fi

    # Check git
    if command_exists git; then
        print_success "git installed"
    else
        print_error "git not found"
        all_good=false
    fi
    
    if [[ "$all_good" == true ]]; then
        print_success "All dependencies verified successfully!"
        return 0
    else
        print_error "Some dependencies are missing"
        return 1
    fi
}

# Function to create launcher script
create_launcher() {
    print_step "Creating easy launcher script"

    cat > run-wallpaper-setter.sh << 'EOF'
#!/bin/bash

# macOS Live Video Wallpaper Setter - Easy Launcher
# Just double-click this file or run: ./run-wallpaper-setter.sh

cd "$(dirname "$0")"

echo "🎥 macOS Live Video Wallpaper Setter"
echo "🚀 Starting application..."
echo

sudo node index.js
EOF

    chmod +x run-wallpaper-setter.sh
    print_success "Created run-wallpaper-setter.sh launcher"
}

# Function to create interactive launcher for curl installations
create_interactive_launcher() {
    print_step "Creating interactive launcher for new terminal"

    cat > launch-interactive.sh << 'EOF'
#!/bin/bash

# macOS Live Video Wallpaper Setter - Interactive Launcher
# This script is designed to run in a new terminal window after curl installation

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo -e "${GREEN}🎥 macOS Live Video Wallpaper Setter${NC}"
echo -e "${CYAN}🚀 Interactive Mode - Ready for input!${NC}"
echo
echo -e "${YELLOW}📍 Working directory: $SCRIPT_DIR${NC}"
echo

# Verify we're in the right place
if [[ ! -f "index.js" ]]; then
    echo -e "${RED}❌ Error: index.js not found in current directory${NC}"
    echo -e "${CYAN}Please navigate to the correct directory and run: sudo node index.js${NC}"
    read -p "Press Enter to exit..."
    exit 1
fi

# Check if sudo is available
if ! sudo -n true 2>/dev/null; then
    echo -e "${YELLOW}🔐 Administrator privileges required for wallpaper installation${NC}"
    echo -e "${CYAN}You'll be prompted for your password...${NC}"
    echo
fi

# Launch the application
echo -e "${GREEN}🚀 Starting macOS Live Video Wallpaper Setter...${NC}"
echo
sudo node index.js

# Keep terminal open after completion
echo
echo -e "${GREEN}✅ Application finished.${NC}"
read -p "Press Enter to close this window..."
EOF

    chmod +x launch-interactive.sh
    print_success "Created launch-interactive.sh for new terminal session"
}

# Function to launch application in new terminal window
launch_in_new_terminal() {
    print_step "Launching in new terminal window"

    local script_path="$(pwd)/launch-interactive.sh"

    # Try different methods to open a new terminal
    if command_exists osascript; then
        # macOS - use AppleScript to open Terminal
        print_info "Opening new Terminal window..."
        osascript << EOF
tell application "Terminal"
    activate
    do script "cd '$PWD' && ./launch-interactive.sh"
end tell
EOF
        print_success "New Terminal window opened with interactive wallpaper setter"
        echo -e "\n${CYAN}${INFO} Look for the new Terminal window that just opened${NC}"
        echo -e "${CYAN}${INFO} The wallpaper setter is now running in interactive mode${NC}"

    elif command_exists open; then
        # Alternative macOS method
        print_info "Opening new terminal session..."
        open -a Terminal "$script_path"
        print_success "New Terminal session started"

    else
        # Fallback - provide manual instructions
        print_warning "Could not automatically open new terminal"
        echo -e "\n${YELLOW}${ARROW} Manual steps:${NC}"
        echo -e "  1. Open a new Terminal window"
        echo -e "  2. Run: ${YELLOW}cd '$PWD'${NC}"
        echo -e "  3. Run: ${YELLOW}./launch-interactive.sh${NC}"
        echo -e "\n${CYAN}${INFO} Or simply run: ${YELLOW}sudo node index.js${NC}"
    fi

    echo -e "\n${GREEN}Setup completed successfully!${NC}"
    echo -e "${CYAN}The wallpaper setter is now ready to use in interactive mode.${NC}"
}

# Function to display completion message
show_completion() {
    print_header "🎉 Setup Complete!"

    echo -e "${GREEN}${ROCKET} Your macOS Live Video Wallpaper Setter is ready to use!${NC}\n"

    echo -e "${CYAN}${ARROW} Quick Start Options:${NC}"
    echo -e "  ${YELLOW}1. Double-click:${NC} run-wallpaper-setter.sh"
    echo -e "  ${YELLOW}2. Terminal:${NC}     sudo node index.js"
    echo -e "  ${YELLOW}3. npm script:${NC}   sudo npm start"
    echo

    echo -e "${CYAN}${ARROW} What happens next:${NC}"
    echo -e "  • You'll be prompted for a YouTube URL"
    echo -e "  • The video will be downloaded and converted"
    echo -e "  • You'll be guided through wallpaper setup"
    echo -e "  • Restart your Mac to see the live wallpaper"
    echo

    echo -e "${CYAN}${ARROW} Useful commands:${NC}"
    echo -e "  • Fix static wallpaper: ${YELLOW}npm run refresh-wallpaper${NC}"
    echo -e "  • Check dependencies:   ${YELLOW}npm run check-deps${NC}"
    echo

    # Detect if we're running from curl (non-interactive setup)
    local is_curl_install=false
    if [[ ! -t 0 ]] || [[ "${SETUP_FROM_CURL:-}" == "true" ]] || [[ -z "${TERM:-}" ]]; then
        is_curl_install=true
    fi

    if [[ "$is_curl_install" == true ]]; then
        # Non-interactive mode (curl | bash) - switch to interactive terminal
        print_info "Detected installation via curl - switching to interactive mode..."
        echo -e "\n${YELLOW}${ARROW} Opening new interactive terminal session...${NC}"
        echo -e "${CYAN}${INFO} This will allow proper input handling for the wallpaper setter${NC}"

        # Create a script to launch in new terminal
        create_interactive_launcher

        # Launch in new terminal window
        launch_in_new_terminal
    else
        # Interactive terminal - show prompt
        echo -n "Would you like to start the wallpaper setter now? (Y/n): "
        read -r REPLY
        echo
        if [[ $REPLY =~ ^[Nn]$ ]]; then
            echo -e "\n${GREEN}Setup complete! Run the application whenever you're ready.${NC}"
        else
            launch_application
        fi
    fi
}

# Function to launch the application
launch_application() {
    echo -e "\n${GREEN}${ROCKET} Launching macOS Live Video Wallpaper Setter...${NC}\n"
    if [[ -f "index.js" ]]; then
        print_info "Starting application with administrator privileges..."
        # Test if sudo is still valid
        if sudo -n true 2>/dev/null; then
            print_info "Using existing sudo session..."
        else
            print_info "Refreshing administrator privileges..."
            sudo -v
        fi
        sudo node index.js
    else
        print_error "index.js not found in $(pwd)"
        print_info "Directory contents:"
        ls -la
        print_info "Please navigate to the correct directory and run: sudo node index.js"
    fi
}

# Main execution
main() {
    # Detect if we're running from curl by checking if we have the setup.sh file locally
    if [[ ! -f "setup.sh" ]] || [[ "${BASH_SOURCE[0]}" == "/dev/fd/"* ]]; then
        export SETUP_FROM_CURL="true"
    fi

    clear
    print_header "🎥 macOS Live Video Wallpaper Setter - Easy Setup"

    echo -e "${CYAN}This script will automatically install all dependencies and set up${NC}"
    echo -e "${CYAN}the macOS Live Video Wallpaper Setter for you.${NC}\n"

    echo -e "${CYAN}${INFO} Tested on macOS Sequoia 15.5${NC}"
    echo -e "${CYAN}${INFO} Compatible with macOS 10.15+${NC}\n"
    
    # Check if running on macOS
    check_macos
    
    # Request sudo permissions upfront
    request_sudo
    
    # Setup project files (handles git installation and directory change)
    clone_repository

    # Ensure we're in the correct directory after cloning
    if [[ -n "$REPO_DIR" ]]; then
        cd "$REPO_DIR"
    fi

    # Install dependencies
    install_homebrew
    install_nodejs
    install_system_deps
    install_npm_deps
    
    # Verify everything is working
    print_info "Verifying installation..."
    if verify_installation; then
        print_info "Creating launcher script..."
        create_launcher
        print_info "Showing completion message..."
        show_completion
    else
        print_error "Setup failed. Please check the errors above and try again."
        exit 1
    fi
}

# Run main function
main "$@"
