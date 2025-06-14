# TekParola SSO - Deployment Guide

## Table of Contents
1. [Prerequisites](#prerequisites)
2. [Environment Setup](#environment-setup)
3. [Database Setup](#database-setup)
4. [Redis Setup](#redis-setup)
5. [Application Deployment](#application-deployment)
6. [Docker Deployment](#docker-deployment)
7. [Kubernetes Deployment](#kubernetes-deployment)
8. [Production Configuration](#production-configuration)
9. [SSL/TLS Configuration](#ssltls-configuration)
10. [Monitoring and Logging](#monitoring-and-logging)
11. [Backup and Recovery](#backup-and-recovery)
12. [Troubleshooting](#troubleshooting)

## Prerequisites

### System Requirements
- Node.js 18.x or higher
- PostgreSQL 15.x or higher
- Redis 7.x or higher
- Docker (optional)
- Kubernetes cluster (optional)
- Minimum 2GB RAM
- 10GB disk space

### Required Tools
```bash
# Check Node.js version
node --version  # Should be >= 18.0.0

# Check npm version
npm --version   # Should be >= 8.0.0

# Check PostgreSQL version
psql --version  # Should be >= 15.0

# Check Redis version
redis-server --version  # Should be >= 7.0
```

## Environment Setup

### 1. Clone the Repository
```bash
git clone https://github.com/tekparola/sso.git
cd sso
```

### 2. Install Dependencies
```bash
npm ci --production
```

### 3. Environment Configuration
Create a `.env` file in the root directory:

```bash
cp .env.example .env
```

Edit the `.env` file with your production values:

```env
# Application
NODE_ENV=production
PORT=3000
APP_URL=https://sso.yourdomain.com

# Database
DATABASE_URL=postgresql://username:password@localhost:5432/tekparola

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your-redis-password
REDIS_URL=redis://:your-redis-password@localhost:6379

# Security
JWT_SECRET=your-super-secret-jwt-key-minimum-32-chars
JWT_REFRESH_SECRET=your-super-secret-refresh-key-minimum-32-chars
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
SESSION_SECRET=your-session-secret-minimum-32-chars

# Email
SMTP_HOST=smtp.your-provider.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-smtp-username
SMTP_PASS=your-smtp-password
FROM_EMAIL=noreply@yourdomain.com
FROM_NAME=TekParola SSO

# OAuth2
OAUTH2_ISSUER=https://sso.yourdomain.com
OAUTH2_AUTHORIZATION_ENDPOINT=https://sso.yourdomain.com/api/v1/oauth/authorize
OAUTH2_TOKEN_ENDPOINT=https://sso.yourdomain.com/api/v1/oauth/token
OAUTH2_INTROSPECTION_ENDPOINT=https://sso.yourdomain.com/api/v1/oauth/introspect

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Monitoring
MONITORING_ENABLED=true
METRICS_PORT=9090
```

## Database Setup

### 1. Create Database
```bash
sudo -u postgres psql
CREATE DATABASE tekparola;
CREATE USER tekparola WITH ENCRYPTED PASSWORD 'your-secure-password';
GRANT ALL PRIVILEGES ON DATABASE tekparola TO tekparola;
\q
```

### 2. Run Migrations
```bash
npm run migrate:deploy
```

### 3. Seed Initial Data (Optional)
```bash
npm run db:seed
```

### 4. Database Optimization
Create indexes for better performance:

```sql
-- Connect to the database
psql -U tekparola -d tekparola

-- Create additional indexes
CREATE INDEX idx_users_email_active ON users(email, is_active);
CREATE INDEX idx_sessions_user_active ON sessions(user_id, is_active);
CREATE INDEX idx_audit_logs_action_created ON audit_logs(action, created_at);
CREATE INDEX idx_api_keys_key_id ON api_keys(key_id);
```

## Redis Setup

### 1. Install Redis
```bash
# Ubuntu/Debian
sudo apt update
sudo apt install redis-server

# CentOS/RHEL
sudo yum install redis

# macOS
brew install redis
```

### 2. Configure Redis for Production
Edit `/etc/redis/redis.conf`:

```conf
# Enable password authentication
requirepass your-redis-password

# Disable dangerous commands
rename-command FLUSHDB ""
rename-command FLUSHALL ""
rename-command KEYS ""
rename-command CONFIG ""

# Enable persistence
save 900 1
save 300 10
save 60 10000

# Set max memory
maxmemory 1gb
maxmemory-policy allkeys-lru
```

### 3. Start Redis
```bash
sudo systemctl start redis
sudo systemctl enable redis
```

## Application Deployment

### 1. Build the Application
```bash
npm run build
```

### 2. Create systemd Service
Create `/etc/systemd/system/tekparola-sso.service`:

```ini
[Unit]
Description=TekParola SSO Service
After=network.target postgresql.service redis.service

[Service]
Type=simple
User=tekparola
Group=tekparola
WorkingDirectory=/opt/tekparola-sso
Environment=NODE_ENV=production
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=10
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=tekparola-sso

[Install]
WantedBy=multi-user.target
```

### 3. Start the Service
```bash
sudo systemctl daemon-reload
sudo systemctl start tekparola-sso
sudo systemctl enable tekparola-sso
```

### 4. Verify Service Status
```bash
sudo systemctl status tekparola-sso
journalctl -u tekparola-sso -f
```

## Docker Deployment

### 1. Build Docker Image
```bash
docker build -t tekparola-sso:latest .
```

### 2. Create Docker Compose File
`docker-compose.prod.yml`:

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:15-alpine
    restart: always
    environment:
      POSTGRES_DB: tekparola
      POSTGRES_USER: tekparola
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - postgres-data:/var/lib/postgresql/data
    networks:
      - tekparola-network

  redis:
    image: redis:7-alpine
    restart: always
    command: redis-server --requirepass ${REDIS_PASSWORD}
    volumes:
      - redis-data:/data
    networks:
      - tekparola-network

  app:
    image: tekparola-sso:latest
    restart: always
    depends_on:
      - postgres
      - redis
    environment:
      NODE_ENV: production
      DATABASE_URL: postgresql://tekparola:${DB_PASSWORD}@postgres:5432/tekparola
      REDIS_URL: redis://:${REDIS_PASSWORD}@redis:6379
    ports:
      - "3000:3000"
    networks:
      - tekparola-network
    volumes:
      - ./logs:/app/logs

volumes:
  postgres-data:
  redis-data:

networks:
  tekparola-network:
    driver: bridge
```

### 3. Deploy with Docker Compose
```bash
docker-compose -f docker-compose.prod.yml up -d
```

## Kubernetes Deployment

### 1. Create Namespace
```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: tekparola
```

### 2. Create ConfigMap
```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: tekparola-config
  namespace: tekparola
data:
  NODE_ENV: "production"
  PORT: "3000"
  APP_URL: "https://sso.yourdomain.com"
```

### 3. Create Secret
```bash
kubectl create secret generic tekparola-secrets \
  --from-literal=database-url='postgresql://...' \
  --from-literal=redis-url='redis://...' \
  --from-literal=jwt-secret='...' \
  --from-literal=jwt-refresh-secret='...' \
  -n tekparola
```

### 4. Create Deployment
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: tekparola-sso
  namespace: tekparola
spec:
  replicas: 3
  selector:
    matchLabels:
      app: tekparola-sso
  template:
    metadata:
      labels:
        app: tekparola-sso
    spec:
      containers:
      - name: tekparola-sso
        image: tekparola-sso:latest
        ports:
        - containerPort: 3000
        envFrom:
        - configMapRef:
            name: tekparola-config
        - secretRef:
            name: tekparola-secrets
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5
```

### 5. Create Service
```yaml
apiVersion: v1
kind: Service
metadata:
  name: tekparola-sso
  namespace: tekparola
spec:
  selector:
    app: tekparola-sso
  ports:
  - port: 80
    targetPort: 3000
  type: ClusterIP
```

### 6. Create Ingress
```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: tekparola-sso
  namespace: tekparola
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/rate-limit: "100"
spec:
  tls:
  - hosts:
    - sso.yourdomain.com
    secretName: tekparola-tls
  rules:
  - host: sso.yourdomain.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: tekparola-sso
            port:
              number: 80
```

### 7. Deploy to Kubernetes
```bash
kubectl apply -f k8s/
```

## Production Configuration

### 1. Nginx Reverse Proxy
```nginx
server {
    listen 80;
    server_name sso.yourdomain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name sso.yourdomain.com;

    ssl_certificate /etc/ssl/certs/tekparola.crt;
    ssl_certificate_key /etc/ssl/private/tekparola.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 86400;
    }
}
```

### 2. Performance Tuning

#### Node.js Configuration
```bash
# Set in systemd service or Docker environment
NODE_OPTIONS="--max-old-space-size=1024"
```

#### PostgreSQL Tuning
```sql
-- postgresql.conf
shared_buffers = 256MB
effective_cache_size = 1GB
work_mem = 4MB
max_connections = 200
```

#### Redis Tuning
```conf
# redis.conf
maxmemory 2gb
maxmemory-policy allkeys-lru
tcp-keepalive 60
timeout 300
```

## SSL/TLS Configuration

### 1. Using Let's Encrypt
```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx

# Obtain certificate
sudo certbot --nginx -d sso.yourdomain.com

# Auto-renewal
sudo certbot renew --dry-run
```

### 2. Using Custom Certificate
```bash
# Copy certificates
sudo cp your-cert.crt /etc/ssl/certs/tekparola.crt
sudo cp your-key.key /etc/ssl/private/tekparola.key
sudo chmod 600 /etc/ssl/private/tekparola.key
```

## Monitoring and Logging

### 1. Application Metrics
Access metrics at: `http://localhost:9090/metrics`

### 2. Prometheus Configuration
```yaml
scrape_configs:
  - job_name: 'tekparola-sso'
    static_configs:
      - targets: ['localhost:9090']
```

### 3. Log Aggregation
```bash
# View application logs
tail -f /var/log/tekparola/app.log
tail -f /var/log/tekparola/error.log
tail -f /var/log/tekparola/audit.log
```

### 4. Health Checks
```bash
# Check application health
curl http://localhost:3000/health

# Check metrics
curl http://localhost:9090/metrics
```

## Backup and Recovery

### 1. Database Backup
```bash
#!/bin/bash
# backup-db.sh
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backup/postgres"
mkdir -p $BACKUP_DIR

pg_dump -U tekparola -h localhost tekparola | gzip > $BACKUP_DIR/tekparola_$DATE.sql.gz

# Keep only last 7 days
find $BACKUP_DIR -name "*.sql.gz" -mtime +7 -delete
```

### 2. Redis Backup
```bash
#!/bin/bash
# backup-redis.sh
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backup/redis"
mkdir -p $BACKUP_DIR

redis-cli --rdb $BACKUP_DIR/dump_$DATE.rdb

# Keep only last 7 days
find $BACKUP_DIR -name "*.rdb" -mtime +7 -delete
```

### 3. Automated Backups
```bash
# Add to crontab
0 2 * * * /opt/tekparola/scripts/backup-db.sh
0 3 * * * /opt/tekparola/scripts/backup-redis.sh
```

### 4. Restore Database
```bash
# Restore from backup
gunzip -c /backup/postgres/tekparola_20240115_020000.sql.gz | psql -U tekparola -h localhost tekparola
```

## Troubleshooting

### Common Issues

#### 1. Application Won't Start
```bash
# Check logs
journalctl -u tekparola-sso -n 100

# Check environment variables
printenv | grep TEKPAROLA

# Test database connection
psql -U tekparola -h localhost -d tekparola -c "SELECT 1;"

# Test Redis connection
redis-cli ping
```

#### 2. Database Connection Issues
```bash
# Check PostgreSQL status
sudo systemctl status postgresql

# Check connection
pg_isready -h localhost -p 5432

# Check logs
sudo tail -f /var/log/postgresql/postgresql-*.log
```

#### 3. Redis Connection Issues
```bash
# Check Redis status
sudo systemctl status redis

# Test authentication
redis-cli -a your-password ping

# Check logs
sudo tail -f /var/log/redis/redis-server.log
```

#### 4. Performance Issues
```bash
# Check CPU and memory
top -u tekparola

# Check disk usage
df -h

# Check database slow queries
psql -U tekparola -d tekparola -c "SELECT * FROM pg_stat_statements ORDER BY total_time DESC LIMIT 10;"

# Check Redis memory
redis-cli info memory
```

### Debug Mode
```bash
# Run in debug mode
NODE_ENV=production DEBUG=* node dist/index.js
```

### Health Check Endpoints
- `/health` - Basic health check
- `/health/detailed` - Detailed health check (requires authentication)
- `/metrics` - Prometheus metrics

## Security Checklist

- [ ] All secrets are stored in environment variables
- [ ] Database uses SSL/TLS connections
- [ ] Redis requires password authentication
- [ ] HTTPS is enabled with valid certificates
- [ ] Security headers are configured
- [ ] Rate limiting is enabled
- [ ] CORS is properly configured
- [ ] Input validation is enabled
- [ ] SQL injection protection is active
- [ ] XSS protection is enabled
- [ ] CSRF protection is configured
- [ ] Regular security updates are applied
- [ ] Audit logging is enabled
- [ ] Backup procedures are tested
- [ ] Monitoring and alerting is configured

## Support

For issues and support:
- GitHub Issues: https://github.com/tekparola/sso/issues
- Documentation: https://docs.tekparola.com
- Email: support@tekparola.com
