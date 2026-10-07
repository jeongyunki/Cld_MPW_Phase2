// 파일 업로드 도구 — multer 설정과 디스크 저장·확인·삭제를 한곳에 모았다.
// 이 파일은 multer, node:fs, node:path만 안다. DB나 업무 규칙(확장자 허용 목록 등)은 모른다.
// (프론트의 src/lib/api/*.js처럼, 바깥 세계와 닿는 부분만 격리해 두는 계층)

const fs = require('node:fs');
const path = require('node:path');
const multer = require('multer');

const SERVER_DIR = path.resolve(__dirname, '..', '..'); // server/
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB (10485760 바이트)
const FILE_TOO_LARGE_MESSAGE = '파일 크기가 10MB를 초과합니다';
const INVALID_UPLOAD_MESSAGE = '업로드 요청 형식이 올바르지 않습니다';

// 저장 루트. 환경변수 UPLOAD_DIR(상대경로는 server/ 기준)이 없으면 server/uploads.
// 호출할 때마다 읽는다 — 테스트에서 환경변수를 바꿔도 반영되게.
function getUploadRoot() {
	const value = (process.env.UPLOAD_DIR ?? '').trim();
	return path.resolve(SERVER_DIR, value || 'uploads');
}

function getDeliverablesDir() {
	return path.join(getUploadRoot(), 'deliverables');
}

// 디스크 경로는 사용자가 보낸 파일명이 아니라 "uuid + 허용된 확장자"로만 만든다.
// 사용자 파일명을 그대로 쓰면 '../../etc/x' 같은 이름으로 저장 폴더 밖을 건드릴 수 있다(path traversal).
// id와 extension은 service가 이미 검증한 값이다.
// 반환값은 DB file_path에 넣을 UPLOAD_DIR 기준 상대경로.
async function saveFile(id, extension, buffer) {
	const dir = getDeliverablesDir();
	await fs.promises.mkdir(dir, { recursive: true });
	await fs.promises.writeFile(path.join(dir, `${id}.${extension}`), buffer);
	return `deliverables/${id}.${extension}`;
}

async function fileExists(id, extension) {
	try {
		const stat = await fs.promises.stat(path.join(getDeliverablesDir(), `${id}.${extension}`));
		return stat.isFile();
	} catch {
		return false;
	}
}

// force: true — 파일이 이미 없어도 에러 없이 넘어간다.
async function removeFile(id, extension) {
	await fs.promises.rm(path.join(getDeliverablesDir(), `${id}.${extension}`), { force: true });
}

// memoryStorage: 업로드 파일을 디스크에 바로 쓰지 않고 메모리(req.file.buffer)에 "일단 손에 들고" 있는다.
// 그래서 controller·service가 확장자 같은 검사를 끝낸 뒤에만 서랍(디스크)에 넣을 수 있다.
// 검사 전에 디스크에 쓰면 거절한 파일을 다시 지우는 일이 생긴다. 10MB 제한이라 메모리 부담은 작다.
// defParamCharset: 'utf8' — 브라우저가 보낸 한글 파일명이 깨지지 않게(기본값 latin1) 해석한다.
const singleFile = multer({
	storage: multer.memoryStorage(),
	limits: { fileSize: MAX_FILE_SIZE },
	defParamCharset: 'utf8'
}).single('file');

// multer 에러(크기 초과, 엉뚱한 필드명 등)는 사용자 입력 문제라 400으로 직접 응답하고,
// 그 밖의 에러는 errorHandler로 넘긴다.
function uploadSingleFile(req, res, next) {
	singleFile(req, res, (err) => {
		if (err instanceof multer.MulterError) {
			const message =
				err.code === 'LIMIT_FILE_SIZE' ? FILE_TOO_LARGE_MESSAGE : INVALID_UPLOAD_MESSAGE;
			return res.status(400).json({ error: { message } });
		}
		next(err);
	});
}

module.exports = {
	MAX_FILE_SIZE,
	getUploadRoot,
	getDeliverablesDir,
	saveFile,
	fileExists,
	removeFile,
	uploadSingleFile
};
