// SSE(Server-Sent Events) — 서버가 연결된 브라우저들에게 보내는 "단방향 방송".
// WebSocket은 양방향이라 더 복잡하지만, 이 프로젝트는 "서버 → 화면" 알림만 필요하므로 SSE로 충분하다.
// SSE는 평범한 HTTP 응답을 끝내지 않고 열어 둔 채, 아래 형식의 텍스트를 계속 흘려보낸다.
//   event: 이벤트이름\n
//   data: JSON문자열\n
//   \n            ← 빈 줄이 메시지 하나의 끝
// ':'로 시작하는 줄은 주석이라 브라우저(EventSource)가 무시한다. 연결 확인과 heartbeat에 쓴다.
//
// 호출 원칙(계층 규칙):
// - 업무 이벤트 발행(broadcast)은 service만 호출한다. "무엇이 바뀌었는가"는 업무 규칙이기 때문이다.
// - req/res가 필요한 HTTP 연결(addClient)은 controller가 직접 호출한다(lib/upload.js와 같은 선례).
// - 이 파일은 Node 기본 req/res 메서드만 쓰고 Express·DB·service를 import하지 않는다.
// 서버가 한 프로세스라는 전제의 메모리 방식이다. 여러 서버로 늘리면 Redis 등이 필요하지만 지금은 범위 밖.

const HEARTBEAT_INTERVAL_MS = 30 * 1000;

// 지금 연결된 브라우저들의 응답 객체(res)
const clients = new Set();
let heartbeatTimer = null;

function writeAll(chunk) {
	for (const res of clients) res.write(chunk);
}

// heartbeat: 30초마다 아무 일 없어도 주석 줄을 보낸다.
// 프록시·로드밸런서는 한동안 데이터가 오가지 않는 연결을 "유휴"로 보고 끊는 경우가 많은데,
// 주기적으로 바이트를 흘려보내면 연결이 살아 있다고 인식해 끊지 않는다.
function sendHeartbeat() {
	writeAll(': ping\n\n');
}

// 타이머는 모듈 전체에 하나만 둔다(연결마다 만들지 않는다). 첫 클라이언트가 붙을 때 시작한다.
// setInterval은 호출 시점에 전역을 참조한다(테스트의 가짜 타이머가 바꿔 끼울 수 있게).
function startHeartbeat() {
	if (heartbeatTimer) return;
	heartbeatTimer = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);
	// unref: 이 타이머만 남았을 때는 프로세스가 종료되도록 허용한다.
	// 없으면 heartbeat 타이머가 이벤트 루프를 붙잡아 서버를 닫아도 Node가 끝나지 않는다.
	heartbeatTimer.unref();
}

function stopHeartbeat() {
	clearInterval(heartbeatTimer);
	heartbeatTimer = null;
}

// 브라우저 연결을 SSE 스트림으로 열고 목록에 등록한다. 응답을 끝내지(res.end) 않는 것이 핵심이다.
function addClient(req, res) {
	res.writeHead(200, {
		'Content-Type': 'text/event-stream',
		'Cache-Control': 'no-cache',
		Connection: 'keep-alive'
	});
	// 헤더를 즉시 내보내 브라우저가 "연결됨"으로 인식하게 한다.
	res.flushHeaders();
	res.write(': connected\n\n');
	clients.add(res);
	startHeartbeat();
	// 브라우저가 탭을 닫거나 네트워크가 끊기면 'close'가 발생한다. 목록에서 빼지 않으면 죽은 연결에 계속 쓴다.
	req.on('close', () => {
		clients.delete(res);
		if (clients.size === 0) stopHeartbeat();
	});
}

// 연결된 모든 브라우저에게 이벤트를 보낸다. 연결이 없으면 아무 일도 하지 않는다.
function broadcast(event, data) {
	writeAll(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function clientCount() {
	return clients.size;
}

module.exports = { HEARTBEAT_INTERVAL_MS, addClient, broadcast, sendHeartbeat, clientCount };
