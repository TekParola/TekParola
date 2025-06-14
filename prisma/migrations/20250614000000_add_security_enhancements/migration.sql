-- Add indexes for security and performance
CREATE INDEX IF NOT EXISTS "users_email_verified_idx" ON "users"("isEmailVerified");
CREATE INDEX IF NOT EXISTS "users_two_factor_enabled_idx" ON "users"("twoFactorEnabled");
CREATE INDEX IF NOT EXISTS "users_locked_at_idx" ON "users"("lockedAt");
CREATE INDEX IF NOT EXISTS "users_last_login_at_idx" ON "users"("lastLoginAt");

-- Add composite indexes for common queries
CREATE INDEX IF NOT EXISTS "user_sessions_user_active_idx" ON "user_sessions"("userId", "isActive");
CREATE INDEX IF NOT EXISTS "user_sessions_expires_at_idx" ON "user_sessions"("expiresAt");
CREATE INDEX IF NOT EXISTS "api_keys_app_active_idx" ON "api_keys"("applicationId", "isActive");
CREATE INDEX IF NOT EXISTS "api_keys_expires_at_idx" ON "api_keys"("expiresAt");

-- Add indexes for audit logs
CREATE INDEX IF NOT EXISTS "audit_logs_user_created_idx" ON "audit_logs"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "audit_logs_resource_idx" ON "audit_logs"("resource", "resourceId");

-- Add function for automatic updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW."updatedAt" = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Add triggers for automatic timestamp updates
DO $$ 
BEGIN
    -- Users table
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_users_updated_at') THEN
        CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON "users"
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;

    -- Roles table
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_roles_updated_at') THEN
        CREATE TRIGGER update_roles_updated_at BEFORE UPDATE ON "roles"
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;

    -- Applications table
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_applications_updated_at') THEN
        CREATE TRIGGER update_applications_updated_at BEFORE UPDATE ON "applications"
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;

    -- API Keys table
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_api_keys_updated_at') THEN
        CREATE TRIGGER update_api_keys_updated_at BEFORE UPDATE ON "api_keys"
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;