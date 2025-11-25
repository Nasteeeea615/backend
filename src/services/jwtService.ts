import jwt from 'jsonwebtoken';
import { JWTPayload } from '../types';

class JWTService {
  private secret: string;
  private expiresIn: string;
  private refreshExpiresIn: string;

  constructor() {
    this.secret = process.env.JWT_SECRET || 'dev_secret_key';
    this.expiresIn = process.env.JWT_EXPIRES_IN || '15m';
    this.refreshExpiresIn = process.env.JWT_REFRESH_EXPIRES_IN || '7d';
  }

  /**
   * Generate access token
   */
  generateToken(payload: JWTPayload): string {
    return jwt.sign(payload, this.secret, { expiresIn: this.expiresIn } as jwt.SignOptions);
  }

  /**
   * Generate refresh token
   */
  generateRefreshToken(payload: JWTPayload): string {
    return jwt.sign(payload, this.secret, { expiresIn: this.refreshExpiresIn } as jwt.SignOptions);
  }

  /**
   * Verify token
   */
  verifyToken(token: string): JWTPayload | null {
    try {
      const decoded = jwt.verify(token, this.secret) as JWTPayload;
      return decoded;
    } catch (error) {
      return null;
    }
  }

  /**
   * Decode token without verification (for debugging)
   */
  decodeToken(token: string): JWTPayload | null {
    try {
      return jwt.decode(token) as JWTPayload;
    } catch (error) {
      return null;
    }
  }
}

export default new JWTService();
