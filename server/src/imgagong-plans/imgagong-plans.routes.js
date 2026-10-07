// 임가공 Plan URL 매핑 — 어떤 URL이 어떤 controller 함수로 가는지만 정한다.

const express = require('express');
const imgagongPlansController = require('./imgagong-plans.controller');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, imgagongPlansController.getImgagongPlans);
router.post('/', requireAuth, imgagongPlansController.createImgagongPlan);
// BE-6: GET /stream 과 PATCH /bulk-confirm 은 반드시 이 줄보다 위('/:id'보다 먼저)에 등록한다.
// 아래에 두면 'stream', 'bulk-confirm'이 :id 값으로 먼저 잡혀 버린다.
router.patch('/:id', requireAuth, imgagongPlansController.updateImgagongPlan);
router.delete('/:id', requireAuth, imgagongPlansController.deleteImgagongPlan);

module.exports = router;
