// /api/master-items — 조회는 로그인 사용자, 추가/삭제는 관리자만.

const express = require('express');
const masterItemsController = require('./master-items.controller');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, masterItemsController.getMasterItems);
router.post('/', requireAdmin, masterItemsController.createMasterItem);
router.delete('/:id', requireAdmin, masterItemsController.deleteMasterItem);

module.exports = router;
