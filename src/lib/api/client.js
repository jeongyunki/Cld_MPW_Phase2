// API 클라이언트 공통 계층. axios 인스턴스 대신 fetch를 한 겹만 감싼다.
// 리소스 모듈(masterItems.js 등)은 모두 이 request 함수만 호출한다.

/**
 * 백엔드에 요청을 보내고 응답 본문을 돌려준다.
 * - JSON 응답이면 파싱된 객체, 그 외(파일 다운로드 등)면 Blob
 * - 4xx/5xx면 err.status와 서버 메시지(err.message)가 담긴 Error를 던진다
 * - 네트워크 실패(TypeError)는 감싸지 않고 그대로 전파한다. 콘솔 출력·화면 표시는 스토어 책임.
 */
export async function request(path, { method = 'GET', query, body } = {}) {
	// 호출할 때마다 읽는다 (React의 process.env.REACT_APP_* 처럼 빌드 시 .env 값이 들어온다)
	const base = import.meta.env.VITE_API_BASE_URL;
	if (!base) throw new Error('VITE_API_BASE_URL이 설정되지 않았습니다 (루트 .env 확인)');

	let url = base.replace(/\/$/, '') + path;

	// undefined/null인 필터는 빼고, 나머지는 인코딩해서 쿼리스트링으로 만든다
	if (query) {
		const params = new URLSearchParams();
		for (const [key, value] of Object.entries(query)) {
			if (value !== undefined && value !== null) params.append(key, String(value));
		}
		const qs = params.toString();
		if (qs) url += `?${qs}`;
	}

	// credentials: 'include' — 세션 쿠키 인증이라, 백엔드 주소가 다른 출처여도 쿠키를 함께 보낸다
	const init = { method, credentials: 'include' };
	if (body instanceof FormData) {
		// Content-Type을 일부러 지정하지 않는다. 브라우저가 multipart boundary를 포함해 자동으로 넣는다
		// (직접 지정하면 boundary가 빠져 서버가 파일을 파싱하지 못한다)
		init.body = body;
	} else if (body !== undefined) {
		init.headers = { 'Content-Type': 'application/json' };
		init.body = JSON.stringify(body);
	}

	const res = await fetch(url, init);
	const isJson = (res.headers.get('content-type') ?? '').includes('application/json');

	if (!res.ok) {
		// 에러 응답 형식: { error: { message } }. 메시지를 못 꺼내면 상태 코드로 대신한다
		let message = `HTTP ${res.status}`;
		if (isJson) {
			try {
				message = (await res.json()).error?.message ?? message;
			} catch {
				// JSON이 깨졌으면 대체 메시지 사용 (eslint no-empty 때문에 주석 유지)
			}
		}
		throw Object.assign(new Error(message), { status: res.status });
	}

	return isJson ? res.json() : res.blob();
}
