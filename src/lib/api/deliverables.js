// /deliverables 엔드포인트와 1:1로 대응하는 API 함수 (deliverablesStore가 사용)
import { request } from './client.js';

export const listDeliverables = ({ page, limit, search } = {}) =>
	request('/deliverables', { query: { page, limit, search } });

// 파일 업로드는 JSON이 아니라 multipart/form-data(FormData)로 보낸다
export function createDeliverable({ mpwRound, processName, file }) {
	const formData = new FormData();
	formData.append('mpwRound', mpwRound);
	formData.append('processName', processName);
	formData.append('file', file); // 서버의 upload.single('file')과 필드명이 같아야 한다
	return request('/deliverables', { method: 'POST', body: formData });
}

// JSON이 아닌 응답이라 Blob이 반환된다
export const downloadDeliverable = (id) => request(`/deliverables/${id}/download`);

export const deleteDeliverable = (id) => request(`/deliverables/${id}`, { method: 'DELETE' });
