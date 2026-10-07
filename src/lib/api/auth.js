// /auth 엔드포인트와 1:1로 대응하는 API 함수 (authStore가 사용)
import { request } from './client.js';

export const login = (email, password) =>
	request('/auth/login', { method: 'POST', body: { email, password } });
export const logout = () => request('/auth/logout', { method: 'POST' });
export const getMe = () => request('/auth/me');
