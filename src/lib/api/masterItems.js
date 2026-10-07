// /master-items 엔드포인트와 1:1로 대응하는 API 함수 (masterStore가 사용)
import { request } from './client.js';

export const listMasterItems = () => request('/master-items');

export const createMasterItem = (fieldName, itemName) =>
	request('/master-items', { method: 'POST', body: { fieldName, itemName } });

export const deleteMasterItem = (id) => request(`/master-items/${id}`, { method: 'DELETE' });
