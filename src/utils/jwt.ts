import jwt, { SignOptions } from 'jsonwebtoken';
import { config } from '../config/env';
import { redisClient } from '../config/redis';
import { logger } from './logger';

export interface TokenPayload {
  userId: string;
  email: string;
  sessionId: string;
  type: 'access' | 'refresh';
  iat?: number;
  exp?: number;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export class JWTService {
  private readonly accessTokenSecret: string;
  private readonly refreshTokenSecret: string;
  private readonly accessTokenExpiry: string;
  private readonly refreshTokenExpiry: string;

  constructor() {
    this.accessTokenSecret = config.jwt.secret;
    this.refreshTokenSecret = config.jwt.refreshSecret;
    this.accessTokenExpiry = config.jwt.expiresIn;
    this.refreshTokenExpiry = config.jwt.refreshExpiresIn;
  }

  generateTokenPair(userId: string, email: string, sessionId: string): TokenPair {
    const accessTokenPayload: Omit<TokenPayload, 'iat' | 'exp'> = {
      userId,
      email,
      sessionId,
      type: 'access',
    };

    const refreshTokenPayload: Omit<TokenPayload, 'iat' | 'exp'> = {
      userId,
      email,
      sessionId,
      type: 'refresh',
    };

    const accessToken = jwt.sign(
      accessTokenPayload, 
      this.accessTokenSecret, 
      { expiresIn: this.accessTokenExpiry } as SignOptions
    );

    const refreshToken = jwt.sign(
      refreshTokenPayload, 
      this.refreshTokenSecret, 
      { expiresIn: this.refreshTokenExpiry } as SignOptions
    );

    const decoded = jwt.decode(accessToken) as jwt.JwtPayload;
    const expiresIn = decoded.exp ? decoded.exp - Math.floor(Date.now() / 1000) : 0;

    return {
      accessToken,
      refreshToken,
      expiresIn,
    };
  }

  verifyAccessToken(token: string): TokenPayload {
    try {
      const decoded = jwt.verify(token, this.accessTokenSecret) as TokenPayload;
      if (decoded.type !== 'access') {
        throw new Error('Invalid token type');
      }
      return decoded;
    } catch (error) {
      logger.debug('Access token verification failed:', error);
      throw new Error('Invalid access token');
    }
  }

  verifyRefreshToken(token: string): TokenPayload {
    try {
      const decoded = jwt.verify(token, this.refreshTokenSecret) as TokenPayload;
      if (decoded.type !== 'refresh') {
        throw new Error('Invalid token type');
      }
      return decoded;
    } catch (error) {
      logger.debug('Refresh token verification failed:', error);
      throw new Error('Invalid refresh token');
    }
  }

  async blacklistToken(token: string): Promise<void> {
    try {
      const decoded = jwt.decode(token) as jwt.JwtPayload;
      if (!decoded || !decoded.exp) {
        return;
      }

      const expiresIn = decoded.exp - Math.floor(Date.now() / 1000);
      if (expiresIn > 0) {
        await redisClient.setEx(`blacklist:${token}`, expiresIn, 'blacklisted');
      }
    } catch (error) {
      logger.error('Failed to blacklist token:', error);
      throw new Error('Failed to blacklist token');
    }
  }

  async isTokenBlacklisted(token: string): Promise<boolean> {
    try {
      const result = await redisClient.get(`blacklist:${token}`);
      return result === 'blacklisted';
    } catch (error) {
      logger.error('Failed to check token blacklist:', error);
      return false;
    }
  }

  async revokeAllUserTokens(userId: string): Promise<void> {
    try {
      await redisClient.setEx(`revoked:user:${userId}`, 86400, 'revoked'); // 24 hours
    } catch (error) {
      logger.error('Failed to revoke user tokens:', error);
      throw new Error('Failed to revoke user tokens');
    }
  }

  async areUserTokensRevoked(userId: string): Promise<boolean> {
    try {
      const result = await redisClient.get(`revoked:user:${userId}`);
      return result === 'revoked';
    } catch (error) {
      logger.error('Failed to check user token revocation:', error);
      return false;
    }
  }

  extractTokenFromHeader(authHeader: string | undefined): string | null {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }
    return authHeader.substring(7);
  }

  async generatePasswordResetToken(userId: string): Promise<string> {
    const payload = {
      userId,
      type: 'password_reset',
      iat: Math.floor(Date.now() / 1000),
    };

    return jwt.sign(payload, this.accessTokenSecret, {
      expiresIn: '1h',
    });
  }

  verifyPasswordResetToken(token: string): { userId: string } {
    try {
      const decoded = jwt.verify(token, this.accessTokenSecret) as any;
      if (decoded.type !== 'password_reset') {
        throw new Error('Invalid token type');
      }
      return { userId: decoded.userId };
    } catch (error) {
      logger.debug('Password reset token verification failed:', error);
      throw new Error('Invalid or expired password reset token');
    }
  }

  async generateMagicLinkToken(userId: string): Promise<string> {
    const payload = {
      userId,
      type: 'magic_link',
      iat: Math.floor(Date.now() / 1000),
    };

    return jwt.sign(payload, this.accessTokenSecret, {
      expiresIn: '15m',
    });
  }

  verifyMagicLinkToken(token: string): { userId: string } {
    try {
      const decoded = jwt.verify(token, this.accessTokenSecret) as any;
      if (decoded.type !== 'magic_link') {
        throw new Error('Invalid token type');
      }
      return { userId: decoded.userId };
    } catch (error) {
      logger.debug('Magic link token verification failed:', error);
      throw new Error('Invalid or expired magic link token');
    }
  }
}

export const jwtService = new JWTService();