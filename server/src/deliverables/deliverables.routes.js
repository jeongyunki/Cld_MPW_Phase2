// /api/deliverables — 모든 엔드포인트가 로그인 사용자용. 삭제 권한(본인/관리자)은 service에서 판단한다.

const express = require('express');
const deliverablesController = require('./deliverables.controller');
const { requireAuth } = require('../middleware/auth');
const upload = require('../lib/upload');

const router = express.Router();

router.get('/', requireAuth, deliverablesController.getDeliverables);
// requireAuth가 먼저 — 로그인하지 않은 사람의 파일은 받지도 않는다
router.post('/', requireAuth, upload.uploadSingleFile, deliverablesController.createDeliverable);
router.get('/:id/download', requireAuth, deliverablesController.downloadDeliverable);
router.delete('/:id', requireAuth, deliverablesController.deleteDeliverable);

module.exports = router;
