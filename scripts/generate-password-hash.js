const crypto = require("crypto");

const password = process.argv[2];

if (!password) {
  console.error("Usage: node scripts/generate-password-hash.js \"your-password\"");
  process.exit(1);
}

const salt = crypto.randomBytes(16);
const cost = 16384;
const derivedKey = crypto.scryptSync(password, salt, 64, { N: cost, r: 8, p: 1 });

console.log(`scrypt:${salt.toString("hex")}:${derivedKey.toString("hex")}:${cost}`);
