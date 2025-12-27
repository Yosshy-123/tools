// --- Helpers & UI wiring ---
function ensureRoom() {
	const params = new URLSearchParams(location.search);
	let r = params.get("chatroom");
	if (!r) {
		r = "room";
		params.set("chatroom", r);
		history.replaceState(null, "", location.pathname + "?" + params.toString());
	}
	return r;
}

let room = ensureRoom();
const myId = Math.random().toString(36).slice(2);

const $roomLabel = document.getElementById('roomLabel');
const $roomInput = document.getElementById('roomInput');
const $nameInput = document.getElementById('nameInput');
const $shareBtn = document.getElementById('shareBtn');
const $goBtn = document.getElementById('goBtn');
const $saveName = document.getElementById('saveNameBtn');
const $online = document.getElementById('online');
const $log = document.getElementById('chatlog');
const $msg = document.getElementById('msgInput');
const $send = document.getElementById('sendBtn');
const $toast = document.getElementById('toast');

$roomLabel.textContent = room;
$roomInput.value = room;

const savedName = localStorage.getItem('chat_handle') || '';
$nameInput.value = savedName;

function getHandle() {
	const n = $nameInput.value.trim();
	return n || 'Anonymous';
}

function showToast(text, ms = 2000) {
	$toast.textContent = text;
	$toast.style.display = 'block';
	clearTimeout($toast._t);
	$toast._t = setTimeout(() => {
		$toast.style.display = 'none';
	}, ms);
}

$saveName.addEventListener('click', () => {
	localStorage.setItem('chat_handle', getHandle());
	showToast('Name saved');
});

async function copyToClipboard(text) {
	if (navigator.clipboard && navigator.clipboard.writeText) {
		try {
			await navigator.clipboard.writeText(text);
			return true;
		} catch (e) {}
	}
	try {
		const ta = document.createElement('textarea');
		ta.value = text;
		ta.style.position = 'fixed';
		ta.style.left = '-9999px';
		document.body.appendChild(ta);
		ta.focus();
		ta.select();
		const ok = document.execCommand('copy');
		document.body.removeChild(ta);
		return ok;
	} catch (e) {
		return false;
	}
}

$goBtn.onclick = () => {
	const v = $roomInput.value.trim();
	if (!v) return;
	const params = new URLSearchParams(location.search);
	params.set("chatroom", v);
	location.search = params.toString();
};
$roomInput.addEventListener('keydown', e => {
	if (e.key === 'Enter') $goBtn.click();
});

$shareBtn.addEventListener('click', async () => {
	const url = location.origin + location.pathname + "?chatroom=" + encodeURIComponent(room);
	const ok = await copyToClipboard(url);
	if (ok) showToast('Link copied');
	else showToast('Copy failed');
});

function fmtTime(d = new Date()) {
	const f = n => String(n).padStart(2, '0');
	return `${d.getFullYear()}/${f(d.getMonth()+1)}/${f(d.getDate())} ${f(d.getHours())}:${f(d.getMinutes())}:${f(d.getSeconds())}`;
}

function addLine(name, text, mine = false) {
	const wrapper = document.createElement('div');
	wrapper.className = 'msg' + (mine ? ' me' : '');

	const meta = document.createElement('div');
	meta.className = 'meta';
	meta.textContent = `${name} · ${fmtTime()}`;
	const body = document.createElement('div');
	body.textContent = text;

	wrapper.appendChild(meta);
	wrapper.appendChild(body);
	$log.appendChild(wrapper);
	$log.scrollTop = $log.scrollHeight;
}

const PRESENCE_TTL = 10000;
const presence = new Map();

function refreshOnline() {
	const now = Date.now();
	for (const [id, t] of presence)
		if (now - t > PRESENCE_TTL) presence.delete(id);
	$online.textContent = presence.size;
}
presence.set(myId, Date.now());
refreshOnline();

// --- WebSocket management ---
let ws = null;
let heartbeatTimer = null;
let pruneTimer = null;
let reconnectDelay = 800;
const RECONNECT_MAX = 30000;
let authorized = false;

function startPresenceLoop() {
	if (heartbeatTimer) return;
	heartbeatTimer = setInterval(() => {
		if (ws && ws.readyState === WebSocket.OPEN) {
			ws.send(JSON.stringify({
				to: room,
				id: myId,
				type: 'presence',
				name: getHandle()
			}));
		}
		presence.set(myId, Date.now());
		refreshOnline();
	}, 5000);
	pruneTimer = setInterval(refreshOnline, 2000);
}

function stopPresenceLoop() {
	clearInterval(heartbeatTimer);
	heartbeatTimer = null;
	clearInterval(pruneTimer);
	pruneTimer = null;
}

function connect() {
	// Note: keep backend origin configurable in production
	ws = new WebSocket('wss://cloud.achex.ca/chat');

	ws.addEventListener('open', () => {
		ws.send(JSON.stringify({
			auth: room,
			password: 'pass'
		}));
		ws.send(JSON.stringify({
			to: room,
			id: myId,
			type: 'presence',
			name: getHandle()
		}));
		startPresenceLoop();
		reconnectDelay = 800;
		authorized = false;
		showToast('Connected');
	});

	ws.addEventListener('message', (e) => {
		let obj;
		try {
			obj = JSON.parse(e.data);
		} catch {
			return;
		}
		if (obj.auth === 'OK') {
			authorized = true;
			return;
		}

		if (obj.type === 'presence' && obj.id) {
			presence.set(obj.id, Date.now());
			refreshOnline();
			return;
		}

		const name = obj.name || 'Anonymous';
		const msg = String(obj.message ?? '');
		if (!msg) return;
		const mine = (obj.id === myId);
		addLine(name, msg, mine);
	});

	ws.addEventListener('close', () => {
		stopPresenceLoop();
		const delay = Math.min(reconnectDelay + Math.random() * 200, RECONNECT_MAX);
		setTimeout(connect, delay);
		reconnectDelay = Math.min(reconnectDelay * 1.7, RECONNECT_MAX);
		showToast('Disconnected — reconnecting');
	});

	ws.addEventListener('error', () => {
		/* fail silently; reconnect handles retry */ });
}
connect();

document.addEventListener('visibilitychange', () => {
	if (document.hidden) stopPresenceLoop();
	else {
		presence.set(myId, Date.now());
		refreshOnline();
		if (ws && ws.readyState === WebSocket.OPEN) startPresenceLoop();
	}
});

function send() {
	const text = $msg.value.trim();
	if (!text) return;
	if (!ws || ws.readyState !== WebSocket.OPEN) {
		showToast('Connecting...');
		return;
	}
	const payload = {
		to: room,
		id: myId,
		name: getHandle(),
		message: text
	};
	ws.send(JSON.stringify(payload));
	$msg.value = '';
}

$send.addEventListener('click', send);
$msg.addEventListener('keydown', (e) => {
	if (e.key === 'Enter') send();
});

refreshOnline();
