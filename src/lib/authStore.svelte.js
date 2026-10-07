// 로그인 사용자 상태. React라면 AuthContext + Provider(또는 Zustand 스토어)로 만들 것을,
// Svelte에서는 모듈 수준 $state 하나로 해결한다. 모듈 상태는 페이지를 이동해도 유지된다.
// 화면 이동(goto)은 여기서 하지 않는다 — +layout.svelte의 가드가 auth.user를 보고 처리한다.
import * as authApi from './api/auth.js';

// user: 로그인한 사용자(없으면 null), checked: 앱 시작 시 세션 확인이 끝났는지
// export한 $state는 재할당할 수 없으므로 아래 함수들은 내용(속성)만 바꾼다.
export const auth = $state({ user: null, checked: false });

// 앱 시작 시 1회 호출. 쿠키 세션이 살아 있으면 user가 채워진다. 항상 resolve한다.
export async function checkSession() {
	try {
		auth.user = await authApi.getMe();
	} catch {
		auth.user = null;
	} finally {
		auth.checked = true;
	}
}

// 실패(401 등)는 그대로 throw한다 — 에러 메시지 표시는 로그인 페이지 책임. 실패 시 상태는 변하지 않는다.
export async function login(email, password) {
	auth.user = await authApi.login(email, password);
}

// 서버 요청이 실패해도 화면은 로그아웃 처리한다. 항상 resolve한다.
export async function logout() {
	try {
		await authApi.logout();
	} catch (err) {
		console.warn('로그아웃 요청 실패 — 화면은 로그아웃 처리합니다', err);
	} finally {
		auth.user = null;
	}
}

// 다른 스토어가 API에서 401을 받았을 때(err.status === 401) 호출한다.
export function clearUser() {
	auth.user = null;
}

export function isAdmin() {
	return auth.user?.role === 'admin';
}
