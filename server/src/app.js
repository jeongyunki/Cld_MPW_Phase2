// Express 앱 조립 — 미들웨어와 라우터를 순서대로 붙인다. listen은 server.js가 한다
// (테스트가 포트를 열지 않고 이 app만 불러 쓸 수 있도록 분리).
// 미들웨어는 위에서 아래로 차례로 실행된다 (SvelteKit hooks의 handle 체인과 비슷).

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');

const app = express();

// 1) CORS — 프론트(Vite 개발 서버)가 다른 포트에서 API를 부를 수 있게 허용한다.
// 이후 세션 쿠키(BE-2)를 주고받으려면 origin을 '*'가 아닌 특정 주소로 두고 credentials를 켜야 한다.
// 배포 주소가 정해지면 그때 .env로 뺀다 (docs/4 5.1절).
app.use(cors({ origin: 'http://localhost:5173', credentials: true }));

// 2) 요청 로그 (메서드, 경로, 상태코드, 소요시간)
app.use(morgan('dev'));

// 3) JSON 본문 파싱 — req.body로 읽을 수 있게 한다. 형식이 틀리면 400 에러가 errorHandler로 간다.
app.use(express.json());

// 4) 실제 API
app.use('/api', require('./routes'));

// 5) 위에서 아무도 응답하지 않은 요청 = 없는 경로
app.use((req, res) => {
	res.status(404).json({ error: { message: '요청한 경로를 찾을 수 없습니다' } });
});

// 6) 에러 처리는 항상 맨 마지막에 붙인다
app.use(require('./middleware/errorHandler'));

module.exports = app;
