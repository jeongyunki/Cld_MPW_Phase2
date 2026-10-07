// 임가공 Plan 요청 처리 — 요청 형식 검증(400)과 응답 상태코드만 담당한다.
// 400은 항상 service의 404/403보다 먼저 판단한다(형식이 틀린 요청은 DB까지 보내지 않는다).

const imgagongPlansService = require('./imgagong-plans.service');
// SSE 연결(addClient)은 req/res가 필요한 HTTP 수준 일이라 controller가 직접 호출한다.
const sse = require('../lib/sse');

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
// PostgreSQL integer(4바이트)의 최댓값. 이보다 크면 DB에서 에러가 나므로 미리 400으로 막는다.
const MAX_INT = 2147483647;
const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

// 수정 가능한 필드. 배열 순서가 곧 검증 순서다.
const UPDATABLE_FIELDS = [
	'status',
	'category',
	'assembler',
	'chipSize',
	'module',
	'projectName',
	'gcmCode',
	'pkgType',
	'customer',
	'lotCount',
	'pkgQty',
	'owner'
];
// 생성 때는 status를 받지 않는다(service가 항상 'new'로 고정).
const CREATE_FIELDS = UPDATABLE_FIELDS.filter((key) => key !== 'status');
const REQUIRED_MESSAGES = {
	category: '구분을 입력해 주세요',
	assembler: '조립처를 입력해 주세요',
	chipSize: 'Chip size를 입력해 주세요',
	pkgType: 'PKG Type을 입력해 주세요',
	owner: '과제 담당자를 입력해 주세요'
};
const INTEGER_FIELDS = ['lotCount', 'pkgQty'];
// service의 UUID_PATTERN과 같은 정규식. 형식이 틀린 id는 DB(uuid 컬럼)에서 에러가 나므로 미리 400으로 막는다.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IDS_MESSAGE = 'ids는 uuid 형식의 id를 1개 이상 담은 배열이어야 합니다';

// 쿼리 문자열을 1 이상의 정수로 바꾼다. 없으면 기본값, 형식이 틀리면 null.
// ('1.5', '-1', 'abc', '', 배열(?page=1&page=2), 너무 큰 수 모두 null)
function parsePositiveInt(value, defaultValue) {
	if (value === undefined) return defaultValue;
	if (typeof value !== 'string' || !/^\d+$/.test(value)) return null;
	const n = Number(value);
	return n >= 1 && Number.isSafeInteger(n) ? n : null;
}

const isBlank = (value) => typeof value !== 'string' || value.trim() === '';

// 생략(undefined)은 "경계 없음"이라 통과. 빈 문자열·배열·'2026-13' 같은 값은 false.
const isValidMonth = (value) =>
	value === undefined || (typeof value === 'string' && MONTH_PATTERN.test(value));

const isValidVersion = (value) => Number.isInteger(value) && value >= 1 && value <= MAX_INT;

// 배열이고, 비어 있지 않고, 모든 원소가 uuid 문자열이어야 한다.
const isValidIds = (ids) =>
	Array.isArray(ids) &&
	ids.length > 0 &&
	ids.every((id) => typeof id === 'string' && UUID_PATTERN.test(id));

// 필드 하나를 검증하고 저장할 값을 만든다. 실패하면 { message }, 성공하면 { value }.
// - 필수 필드: 문자열이고 공백만이 아니어야 하며, 앞뒤 공백은 제거
// - 정수 필드(lotCount, pkgQty): 0 이상 정수 또는 null
// - 나머지: 문자열 또는 null (공백만 있으면 null로 저장)
function validateField(key, value) {
	if (key in REQUIRED_MESSAGES) {
		return isBlank(value) ? { message: REQUIRED_MESSAGES[key] } : { value: value.trim() };
	}
	if (value === undefined || value === null) return { value: null };
	if (INTEGER_FIELDS.includes(key)) {
		return Number.isInteger(value) && value >= 0 && value <= MAX_INT
			? { value }
			: { message: `${key} 값은 0 이상 2147483647 이하의 정수 또는 null이어야 합니다` };
	}
	if (typeof value !== 'string') return { message: `${key} 값은 문자열 또는 null이어야 합니다` };
	const trimmed = value.trim();
	return { value: trimmed === '' ? null : trimmed };
}

// keys 순서대로 검증해 첫 오류에서 멈춘다. body에 있어도 keys에 없는 키(id, createdAt 등)는 버려진다.
function validateFields(body, keys) {
	const values = {};
	for (const key of keys) {
		const result = validateField(key, body[key]);
		if (result.message) return { message: result.message };
		values[key] = result.value;
	}
	return { values };
}

async function getImgagongPlans(req, res) {
	const page = parsePositiveInt(req.query.page, DEFAULT_PAGE);
	const limit = parsePositiveInt(req.query.limit, DEFAULT_LIMIT);
	if (page === null || limit === null) {
		return res.status(400).json({ error: { message: 'page와 limit은 1 이상의 정수여야 합니다' } });
	}
	const { startMonth, endMonth } = req.query;
	if (!isValidMonth(startMonth) || !isValidMonth(endMonth)) {
		return res
			.status(400)
			.json({ error: { message: '조회 기간(startMonth, endMonth)은 YYYY-MM 형식이어야 합니다' } });
	}
	res.json(await imgagongPlansService.listPlans({ page, limit, startMonth, endMonth }));
}

async function createImgagongPlan(req, res) {
	const result = validateFields(req.body ?? {}, CREATE_FIELDS);
	if (result.message) return res.status(400).json({ error: { message: result.message } });
	res.status(201).json(await imgagongPlansService.createPlan(result.values));
}

// body에 담긴 필드만 부분 수정(PATCH)한다. version은 "내가 화면에서 본 버전"이라 필수.
async function updateImgagongPlan(req, res) {
	const body = req.body ?? {};
	if (!isValidVersion(body.version)) {
		return res.status(400).json({ error: { message: 'version은 1 이상의 정수여야 합니다' } });
	}
	const keys = UPDATABLE_FIELDS.filter((key) => Object.hasOwn(body, key));
	if (keys.length === 0) {
		return res.status(400).json({ error: { message: '수정할 항목이 없습니다' } });
	}
	const result = validateFields(body, keys);
	if (result.message) return res.status(400).json({ error: { message: result.message } });
	res.json(
		await imgagongPlansService.updatePlan(req.params.id, body.version, result.values, req.user)
	);
}

async function deleteImgagongPlan(req, res) {
	res.json(await imgagongPlansService.deletePlan(req.params.id, req.user));
}

// 관리자가 고른 행들의 의뢰 확정(checked → requested). 권한(관리자)은 라우트의 requireAdmin이 먼저 확인한다.
async function bulkConfirmImgagongPlans(req, res) {
	const { ids } = req.body ?? {};
	if (!isValidIds(ids)) return res.status(400).json({ error: { message: IDS_MESSAGE } });
	res.json(await imgagongPlansService.bulkConfirm(ids, req.user));
}

// 실시간 변경 알림 스트림. 응답을 끝내지 않고 열어 둔 채 sse가 이벤트를 흘려보낸다.
function streamImgagongPlans(req, res) {
	sse.addClient(req, res);
}

module.exports = {
	getImgagongPlans,
	bulkConfirmImgagongPlans,
	streamImgagongPlans,
	createImgagongPlan,
	updateImgagongPlan,
	deleteImgagongPlan
};
