# Nodus Development Container
# For development environment only - not for production builds

FROM rust:1.75-bookworm

# Install system dependencies
RUN apt-get update && apt-get install -y \
    # Tauri dependencies
    libwebkit2gtk-4.1-dev \
    libgtk-3-dev \
    libayatana-appindicator3-dev \
    librsvg2-dev \
    # Node.js
    curl \
    # Build tools
    build-essential \
    pkg-config \
    libssl-dev \
    # SQLite
    sqlite3 \
    libsqlite3-dev \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js 20
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs

# Install Tauri CLI
RUN cargo install tauri-cli

# Set working directory
WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./

# Install Node dependencies
RUN npm install

# Copy Rust files
COPY src-tauri/Cargo.toml src-tauri/Cargo.lock* ./src-tauri/

# Pre-fetch Rust dependencies
WORKDIR /app/src-tauri
RUN mkdir -p src && echo "fn main() {}" > src/main.rs && cargo fetch
RUN rm -rf src

WORKDIR /app

# Default command
CMD ["npm", "run", "tauri:dev"]
