#!/bin/bash

# macOS Live Video Wallpaper Setter - Easy Setup Script
# This script handles all dependencies and setup automatically
# Tested on macOS Sequoia 15.5

set -e  # Exit on any error

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
    
    # Keep sudo alive in background
    while true; do sudo -n true; sleep 60; kill -0 "$$" || exit; done 2>/dev/null &
    
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

        # Handle existing directory
        local repo_dir="MacOS-Live-Video-Wallpaper"
        if [[ -d "$repo_dir" ]]; then
            print_warning "Directory $repo_dir already exists"
            print_info "Removing existing directory to ensure clean installation..."
            rm -rf "$repo_dir"
        fi

        print_info "Cloning repository..."
        git clone https://github.com/satyajiit/MacOS-Live-Video-Wallpaper.git
        cd MacOS-Live-Video-Wallpaper
        print_success "Repository cloned successfully"
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
        print_error "package.json not found. This should not happen after repository setup."
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
    
    read -p "Would you like to start the wallpaper setter now? (Y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Nn]$ ]]; then
        echo -e "\n${GREEN}Setup complete! Run the application whenever you're ready.${NC}"
    else
        echo -e "\n${GREEN}${ROCKET} Launching macOS Live Video Wallpaper Setter...${NC}\n"
        sudo node index.js
    fi
}

# Main execution
main() {
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
    
    # Setup project files (handles git installation and restart if needed)
    clone_repository

    # Install dependencies
    install_homebrew
    install_nodejs
    install_system_deps
    install_npm_deps
    
    # Verify everything is working
    if verify_installation; then
        create_launcher
        show_completion
    else
        print_error "Setup failed. Please check the errors above and try again."
        exit 1
    fi
}

# Run main function
main "$@"
