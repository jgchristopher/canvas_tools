export const HTML_RUNTIME = `
(function () {
	// ── State hydration ──────────────────────────────────────────────────────
	var viewport = document.querySelector('.ct-viewport');
	var canvas = document.querySelector('.ct-canvas');
	if (!viewport || !canvas) return;

	var bounds = JSON.parse(canvas.getAttribute('data-bounds') || '{"x":0,"y":0,"w":0,"h":0}');
	var interactive = canvas.getAttribute('data-interactive') === 'true';
	var stateEl = document.getElementById('ct-state');
	var state = stateEl ? JSON.parse(stateEl.textContent || '{}') : { nodes: [], edges: [] };
	var nodeMap = {};
	for (var i = 0; i < (state.nodes || []).length; i++) nodeMap[state.nodes[i].id] = state.nodes[i];

	// Index edges by node for fast lookup during drag/resize
	var edgesByNode = {};
	for (var j = 0; j < (state.edges || []).length; j++) {
		var e = state.edges[j];
		(edgesByNode[e.from.node] = edgesByNode[e.from.node] || []).push(e);
		(edgesByNode[e.to.node] = edgesByNode[e.to.node] || []).push(e);
	}

	// Snapshot of the original layout for reset
	var original = JSON.parse(JSON.stringify(state));

	// ── Pan / zoom (existing behaviour) ──────────────────────────────────────
	var view = { tx: 0, ty: 0, scale: 1 };
	var minScale = 0.1, maxScale = 4;
	function applyView() {
		canvas.style.transform = 'translate(' + view.tx + 'px,' + view.ty + 'px) scale(' + view.scale + ')';
	}
	function fit() {
		if (!bounds.w || !bounds.h) return;
		var pad = 40;
		var sx = (viewport.clientWidth - pad * 2) / bounds.w;
		var sy = (viewport.clientHeight - pad * 2) / bounds.h;
		var s = Math.min(sx, sy, 1);
		view.scale = s;
		view.tx = pad - bounds.x * s + (viewport.clientWidth - pad * 2 - bounds.w * s) / 2;
		view.ty = pad - bounds.y * s + (viewport.clientHeight - pad * 2 - bounds.h * s) / 2;
		applyView();
	}
	function zoomAt(clientX, clientY, factor) {
		var next = Math.max(minScale, Math.min(maxScale, view.scale * factor));
		var actual = next / view.scale;
		view.tx = clientX - (clientX - view.tx) * actual;
		view.ty = clientY - (clientY - view.ty) * actual;
		view.scale = next;
		applyView();
	}
	viewport.addEventListener('wheel', function (e) {
		e.preventDefault();
		zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0015));
	}, { passive: false });

	// ── Hit testing ──────────────────────────────────────────────────────────
	function hitTest(target) {
		var el = target;
		while (el && el !== viewport) {
			if (el.tagName === 'A') return { kind: 'link' };
			if (el.classList && el.classList.contains('ct-handle')) {
				var nodeEl = el.parentElement;
				var nodeId = nodeEl && nodeEl.getAttribute('data-id');
				if (nodeId) return { kind: 'resize', nodeId: nodeId, anchor: el.getAttribute('data-resize'), nodeEl: nodeEl };
			}
			if (el.classList && el.classList.contains('ct-node') && !el.classList.contains('ct-node-group')) {
				var id = el.getAttribute('data-id');
				if (id) return { kind: 'move', nodeId: id, nodeEl: el };
			}
			el = el.parentElement;
		}
		return { kind: 'pan' };
	}

	// Helpers exposed for the next runtime sections
	window.__ctRuntime = { state: state, nodeMap: nodeMap, edgesByNode: edgesByNode, original: original, view: view, viewport: viewport, canvas: canvas, hitTest: hitTest, interactive: interactive, applyView: applyView, fit: fit, zoomAt: zoomAt };

	// ── Drag (pan + node move) ───────────────────────────────────────────────
	var DRAG_THRESHOLD = 3;
	var active = null;
	// Touch section below reuses these vars for touch pan
	var dragging = false;
	var startX = 0, startY = 0, startTx = 0, startTy = 0;
	function startActive(target, e) {
		var hit = hitTest(target);
		if (hit.kind === 'link') return null;
		return { hit: hit, startX: e.clientX, startY: e.clientY, panTx: view.tx, panTy: view.ty, committed: false };
	}
	viewport.addEventListener('mousedown', function (e) {
		if (e.button !== 0) return;
		active = startActive(e.target, e);
	});
	window.addEventListener('mousemove', function (e) {
		if (!active) return;
		var dx = e.clientX - active.startX;
		var dy = e.clientY - active.startY;
		if (!active.committed) {
			if (Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;
			active.committed = true;
			if (active.hit.kind === 'move') {
				active.startNode = { x: nodeMap[active.hit.nodeId].x, y: nodeMap[active.hit.nodeId].y };
				active.hit.nodeEl.classList.add('ct-dragging');
			} else if (active.hit.kind === 'pan') {
				viewport.classList.add('ct-panning');
			}
		}
		if (!interactive && active.hit.kind !== 'pan') return;
		if (active.hit.kind === 'pan') {
			view.tx = active.panTx + dx;
			view.ty = active.panTy + dy;
			applyView();
			return;
		}
		if (active.hit.kind === 'move') {
			var n = nodeMap[active.hit.nodeId];
			n.x = active.startNode.x + dx / view.scale;
			n.y = active.startNode.y + dy / view.scale;
			active.hit.nodeEl.style.left = (n.x - bounds.x) + 'px';
			active.hit.nodeEl.style.top = (n.y - bounds.y) + 'px';
			scheduleEdgeUpdate(active.hit.nodeId);
		}
	});
	window.addEventListener('mouseup', function () {
		if (active && active.committed) {
			if (active.hit.kind === 'move') active.hit.nodeEl.classList.remove('ct-dragging');
			if (active.hit.kind === 'pan') viewport.classList.remove('ct-panning');
		}
		active = null;
	});

	// ── Edge updater (stub; real implementation in next task) ────────────────
	function scheduleEdgeUpdate(_nodeId) { /* implemented in next task */ }
	var lastTouchDist = null, lastTouchMid = null;
	viewport.addEventListener('touchstart', function (e) {
		if (e.touches.length === 1) {
			var hit = hitTest(e.target);
			if (hit.kind !== 'pan') return;
			startX = e.touches[0].clientX;
			startY = e.touches[0].clientY;
			startTx = view.tx; startTy = view.ty;
			dragging = true;
		} else if (e.touches.length === 2) {
			dragging = false;
			lastTouchDist = touchDistance(e.touches);
			lastTouchMid = touchMidpoint(e.touches);
		}
	}, { passive: true });
	viewport.addEventListener('touchmove', function (e) {
		if (e.touches.length === 1 && dragging) {
			view.tx = startTx + (e.touches[0].clientX - startX);
			view.ty = startTy + (e.touches[0].clientY - startY);
			applyView();
		} else if (e.touches.length === 2 && lastTouchDist !== null && lastTouchMid !== null) {
			var dist = touchDistance(e.touches);
			var mid = touchMidpoint(e.touches);
			zoomAt(mid.x, mid.y, dist / lastTouchDist);
			view.tx += mid.x - lastTouchMid.x;
			view.ty += mid.y - lastTouchMid.y;
			applyView();
			lastTouchDist = dist;
			lastTouchMid = mid;
		}
	}, { passive: true });
	viewport.addEventListener('touchend', function () {
		dragging = false;
		lastTouchDist = null;
		lastTouchMid = null;
	});
	function touchDistance(t) { var dx = t[0].clientX - t[1].clientX; var dy = t[0].clientY - t[1].clientY; return Math.sqrt(dx * dx + dy * dy); }
	function touchMidpoint(t) { return { x: (t[0].clientX + t[1].clientX) / 2, y: (t[0].clientY + t[1].clientY) / 2 }; }

	// ── Toolbar (zoom + fit) ─────────────────────────────────────────────────
	var toolbar = document.createElement('div');
	toolbar.className = 'ct-toolbar';
	toolbar.innerHTML =
		'<button data-act="zoom-in" title="Zoom in">+</button>' +
		'<button data-act="zoom-out" title="Zoom out">−</button>' +
		'<button data-act="fit" title="Fit to view">⤢</button>';
	document.body.appendChild(toolbar);
	toolbar.addEventListener('click', function (e) {
		var btn = e.target;
		if (btn.tagName !== 'BUTTON') return;
		var act = btn.getAttribute('data-act');
		var cx = viewport.clientWidth / 2;
		var cy = viewport.clientHeight / 2;
		if (act === 'zoom-in') zoomAt(cx, cy, 1.2);
		else if (act === 'zoom-out') zoomAt(cx, cy, 1 / 1.2);
		else if (act === 'fit') fit();
	});

	window.addEventListener('resize', fit);
	fit();
})();
`;
