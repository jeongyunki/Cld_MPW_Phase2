// 에러 처리 미들웨어 — 라우트에서 던져진(또는 next(err)로 넘긴) 에러를 JSON 응답으로 바꾼다.
// Express는 인자가 4개인 함수를 "에러 처리 미들웨어"로 인식한다. 그래서 next를 안 써도 4개를 유지해야 한다.
// (React의 Error Boundary, SvelteKit의 hooks.server.js handleError와 비슷한 "마지막 안전망" 역할)
//
// 상태코드는 에러 객체에 실어 보낸다: throw Object.assign(new Error('메시지'), { status: 404 });
// Express 5는 async 핸들러가 reject돼도 자동으로 이 핸들러에 넘겨주므로 try/catch + next(err)가 필요 없다.

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Express가 인자 개수(4)로 에러 미들웨어를 구분해서 next를 못 지운다
function errorHandler(err, req, res, next) {
	console.error(err);
	const status = err.status || 500;
	// 5xx는 내부 정보(DB 에러 문구 등)가 새지 않도록 고정 메시지만 내보낸다.
	const message = status < 500 ? err.message : '서버 내부 오류가 발생했습니다';
	res.status(status).json({ error: { message } });
}

module.exports = errorHandler;
