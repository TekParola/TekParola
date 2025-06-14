#!/bin/bash
set -e

echo "🚀 Deploying TekParola SSO System..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
    exit 1
}

# Check prerequisites
command -v node >/dev/null 2>&1 || print_error "Node.js required but not installed"
command -v npm >/dev/null 2>&1 || print_error "npm required but not installed"

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2)
REQUIRED_VERSION="18.0.0"

if [ "$(printf '%s\n' "$REQUIRED_VERSION" "$NODE_VERSION" | sort -V | head -n1)" != "$REQUIRED_VERSION" ]; then
    print_error "Node.js 18+ required. Current: $NODE_VERSION"
fi

print_status "Node.js version check passed: $NODE_VERSION"

# Check if .env file exists
if [ ! -f ".env" ]; then
    print_warning ".env file not found. Creating from template..."
    cp .env.example .env
    print_warning "Please edit .env file with your configuration before continuing"
    read -p "Press Enter to continue after editing .env file..."
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm ci --production --silent
print_status "Dependencies installed"

# Build application
echo "🔨 Building application..."
npm run build
print_status "Application built successfully"

# Run database migrations
echo "🗄️ Setting up database..."
npx prisma generate
npx prisma migrate deploy
print_status "Database migrations completed"

# Seed database if needed
read -p "Do you want to seed the database with initial data? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "🌱 Seeding database..."
    npm run db:seed
    print_status "Database seeded"
fi

# Create systemd service (Linux only)
if command -v systemctl &> /dev/null && [ "$EUID" -eq 0 ]; then
    echo "⚙️ Creating systemd service..."
    
    USER_NAME=${SUDO_USER:-$(whoami)}
    WORK_DIR=$(pwd)
    
    cat > /etc/systemd/system/tekparola.service << EOF
[Unit]
Description=TekParola SSO Service
After=network.target

[Service]
Type=simple
User=$USER_NAME
WorkingDirectory=$WORK_DIR
ExecStart=$(which node) dist/index.js
Restart=on-failure
RestartSec=10
Environment=NODE_ENV=production
EnvironmentFile=$WORK_DIR/.env

[Install]
WantedBy=multi-user.target
EOF

    systemctl daemon-reload
    systemctl enable tekparola
    print_status "Systemd service created and enabled"
    
    echo "To start the service: sudo systemctl start tekparola"
    echo "To check status: sudo systemctl status tekparola"
    echo "To view logs: sudo journalctl -u tekparola -f"
elif command -v systemctl &> /dev/null; then
    print_warning "Run with sudo to create systemd service, or start manually with 'npm start'"
fi

print_status "TekParola SSO deployment completed successfully!"
echo
echo "🌐 Application will be available at: http://localhost:3000"
echo "👨‍💼 Admin panel: http://localhost:3000/admin"
echo "📚 API docs: http://localhost:3000/api/docs"
echo "❤️  Health check: http://localhost:3000/health"
echo
echo "🚀 Start the application:"
echo "  Manual: npm start"
echo "  PM2: pm2 start dist/index.js --name tekparola"
echo "  Docker: docker-compose up -d"
echo
echo "📋 Default admin credentials (change immediately):"
echo "  Email: admin@tekparola.com"
echo "  Password: Admin123!"