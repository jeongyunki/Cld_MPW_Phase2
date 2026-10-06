// GET /api/health 처리 — 서버가 떠 있고 DB에 연결되는지 확인한다.
// 원칙상 controller는 service만 부르지만, 이 핸들러는 업무 로직이 없는 "연결 확인"이라
// 예외적으로 Knex(db)를 직접 호출한다.
// 아래 db는 구조분해하지 않고 객체째 받는다 — 테스트가 db.raw를 가짜로 바꿔치기할 수 있게 하기 위해서다.

const db = require('../db/connection');

async function getHealth(req, res) {
	try {
		await db.raw('select 1');
		res.json({ status: 'ok' });
	} catch (err) {
		// DB 연결 실패는 swagger의 /health 500 응답({ status: 'error' }) 그대로 돌려준다.
		// 그래서 next(err)로 errorHandler에 넘기지 않고 여기서 직접 응답한다.
		console.error(err);
		res.status(500).json({ status: 'error' });
	}
}

module.exports = { getHealth };
