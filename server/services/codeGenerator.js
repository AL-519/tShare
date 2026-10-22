const crypto = require('crypto');
const File = require('../models/File');

// Custom uppercase alphabet excluding visually ambiguous characters: 0, O, I, L, 1
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

/**
 * Generate a random short code of specified length using crypto random bytes
 * @param {number} length 
 * @returns {string}
 */
const generateRandomCode = (length = 6) => {
  const bytes = crypto.randomBytes(length);
  let code = '';
  for (let i = 0; i < length; i++) {
    const index = bytes[i] % ALPHABET.length;
    code += ALPHABET[index];
  }
  return code;
};

/**
 * Generate a unique file code and ensure it doesn't collide with existing active DB records
 * @returns {Promise<string>}
 */
const generateUniqueCode = async () => {
  let attempts = 0;
  const maxAttempts = 12;
  
  while (attempts < maxAttempts) {
    const code = generateRandomCode(6);
    try {
      const existing = await File.findOne({ code });
      if (!existing) {
        return code;
      }
    } catch (err) {
      // If DB is unreachable during code generation, append 2 random ALPHABET characters as fallback
      return `${code}${generateRandomCode(2)}`;
    }
    attempts++;
  }

  // Fallback to 8 chars if 6 char collisions occur
  return generateRandomCode(8);
};

module.exports = {
  generateRandomCode,
  generateUniqueCode,
  ALPHABET,
};
