// 임가공 Plan 업무 규칙 — 기간 계산, 낙관적 잠금 결과 해석, 권한(404/403/409) 판단.
// req/res를 모른다. 업무 규칙 위반은 status를 붙인 Error로 던진다.

const imgagongPlansRepository = require('./imgagong-plans.repository');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ADMIN_ROLE = 'admin';
const NEW_STATUS = 'new';
const NOT_FOUND_MESSAGE = '임가공 Plan 행을 찾을 수 없습니다';
const CONFLICT_MESSAGE =
	'다른 사용자가 먼저 이 행을 수정했습니다. 페이지를 새로고침한 후 다시 시도하세요';
const STATUS_FORBIDDEN_MESSAGE = '상태(status)는 관리자만 변경할 수 있습니다';
const DELETE_FORBIDDEN_MESSAGE = '이 행을 삭제할 권한이 없습니다';

const httpError = (status, message) => Object.assign(new Error(message), { status });
const isAdmin = (user) => user.role === ADMIN_ROLE;

// [순수] 낙관적 잠금: "내가 본 버전이 아직 최신인가?"
// Google Docs처럼 동시 편집을 합쳐 주는 대신, 내가 화면에서 본 version이 DB의 현재 version과
// 같을 때만 저장을 허용한다. 그 사이 다른 사람이 저장했다면 version이 올라가 있어 거절(409)된다.
function isVersionMatch(currentVersion, requestedVersion) {
	return currentVersion === requestedVersion;
}

// [순수] 종료월의 "다음 달 1일"을 문자열로 돌려준다. '2026-03' → '2026-04-01', '2026-12' → '2027-01-01'
// 왜 Date가 아니라 문자열인가: new Date('2026-04-01')은 UTC 자정으로 해석되어 서버 타임존에 따라
// 하루가 밀릴 수 있다. 문자열 그대로 DB에 넘기면 DB 세션 타임존 기준으로 비교되어 어긋나지 않는다.
// 종료 경계를 "<= 말일"이 아니라 "< 다음 달 1일"로 잡는 이유: 말일 23:59:59.999 같은 끝값을 놓치지 않기 위해서.
function nextMonthStart(month) {
	const [year, mon] = month.split('-').map(Number);
	return mon === 12 ? `${year + 1}-01-01` : `${year}-${String(mon + 1).padStart(2, '0')}-01`;
}

// 기간은 [시작월 1일 이상, 종료월 다음 달 1일 미만). 생략한 쪽은 null(경계 없음).
// 시작 > 종료이면 조건이 모순되어 자연스럽게 빈 결과가 나온다.
async function listPlans({ page, limit, startMonth, endMonth }) {
	const period = {
		start: startMonth ? `${startMonth}-01` : null,
		end: endMonth ? nextMonthStart(endMonth) : null
	};
	const [data, total] = await Promise.all([
		imgagongPlansRepository.findPage({ ...period, limit, offset: (page - 1) * limit }),
		imgagongPlansRepository.countMatching(period)
	]);
	return { data, total, page, limit };
}

// 클라이언트가 보낸 status는 이미 controller에서 걸러졌다(CREATE_FIELDS에 없음). 새 행은 항상 'new'.
async function createPlan(fields) {
	return imgagongPlansRepository.insert({ ...fields, status: NEW_STATUS });
}

// 낙관적 잠금 수정. 먼저 읽고 비교한 뒤 쓰면(읽기→쓰기) 그 사이에 다른 요청이 끼어들 수 있다.
// 그래서 repository의 "WHERE id AND version" UPDATE 한 번으로 비교와 저장을 동시에 한다.
// DB가 한 행을 한 번에 하나의 UPDATE만 처리하므로, 같은 version으로 동시에 온 두 요청 중 하나만 성공한다.
// 0행이 갱신됐을 때만 원인(행 없음 / 버전 불일치)을 알아보려고 다시 읽는다.
async function updatePlan(id, version, changes, user) {
	if (!UUID_PATTERN.test(id)) throw httpError(404, NOT_FOUND_MESSAGE);
	if (!isAdmin(user) && Object.hasOwn(changes, 'status')) {
		throw httpError(403, STATUS_FORBIDDEN_MESSAGE);
	}
	const updated = await imgagongPlansRepository.updateIfVersion(id, version, changes, user.id);
	if (updated) return updated;

	const current = await imgagongPlansRepository.findById(id);
	if (!current) throw httpError(404, NOT_FOUND_MESSAGE);
	if (!isVersionMatch(current.version, version)) throw httpError(409, CONFLICT_MESSAGE);
	// 버전은 같은데 0행이었다면, 읽는 사이 다른 요청이 먼저 저장하고 끝난 경합이다. 이것도 충돌로 본다.
	throw httpError(409, CONFLICT_MESSAGE);
}

// owner(과제 담당자)는 이름 문자열이라 로그인 사용자의 name과 공백을 제거해 비교한다.
// 사용자 이름이 비어 있으면 빈 owner('')와 우연히 일치하지 않도록 항상 false.
function isOwner(plan, user) {
	return (
		typeof user.name === 'string' &&
		user.name.trim() !== '' &&
		plan.owner.trim() === user.name.trim()
	);
}

// 삭제는 owner 본인 또는 관리자만. 행이 없으면 권한 판단 전에 404.
async function deletePlan(id, user) {
	if (!UUID_PATTERN.test(id)) throw httpError(404, NOT_FOUND_MESSAGE);
	const plan = await imgagongPlansRepository.findById(id);
	if (!plan) throw httpError(404, NOT_FOUND_MESSAGE);
	if (!isAdmin(user) && !isOwner(plan, user)) throw httpError(403, DELETE_FORBIDDEN_MESSAGE);
	await imgagongPlansRepository.deleteById(plan.id);
	return { id: plan.id };
}

module.exports = {
	isVersionMatch,
	nextMonthStart,
	listPlans,
	createPlan,
	updatePlan,
	deletePlan
};
