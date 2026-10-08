// 임가공 Plan 실시간 변경 스트림(SSE). 브라우저 기본 EventSource를 한 겹만 감싼다.
// 구독자가 여럿이어도 EventSource 연결은 하나만 열고 공유한다(서버 연결 수를 늘리지 않기 위해).
// WebSocket과 달리 서버 → 브라우저 단방향이고, 끊기면 브라우저가 알아서 재연결을 시도한다.

// 서버(server/src/lib/sse.js)가 보내는 이벤트 이름
const EVENT_NAMES = ['created', 'updated', 'deleted', 'bulk-confirmed'];

let source = null;
// 구독자 목록: { onEvent(name, data), onStatus(status) }
const subscribers = new Set();

function notifyStatus(status) {
	for (const s of subscribers) s.onStatus?.(status);
}

function open() {
	const base = import.meta.env.VITE_API_BASE_URL;
	if (!base) throw new Error('VITE_API_BASE_URL이 설정되지 않았습니다 (루트 .env 확인)');

	// withCredentials: 백엔드가 다른 출처(3001)여도 세션 쿠키를 함께 보낸다 (fetch의 credentials: 'include'와 같은 역할)
	source = new EventSource(base.replace(/\/$/, '') + '/imgagong-plans/stream', {
		withCredentials: true
	});
	source.onopen = () => notifyStatus('open');
	// EventSource는 HTTP 상태코드(401 등)를 알려주지 않는다. readyState로만 구분한다.
	// - CONNECTING: 네트워크가 끊겨 브라우저가 자동 재연결 중
	// - CLOSED: 서버가 스트림이 아닌 응답(401 등)을 줘서 브라우저가 재연결을 포기함
	source.onerror = () => {
		notifyStatus(source.readyState === EventSource.CLOSED ? 'closed' : 'reconnecting');
	};
	for (const name of EVENT_NAMES) {
		source.addEventListener(name, (e) => {
			const data = JSON.parse(e.data);
			for (const s of subscribers) s.onEvent(name, data);
		});
	}
}

/**
 * 스트림을 구독한다. 첫 구독자일 때 연결을 열고, 해제 함수를 돌려준다.
 * 마지막 구독자가 해제하면 연결을 닫는다 (페이지를 떠날 때 연결이 쌓이지 않게).
 */
export function subscribeImgagongStream({ onEvent, onStatus }) {
	if (!source) open();
	const subscriber = { onEvent, onStatus };
	subscribers.add(subscriber);
	return () => {
		subscribers.delete(subscriber);
		if (subscribers.size === 0 && source) {
			source.close();
			source = null;
		}
	};
}
