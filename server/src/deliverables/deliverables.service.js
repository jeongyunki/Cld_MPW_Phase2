// Deliverables 업무 규칙 — uuid 확인, 404/403 판단, 파일 저장과 DB 등록의 순서 관리.
// req/res를 모른다. 업무 규칙 위반은 status를 붙인 Error로 던진다.

const crypto = require('node:crypto');
const path = require('node:path');
const deliverablesRepository = require('./deliverables.repository');
const upload = require('../lib/upload');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOWED_EXTENSIONS = ['xlsx', 'xls'];
const ADMIN_ROLE = 'admin';
const NOT_FOUND_MESSAGE = 'Deliverables 항목을 찾을 수 없습니다';
const FILE_NOT_FOUND_MESSAGE = '파일을 찾을 수 없습니다';
const FORBIDDEN_MESSAGE = '등록자 본인 또는 관리자만 삭제할 수 있습니다';

// 허용된 엑셀 확장자면 소문자로 돌려주고, 아니면 null.
// 'a.XLSX' → 'xlsx', 'a.txt' · 'noext' · '.xlsx'(이름 없는 숨김 파일) → null
function getAllowedExtension(fileName) {
	const ext = path
		.extname(fileName ?? '')
		.slice(1)
		.toLowerCase();
	return ALLOWED_EXTENSIONS.includes(ext) ? ext : null;
}

async function listDeliverables({ page, limit, search }) {
	const [data, total] = await Promise.all([
		deliverablesRepository.findPage({ search, limit, offset: (page - 1) * limit }),
		deliverablesRepository.countMatching(search)
	]);
	return { data, total, page, limit };
}

// 순서: 파일 저장 → DB insert. DB가 실패하면 방금 저장한 파일을 지워 고아 파일을 남기지 않는다.
async function createDeliverable(
	{ mpwRound, processName, originalFileName, extension, buffer },
	user
) {
	const id = crypto.randomUUID();
	const filePath = await upload.saveFile(id, extension, buffer);
	try {
		const created = await deliverablesRepository.insert({
			id,
			mpwRound,
			processName,
			originalFileName,
			filePath,
			registeredBy: user.id
		});
		// insert에는 users join이 없어 등록자 이름이 비어 있다 → 로그인 사용자 이름으로 채운다 (재조회 없음)
		return { ...created, registeredByName: user.name };
	} catch (err) {
		await upload.removeFile(id, extension);
		throw err;
	}
}

// uuid 형식이 아니면 DB에 묻지 않고 바로 404 (PostgreSQL uuid 컬럼에 이상한 문자열을 넣으면 500이 나므로)
async function findOrThrow(id) {
	if (!UUID_PATTERN.test(id)) {
		throw Object.assign(new Error(NOT_FOUND_MESSAGE), { status: 404 });
	}
	const item = await deliverablesRepository.findById(id);
	if (!item) {
		throw Object.assign(new Error(NOT_FOUND_MESSAGE), { status: 404 });
	}
	return item;
}

// 다운로드할 파일 정보. 디스크 파일명은 DB의 file_path 문자열이 아니라 item.id + 검증된 확장자로 다시 만든다
// (DB 값이 어떻게 오염돼도 저장 폴더 밖으로 나갈 수 없게 — path traversal 방지).
async function getDownloadFile(id) {
	const item = await findOrThrow(id);
	const extension = getAllowedExtension(item.filePath);
	if (!extension || !(await upload.fileExists(item.id, extension))) {
		throw Object.assign(new Error(FILE_NOT_FOUND_MESSAGE), { status: 404 });
	}
	return {
		directory: upload.getDeliverablesDir(),
		fileName: `${item.id}.${extension}`,
		downloadName: item.originalFileName ?? `${item.id}.${extension}`
	};
}

// 등록자 본인 또는 관리자만 삭제. 등록자가 없는(null) 행은 관리자만 지울 수 있다.
// 순서: DB 삭제 → 파일 삭제. 파일이 이미 없어도 삭제는 성공한다.
async function deleteDeliverable(id, user) {
	const item = await findOrThrow(id);
	const isOwner = item.registeredBy !== null && item.registeredBy === user.id;
	if (user.role !== ADMIN_ROLE && !isOwner) {
		throw Object.assign(new Error(FORBIDDEN_MESSAGE), { status: 403 });
	}
	await deliverablesRepository.deleteById(item.id);
	const extension = getAllowedExtension(item.filePath);
	if (extension) await upload.removeFile(item.id, extension);
	return { id: item.id };
}

module.exports = {
	getAllowedExtension,
	listDeliverables,
	createDeliverable,
	getDownloadFile,
	deleteDeliverable
};
