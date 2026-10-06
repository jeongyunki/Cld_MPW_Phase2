// 서버 시작점 — `pnpm start` / `pnpm dev`가 이 파일을 실행한다.

require('./db/connection'); // .env 로딩 보장 (knexfile이 loadEnvFile) — PORT를 읽기 전에 먼저 불러온다
const app = require('./app');

const PORT = process.env.PORT || 3001;

app.listen(PORT, (err) => {
	if (err) throw err;
	console.log(`MPW Plus API 서버: http://localhost:${PORT}/api`);
});
