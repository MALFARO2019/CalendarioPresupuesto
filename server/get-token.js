#!/usr/bin/env node

// Quick test to get a valid token
const jwt = require('jsonwebtoken');
const secret = process.env.JWT_SECRET || 'rosti-secret-2025';

const token = jwt.sign(
    { userId: 1, email: 'soporte@rostipolloscr.com' },
    secret
);

console.log(`\nToken: ${token}\n`);
console.log(`Test command:`);
console.log(`curl -H "Authorization: Bearer ${token}" http://localhost:3000/api/user/dashboard-config`);
