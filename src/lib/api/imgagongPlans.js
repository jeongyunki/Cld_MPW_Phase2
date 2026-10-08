// /imgagong-plans 엔드포인트와 1:1로 대응하는 API 함수 (imgagongStore가 사용)
import { request } from './client.js';

// 값이 없는 필터는 client가 쿼리스트링에서 뺀다
export const listImgagongPlans = ({ page, limit, startMonth, endMonth } = {}) =>
	request('/imgagong-plans', { query: { page, limit, startMonth, endMonth } });

export const createImgagongPlan = (fields) =>
	request('/imgagong-plans', { method: 'POST', body: fields });

// 낙관적 잠금: fields에 읽어 온 version을 함께 보낸다 (서버가 다르면 409)
export const updateImgagongPlan = (id, fields) =>
	request(`/imgagong-plans/${id}`, { method: 'PATCH', body: fields });

export const deleteImgagongPlan = (id) => request(`/imgagong-plans/${id}`, { method: 'DELETE' });

// 관리자 전용 일괄 의뢰 확정 ('checked' 행만 'requested'로). 응답은 { data: [바뀐 행] }
export const bulkConfirmImgagongPlans = (ids) =>
	request('/imgagong-plans/bulk-confirm', { method: 'PATCH', body: { ids } });
