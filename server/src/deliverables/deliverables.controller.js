// Deliverables 요청 처리 — 요청 형식 검증(400)과 응답 상태코드만 담당한다.

const deliverablesService = require('./deliverables.service');

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;

// 쿼리 문자열을 1 이상의 정수로 바꾼다. 없으면 기본값, 형식이 틀리면 null.
// ('1.5', '-1', 'abc', '', 배열(?page=1&page=2), 너무 큰 수 모두 null)
function parsePositiveInt(value, defaultValue) {
	if (value === undefined) return defaultValue;
	if (typeof value !== 'string' || !/^\d+$/.test(value)) return null;
	const n = Number(value);
	return n >= 1 && Number.isSafeInteger(n) ? n : null;
}

const isBlank = (value) => typeof value !== 'string' || value.trim() === '';

async function getDeliverables(req, res) {
	const page = parsePositiveInt(req.query.page, DEFAULT_PAGE);
	const limit = parsePositiveInt(req.query.limit, DEFAULT_LIMIT);
	if (page === null || limit === null) {
		return res.status(400).json({ error: { message: 'page와 limit은 1 이상의 정수여야 합니다' } });
	}
	const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
	res.json(await deliverablesService.listDeliverables({ page, limit, search }));
}

// multipart 요청이라 텍스트 필드는 req.body, 파일은 req.file(multer가 채움)에 있다.
async function createDeliverable(req, res) {
	const { mpwRound, processName } = req.body ?? {};
	if (isBlank(mpwRound)) {
		return res.status(400).json({ error: { message: '차수를 입력해 주세요' } });
	}
	if (isBlank(processName)) {
		return res.status(400).json({ error: { message: '공정명을 입력해 주세요' } });
	}
	if (!req.file) {
		return res.status(400).json({ error: { message: '엑셀 파일을 첨부해 주세요' } });
	}
	const extension = deliverablesService.getAllowedExtension(req.file.originalname);
	if (!extension) {
		return res
			.status(400)
			.json({ error: { message: '엑셀 파일(.xlsx, .xls)만 업로드할 수 있습니다' } });
	}
	const created = await deliverablesService.createDeliverable(
		{
			mpwRound: mpwRound.trim(),
			processName: processName.trim(),
			originalFileName: req.file.originalname,
			extension,
			buffer: req.file.buffer
		},
		req.user
	);
	res.status(201).json(created);
}

// res.download(저장된 파일명, 사용자에게 보여줄 이름, { root }) — root 밖은 읽지 않는다.
// Content-Type은 octet-stream으로 고정해 브라우저가 내용을 해석하지 않고 저장하게 한다.
// 전송 중 에러는 원래 에러(절대경로가 담긴 ENOENT 등)를 그대로 내보내지 않고 고정 메시지로 감싸 500 처리한다.
async function downloadDeliverable(req, res, next) {
	const file = await deliverablesService.getDownloadFile(req.params.id);
	res.download(
		file.fileName,
		file.downloadName,
		{ root: file.directory, headers: { 'Content-Type': 'application/octet-stream' } },
		(err) => {
			if (err) next(new Error('파일 전송 실패', { cause: err }));
		}
	);
}

async function deleteDeliverable(req, res) {
	res.json(await deliverablesService.deleteDeliverable(req.params.id, req.user));
}

module.exports = {
	getDeliverables,
	createDeliverable,
	downloadDeliverable,
	deleteDeliverable
};
