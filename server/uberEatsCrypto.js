/**
 * uberEatsCrypto.js
 * Shared encryption/decryption for Uber Eats secrets
 * Single source of truth — imported by both service and endpoints
 */
const crypto = require('crypto');

const ENCRYPTION_ALGORITHM = 'aes-256-cbc';

function getEncKey() {
    const k = process.env.DB_ENCRYPTION_KEY || 'default-key-change-in-production-32';
    return Buffer.from(k.padEnd(32, '0').substring(0, 32));
}

function encryptValue(text) {
    if (!text) return null;
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, getEncKey(), iv);
    return iv.toString('hex') + ':' + cipher.update(text, 'utf8', 'hex') + cipher.final('hex');
}

function decryptValue(encrypted) {
    if (!encrypted) return '';
    const parts = encrypted.split(':');
    if (parts.length !== 2) return encrypted;
    const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, getEncKey(), Buffer.from(parts[0], 'hex'));
    return decipher.update(parts[1], 'hex', 'utf8') + decipher.final('utf8');
}

module.exports = { encryptValue, decryptValue };
