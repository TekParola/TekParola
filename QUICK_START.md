# TekParola SSO - Quick Start Guide

## 🚀 Instant Deployment - Choose Your Method

### Method 1: Docker Deployment (Recommended)

**Prerequisites:** Docker and Docker Compose

```bash
# 1. Clone and setup
git clone <repository>
cd tekparola

# 2. Configure environment
cp .env.example .env
# Edit .env with your settings (see configuration section below)

# 3. Start with Docker
docker-compose up -d

# 4. Initialize database
docker-compose exec tekparola npm run db:migrate
docker-compose exec tekparola npm run db:seed

# 5. Verify deployment
./health-check.sh
```

### Method 2: Standalone Deployment

**Prerequisites:** Node.js 18+, PostgreSQL, Redis

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env with your database and Redis URLs

# 3. Generate secrets
npm run generate:secrets

# 4. Build application
npm run build

# 5. Setup database
npm run db:migrate
npm run db:seed

# 6. Start application
npm start

# 7. Verify deployment
./runtime-check.sh
```

### Method 3: One-Click Deployment

```bash
# Run the automated deployment script
./deploy.sh
```

## ⚙️ Essential Configuration

### Required Environment Variables

Edit your `.env` file with these essential settings:

```bash
# Database (Required)
DATABASE_URL="postgresql://username:password@localhost:5432/tekparola"

# Redis (Required)
REDIS_URL="redis://localhost:6379"

# JWT Secrets (Required - Generate with: npm run generate:secrets)
JWT_SECRET="your-64-character-secret"
JWT_REFRESH_SECRET="your-64-character-secret"
SESSION_SECRET="your-64-character-secret"

# Email (Required for notifications)
SMTP_HOST="smtp.yourdomain.com"
SMTP_USER="noreply@yourdomain.com"
SMTP_PASS="your-email-password"

# Application URLs
APP_URL="https://sso.yourdomain.com"
CORS_ORIGIN="https://yourdomain.com"
```

### Production Configuration

For production, use `.env.production` as a template and ensure:

1. **HTTPS is enabled** (automatically enforced)
2. **Strong passwords** for database and Redis
3. **Unique JWT secrets** (generated with `npm run generate:secrets`)
4. **Valid email configuration**
5. **Proper CORS origins**

## 🎯 Verification & Access

### Access Points

After deployment, access these URLs:

- **Application**: http://localhost:3000
- **Admin Panel**: http://localhost:3000/admin
- **API Documentation**: http://localhost:3000/api/docs
- **Health Check**: http://localhost:3000/health

### Default Admin Account

```
Email: admin@tekparola.com
Password: Admin123!
```

**⚠️ IMPORTANT:** Change the admin password immediately after first login!

### Health Verification

Run comprehensive health checks:

```bash
# Full system health check
./health-check.sh

# Runtime verification (if already running)
./runtime-check.sh
```

## 🔧 Common Commands

### Development

```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run test         # Run test suite
npm run lint         # Check code quality
```

### Database Operations

```bash
npm run db:migrate   # Run migrations
npm run db:seed      # Seed initial data
npm run db:studio    # Open Prisma Studio
```

### Production Operations

```bash
npm start                    # Start production server
npm run generate:secrets     # Generate secure secrets
./deploy.sh                  # Full deployment
./health-check.sh           # System health check
./runtime-check.sh          # Runtime verification
```

## 🐳 Docker Commands

### Development

```bash
docker-compose -f docker-compose.dev.yml up -d
```

### Production

```bash
docker-compose -f docker-compose.prod.yml up -d
```

### Management

```bash
# View logs
docker-compose logs -f tekparola

# Access container
docker-compose exec tekparola bash

# Restart services
docker-compose restart

# Update and rebuild
docker-compose down
docker-compose up -d --build
```

## 🔍 Troubleshooting

### Common Issues

1. **Database connection failed**
   ```bash
   # Check database is running
   docker-compose ps
   
   # Check connection string in .env
   echo $DATABASE_URL
   ```

2. **Application won't start**
   ```bash
   # Check logs
   npm run dev
   # or
   docker-compose logs tekparola
   ```

3. **Health checks failing**
   ```bash
   # Run detailed health check
   ./health-check.sh
   
   # Check specific services
   curl http://localhost:3000/health
   curl http://localhost:3000/health/database
   curl http://localhost:3000/health/redis
   ```

### Support Commands

```bash
# Check system status
./runtime-check.sh

# View application logs
tail -f logs/app.log

# Check database connection
npx prisma migrate status

# Test email configuration
npm run test:email

# Verify environment
npm run validate:env
```

## 📊 Monitoring

### Health Endpoints

- `/health` - Basic health check
- `/health/database` - Database connectivity
- `/health/redis` - Redis connectivity
- `/metrics` - Application metrics

### Log Files

- `logs/app.log` - Application logs
- `logs/error.log` - Error logs
- `logs/audit.log` - Audit logs

## 🎉 Success Indicators

Your deployment is successful when:

- ✅ Health check returns all green
- ✅ Admin panel is accessible
- ✅ User registration works
- ✅ Email notifications are sent
- ✅ API documentation is available
- ✅ Database is seeded with initial data

## 🔒 Security Checklist

Before going live:

- [ ] Change default admin password
- [ ] Configure HTTPS (automatically enforced in production)
- [ ] Set strong JWT secrets
- [ ] Configure proper CORS origins
- [ ] Set up email notifications
- [ ] Review audit log settings
- [ ] Configure rate limiting
- [ ] Set up monitoring

## 📞 Getting Help

1. **Check logs**: `tail -f logs/app.log`
2. **Run health check**: `./health-check.sh`
3. **Verify configuration**: Check `.env` file
4. **Review documentation**: Visit `/api/docs`
5. **Check issues**: See `ISSUES.md`

---

**🎊 Congratulations! TekParola SSO is now running and ready for production use.**