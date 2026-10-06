// HTTP 입출력만 담당 — 요청 형식 검사(400)와 응답 상태코드. 업무 규칙은 service가 맡는다.
// try/catch가 없어도 된다: Express 5는 async 함수가 던진 에러를 errorHandler로 자동 전달한다.

const masterItemsService = require('./master-items.service');

async function getMasterItems(req, res) {
	res.json(await masterItemsService.listGrouped());
}

async function createMasterItem(req, res) {
	const { fieldName, itemName } = req.body ?? {};
	if (!masterItemsService.FIELD_NAMES.includes(fieldName)) {
		return res.status(400).json({
			error: {
				message: 'fieldName은 status, category, assembler, chipSize, pkgType 중 하나여야 합니다'
			}
		});
	}
	if (typeof itemName !== 'string' || !itemName.trim()) {
		return res.status(400).json({ error: { message: '항목명을 입력해 주세요' } });
	}
	res.status(201).json(await masterItemsService.createItem(fieldName, itemName.trim()));
}

async function deleteMasterItem(req, res) {
	res.json(await masterItemsService.deleteItem(req.params.id));
}

module.exports = { getMasterItems, createMasterItem, deleteMasterItem };
