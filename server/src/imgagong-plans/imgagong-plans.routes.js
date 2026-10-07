// 임가공 Plan URL 매핑 — 어떤 URL이 어떤 controller 함수로 가는지만 정한다.

const express = require('express');
const imgagongPlansController = require('./imgagong-plans.controller');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, imgagongPlansController.getImgagongPlans);
router.post('/', requireAuth, imgagongPlansController.createImgagongPlan);
// '/:id'보다 먼저 등록해야 한다. 아래에 두면 'stream', 'bulk-confirm'이 :id 값으로 잡힌다.
router.get('/stream', requireAuth, imgagongPlansController.streamImgagongPlans);
router.patch('/bulk-confirm', requireAdmin, imgagongPlansController.bulkConfirmImgagongPlans);
router.patch('/:id', requireAuth, imgagongPlansController.updateImgagongPlan);
router.delete('/:id', requireAuth, imgagongPlansController.deleteImgagongPlan);

module.exports = router;
