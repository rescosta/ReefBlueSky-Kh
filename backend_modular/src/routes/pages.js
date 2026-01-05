/**
 * Pages Routes
 * Rotas de páginas estáticas
 */

const express = require('express');
const path = require('path');
const router = express.Router();

/**
 * GET /
 */
router.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

/**
 * GET /login
 */
router.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/login.html'));
});

/**
 * GET /dashboard
 */
router.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/dashboard.html'));
});

module.exports = router;
