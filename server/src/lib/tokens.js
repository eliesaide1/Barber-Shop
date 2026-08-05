import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export function signAccessToken(user) {
  return jwt.sign(
    { sub: String(user._id), role: user.role, name: user.name },
    env.jwtSecret,
    { expiresIn: env.accessTtl },
  );
}

export function signRefreshToken(user) {
  return jwt.sign(
    { sub: String(user._id), v: user.tokenVersion },
    env.jwtRefreshSecret,
    { expiresIn: env.refreshTtl },
  );
}

export function verifyAccessToken(token) {
  return jwt.verify(token, env.jwtSecret);
}

export function verifyRefreshToken(token) {
  return jwt.verify(token, env.jwtRefreshSecret);
}

export function issueTokens(user) {
  return { accessToken: signAccessToken(user), refreshToken: signRefreshToken(user) };
}
