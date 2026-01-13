const DB_NAME = 'NoteDB';
const STORE = 'notes';

function openDB() {
	return new Promise((res, rej) => {
		const r = indexedDB.open(DB_NAME, 1);
		r.onupgradeneeded = e => {
			const db = e.target.result;
			if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, {
				keyPath: 'id',
				autoIncrement: !0
			});
		};
		r.onsuccess = () => res(r.result);
		r.onerror = () => rej(r.error);
	});
}
async function all() {
	const db = await openDB();
	return new Promise((res, rej) => {
		const tx = db.transaction(STORE);
		const s = tx.objectStore(STORE);
		const r = s.getAll();
		r.onsuccess = () => {
			res(r.result);
			db.close();
		};
		r.onerror = () => {
			rej(r.error);
			db.close();
		};
	});
}
async function add(item) {
	const db = await openDB();
	return new Promise((res, rej) => {
		const tx = db.transaction(STORE, 'readwrite');
		const s = tx.objectStore(STORE);
		const r = s.add(item);
		r.onsuccess = () => {
			res(r.result);
			db.close();
		};
		r.onerror = () => {
			rej(r.error);
			db.close();
		};
	});
}
async function put(item) {
	const db = await openDB();
	return new Promise((res, rej) => {
		const tx = db.transaction(STORE, 'readwrite');
		const s = tx.objectStore(STORE);
		const r = s.put(item);
		r.onsuccess = () => {
			res(r.result);
			db.close();
		};
		r.onerror = () => {
			rej(r.error);
			db.close();
		};
	});
}
async function del(id) {
	const db = await openDB();
	return new Promise((res, rej) => {
		const tx = db.transaction(STORE, 'readwrite');
		const s = tx.objectStore(STORE);
		const r = s.delete(Number(id));
		r.onsuccess = () => {
			res();
			db.close();
		};
		r.onerror = () => {
			rej(r.error);
			db.close();
		};
	});
}
const listEl = document.getElementById('list');
const titleEl = document.getElementById('title');
const bodyEl = document.getElementById('body');
const newBtn = document.getElementById('newBtn');
const saveBtn = document.getElementById('saveBtn');
const deleteBtn = document.getElementById('deleteBtn');
const exportBtn = document.getElementById('exportBtn');
const searchEl = document.getElementById('search');
let current = null;
let timer = null;
let cache = [];

function fmt(d) {
	if (!d) return '-';
	return new Date(d).toLocaleString();
}

function esc(s) {
	return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
async function render(q = '') {
	cache = await all();
	cache.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
	listEl.innerHTML = '';
	const needle = (q || '').toLowerCase();
	if (cache.length === 0) {
		listEl.innerHTML = '<div style="padding:10px;color:#6b7280;">No notes</div>';
		return;
	}
	for (const m of cache) {
		const text = ((m.title || '') + '\n' + (m.body || '')).toLowerCase();
		if (needle && !text.includes(needle)) continue;
		const div = document.createElement('div');
		div.className = 'item' + (current && current.id === m.id ? ' active' : '');
		div.innerHTML = `<div style="font-weight:600;">${esc(m.title||'(Untitled)')}</div><div style="font-size:12px;color:#6b7280;">${fmt(m.updatedAt)}</div>`;
		div.onclick = () => select(m);
		listEl.appendChild(div);
	}
}

function select(m) {
	current = m;
	titleEl.value = m.title || '';
	bodyEl.value = m.body || '';
	render(searchEl.value);
}

function clear() {
	current = null;
	titleEl.value = '';
	bodyEl.value = '';
	render(searchEl.value);
}

async function save(showAlert = false) {
	const now = Date.now();
	const payload = {
		title: titleEl.value.trim(),
		body: bodyEl.value,
		updatedAt: now
	};
	if (current && current.id) {
		payload.id = current.id;
		await put(payload);
		current = payload;
	} else {
		const id = await add(payload);
		payload.id = id;
		current = payload;
	}
	await render(searchEl.value);

	if (showAlert) {
		alert('Saved');
	}
}

function schedule() {
	if (timer) clearTimeout(timer);
	timer = setTimeout(() => {
		save();
	}, 300);
}
newBtn.onclick = () => {
	clear();
	titleEl.focus();
};
saveBtn.onclick = () => save(true);
deleteBtn.onclick = async () => {
	if (!current || !current.id) {
		alert('No note selected');
		return;
	}
	if (!confirm('Delete this note?')) return;
	await del(current.id);
	clear();
};
exportBtn.onclick = async () => {
	const data = await all();
	const pad = (n) => String(n).padStart(2, '0');
	const now = new Date();
	const filename = `notes_${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}.${pad(now.getMinutes())}.${pad(now.getSeconds())}.json`;
	const blob = new Blob([JSON.stringify(data, null, 2)], {
		type: 'application/json'
	});
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	a.remove();
	URL.revokeObjectURL(url);
};
titleEl.addEventListener('input', schedule);
bodyEl.addEventListener('input', schedule);
searchEl.addEventListener('input', () => render(searchEl.value));
(async function() {
	await openDB();
	await render();
})();
document.getElementById("importBtn").addEventListener("click", () => {
	const input = document.createElement("input");
	input.type = "file";
	input.accept = "application/json";
	input.onchange = async (e) => {
		const file = e.target.files[0];
		if (!file) return;
		const text = await file.text();
		let parsed;
		try {
			parsed = JSON.parse(text);
		} catch (err) {
			alert("Import failed");
			return;
		}
		let items;
		if (Array.isArray(parsed)) {
			items = parsed;
		} else if (parsed && Array.isArray(parsed.notes)) {
			items = parsed.notes;
		} else {
			alert("Import failed");
			return;
		}
		if (items.length === 0) {
			alert("No notes found to import");
			return;
		}
		try {
			const db = await openDB();
			await new Promise((resolve, reject) => {
				const tx = db.transaction(STORE, "readwrite");
				const store = tx.objectStore(STORE);
				for (const it of items) {
					const entry = Object.assign({}, it);
					if ('id' in entry) delete entry.id;
					store.put(entry);
				}
				tx.oncomplete = () => {
					db.close();
					resolve();
				};
				tx.onerror = () => {
					db.close();
					reject(tx.error || new Error("transaction error"));
				};
				tx.onabort = () => {
					db.close();
					reject(tx.error || new Error("transaction aborted"));
				};
			});
			alert(`${items.length} notes imported`);
			await render();
		} catch (err) {
			alert("An error occurred during import");
		}
	};
	input.click();
});
