// Vitest 테스트 — auth 함수(login / logout / getMe)가 올바른 URL/메서드/본문으로 fetch를 부르는지 확인한다.
// Jest의 jest.fn()과 같은 vi.fn()으로 fetch를 가짜로 바꿔, 실제 백엔드 없이 요청 내용과 에러 전파만 검증한다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getMe, login, logout } from './auth.js';

const BASE = 'http://api.test/api';
const jsonResponse = (data, status = 200) =>
	new Response(JSON.stringify(data), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});

const user = {
	id: 'u1',
	name: '관리자',
	email: 'admin@mpw.local',
	role: 'admin',
	createdAt: '2026-10-01T00:00:00.000Z',
	updatedAt: null,
	version: 1
};

let fetchMock;

beforeEach(() => {
	vi.stubEnv('VITE_API_BASE_URL', BASE);
	fetchMock = vi.fn(async () => jsonResponse(user));
	vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
	vi.unstubAllEnvs();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe('auth', () => {
	it('A1 login은 POST /auth/login + JSON body {email, password} 를 보낸다', async () => {
		await login('a@b.c', 'pw');
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe(`${BASE}/auth/login`);
		expect(init).toStrictEqual({
			method: 'POST',
			credentials: 'include',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ email: 'a@b.c', password: 'pw' })
		});
	});

	it('A2 login은 응답의 user를 그대로 반환한다', async () => {
		await expect(login('a@b.c', 'pw')).resolves.toStrictEqual(user);
	});

	it('A3 login이 401이면 status 401과 서버 메시지를 가진 에러로 reject한다', async () => {
		fetchMock.mockResolvedValueOnce(
			jsonResponse({ error: { message: '이메일 또는 비밀번호가 올바르지 않습니다' } }, 401)
		);
		const err = await login('a@b.c', 'bad').catch((e) => e);
		expect(err.status).toBe(401);
		expect(err.message).toBe('이메일 또는 비밀번호가 올바르지 않습니다');
	});

	it('A4 logout은 POST /auth/logout 을 호출한다', async () => {
		await logout();
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe(`${BASE}/auth/logout`);
		expect(init).toStrictEqual({ method: 'POST', credentials: 'include' });
	});

	it('A5 getMe는 GET /auth/me 를 호출하고 user를 반환한다', async () => {
		const result = await getMe();
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe(`${BASE}/auth/me`);
		expect(init).toStrictEqual({ method: 'GET', credentials: 'include' });
		expect(result).toStrictEqual(user);
	});

	it('A6 getMe가 401이면 status 401 에러로 reject한다', async () => {
		fetchMock.mockResolvedValueOnce(
			jsonResponse({ error: { message: '로그인이 필요합니다' } }, 401)
		);
		const err = await getMe().catch((e) => e);
		expect(err.status).toBe(401);
		expect(err.message).toBe('로그인이 필요합니다');
	});

	it('A7 네트워크 실패(fetch reject)는 TypeError 그대로 전파되고 status가 없다', async () => {
		fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
		const err = await login('a@b.c', 'pw').catch((e) => e);
		expect(err).toBeInstanceOf(TypeError);
		expect(err.status).toBeUndefined();
	});
});
