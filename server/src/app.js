// Express 앱 조립 — 미들웨어와 라우터를 순서대로 붙인다. listen은 server.js가 한다
// (테스트가 포트를 열지 않고 이 app만 불러 쓸 수 있도록 분리).
// 미들웨어는 위에서 아래로 차례로 실행된다 (SvelteKit hooks의 handle 체인과 비슷).

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const session = require('express-session');
const { passport } = require('./middleware/auth');

const app = express();

// 1) CORS — 프론트(Vite 개발 서버)가 다른 포트에서 API를 부를 수 있게 허용한다.
// 세션 쿠키를 주고받으려면 origin을 '*'가 아닌 특정 주소로 두고 credentials를 켜야 한다.
// 배포 주소가 정해지면 그때 .env로 뺀다 (docs/4 5.1절).
app.use(cors({ origin: 'http://localhost:5173', credentials: true }));

// 2) 요청 로그 (메서드, 경로, 상태코드, 소요시간)
app.use(morgan('dev'));

// 3) JSON 본문 파싱 — req.body로 읽을 수 있게 한다. 형식이 틀리면 400 에러가 errorHandler로 간다.
app.use(express.json());

// 4) 세션 — 로그인 상태를 서버 메모리에 두고, 브라우저에는 세션 id가 든 쿠키(connect.sid)만 준다.
// SESSION_SECRET은 쿠키 서명용 비밀값이다. 없으면 express-session이 모든 요청을 500으로 처리한다.
// - maxAge 30분 + rolling: 마지막 요청 후 30분 동안 아무 요청이 없으면 만료 (PRD 4.4, 요청할 때마다 연장)
// - 저장소를 따로 지정하지 않으면 MemoryStore다. 단일 프로세스 전제라 충분하지만 서버를 재시작하면 모두 로그아웃된다.
// - secure false: HTTPS는 앞단 리버스 프록시가 처리한다 (docs/4 5.2절)
// - sameSite lax: localhost:5173 ↔ 3001은 same-site라 쿠키가 전달된다. 프론트는 fetch에 credentials: 'include'를 쓴다.
app.use(
	session({
		secret: process.env.SESSION_SECRET,
		resave: false,
		saveUninitialized: false,
		rolling: true,
		cookie: { maxAge: 30 * 60 * 1000, httpOnly: true, sameSite: 'lax', secure: false }
	})
);

// 5) passport — 세션에서 로그인 사용자를 꺼내 req.user에 채운다 (middleware/auth.js 설정 사용)
app.use(passport.initialize());
app.use(passport.session());

// 6) 실제 API
app.use('/api', require('./routes'));

// 7) 위에서 아무도 응답하지 않은 요청 = 없는 경로
app.use((req, res) => {
	res.status(404).json({ error: { message: '요청한 경로를 찾을 수 없습니다' } });
});

// 8) 에러 처리는 항상 맨 마지막에 붙인다
app.use(require('./middleware/errorHandler'));

module.exports = app;
