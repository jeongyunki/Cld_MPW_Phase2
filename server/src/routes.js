// /api 아래 모든 라우트를 모으는 곳. app.js가 `app.use('/api', routes)`로 한 번에 붙인다.
// (SvelteKit의 src/routes 폴더 구조를 파일 하나로 모아 둔 목록과 비슷하다)
// BE-3~6에서 리소스가 생길 때마다 아래에 한 줄씩 추가한다.
//   예) router.use('/master-items', require('./master-items/master-items.routes'));

const express = require('express');
const { getHealth } = require('./health/health.controller');

const router = express.Router();

router.get('/health', getHealth);
router.use('/auth', require('./auth/auth.routes'));

module.exports = router;
