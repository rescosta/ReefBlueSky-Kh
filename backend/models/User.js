/**
 * Modelo User - CRUD completo para tabela users
 */
const pool = require('../config/database');

/**
 * Encontra usuário por email (login/register)
 */
const findByEmail = async (email) => {
  const conn = await pool.getConnection();
  try {
    const result = await conn.query(
      'SELECT id, email, passwordHash, isVerified, role, verificationCode, verificationExpiresAt, createdAt, updatedAt FROM users WHERE email = ? LIMIT 1',
      [email]
    );
    return result[0];
  } finally {
    conn.release();
  }
};

/**
 * Encontra usuário por ID (/auth/me)
 */
const findById = async (userId) => {
  const conn = await pool.getConnection();
  try {
    const result = await conn.query(
      'SELECT id, email, role, createdAt, updatedAt FROM users WHERE id = ? LIMIT 1',
      [userId]
    );
    return result[0];
  } finally {
    conn.release();
  }
};

/**
 * Cria novo usuário com código de verificação
 */
const create = async (email, passwordHash, verificationCode, expiresAt) => {
  const conn = await pool.getConnection();
  try {
    const result = await conn.query(
      `INSERT INTO users (email, passwordHash, createdAt, updatedAt, verificationCode, verificationExpiresAt, isVerified) 
       VALUES (?, ?, NOW(), NOW(), ?, ?, 0)`,
      [email, passwordHash, verificationCode, expiresAt]
    );
    return Number(result.insertId);
  } finally {
    conn.release();
  }
};

/**
 * Atualiza código de verificação (reenvio)
 */
const updateVerificationCode = async (userId, verificationCode, expiresAt) => {
  const conn = await pool.getConnection();
  try {
    await conn.query(
      'UPDATE users SET verificationCode = ?, verificationExpiresAt = ?, updatedAt = NOW() WHERE id = ?',
      [verificationCode, expiresAt, userId]
    );
  } finally {
    conn.release();
  }
};

/**
 * Verifica código e marca como verificado
 */
const verifyCode = async (email, code) => {
  const conn = await pool.getConnection();
  try {
    const user = await findByEmail(email);
    if (!user || user.isVerified) return null;

    const now = new Date();
    const expiresAt = new Date(user.verificationExpiresAt);

    if (now > expiresAt || String(code).trim() !== String(user.verificationCode).trim()) {
      return null;
    }

    await conn.query(
      'UPDATE users SET isVerified = 1, verificationCode = NULL, verificationExpiresAt = NULL, updatedAt = NOW() WHERE id = ?',
      [user.id]
    );

    return user;
  } finally {
    conn.release();
  }
};

/**
 * Atualiza a senha do usuário e limpa código de verificação
 */
const updatePassword = async (userId, passwordHash) => {
  const conn = await pool.getConnection();
  try {
    await conn.query(
      'UPDATE users SET passwordHash = ?, verificationCode = NULL, verificationExpiresAt = NULL, updatedAt = NOW() WHERE id = ?',
      [passwordHash, userId]
    );
  } finally {
    conn.release();
  }
};

module.exports = { 
  findByEmail, 
  findById, 
  create, 
  updateVerificationCode, 
  verifyCode,
  updatePassword
};
