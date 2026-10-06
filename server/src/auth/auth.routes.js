// /api/auth 아래 라우트. 미들웨어가 왼쪽에서 오른쪽으로 차례로 실행된다.

const express = require('express');
const authController = require('./auth.controller');
const { authenticateLocal, endSession, requireAuth } = require('../middleware/auth');

const router = express.Router();

router.post(
	'/login',
	authController.validateLoginBody,
	authenticateLocal,
	authController.sendCurrentUser
);
router.post('/logout', requireAuth, endSession, authController.sendLogoutSuccess);
router.get('/me', requireAuth, authController.sendCurrentUser);

module.exports = router;
