/**
 * @file src/modules/sessions/sessions.routes.js
 * @description QR table session management.
 *
 * Public  : POST /start   (QR scan → create session)
 * Customer: POST /link    (link customer account to session)
 * Staff   : PATCH /:id/free, GET /, GET /table/:tableId
 */

const express = require('express');
const { protect, restrictTo } = require('../../common/guards/auth.guard');
const { protectTableSession } = require('../customers/customer-session.guard');
const sessionController       = require('./session.controller');

const router = express.Router();

// ── Public: QR scan → start session ──────────────────────────────────────────
router.post('/start', sessionController.startTableSession);

// ── Customer: link account ────────────────────────────────────────────────────
router.post('/link', protectTableSession, sessionController.linkAccount);

// ── Staff: session management ─────────────────────────────────────────────────
router.use(protect);
router.use(restrictTo());

router.patch('/:id/free',     sessionController.freeTable);
router.get('/',               sessionController.getAllSessions);
router.get('/table/:tableId', sessionController.getSessionByTable);

module.exports = router;
