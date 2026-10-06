// Knex 설정 파일 — `npx knex migrate:latest` 같은 CLI 명령과 src/db/connection.js가 함께 읽는다.
// 개발/운영 차이는 "같은 코드, 다른 .env 값"으로 처리한다 (docs/4 5.1절).
// pool 크기는 DB_POOL_MIN / DB_POOL_MAX 환경변수로 바꿀 수 있다 (PRD 6절 "규모 재검토").

const fs = require('fs');
const path = require('path');

// server/.env가 있으면 읽어 process.env에 넣는다 (Node 내장 기능, dotenv 패키지와 같은 역할).
// 이미 설정된 환경변수는 덮어쓰지 않는다. 운영처럼 .env 없이 환경변수를 직접 주는 경우를 위해 파일이 없으면 건너뛴다.
const envFile = path.join(__dirname, '.env');
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

const pool = {
	min: Number(process.env.DB_POOL_MIN || 2),
	max: Number(process.env.DB_POOL_MAX || 10)
};

module.exports = {
	development: {
		client: 'pg',
		connection: process.env.DATABASE_URL,
		pool,
		migrations: { directory: './src/db/migrations' },
		seeds: { directory: './src/db/seeds' }
	},

	production: {
		client: 'pg',
		connection: process.env.DATABASE_URL,
		pool,
		migrations: { directory: './src/db/migrations' },
		seeds: { directory: './src/db/seeds' }
	}
};
