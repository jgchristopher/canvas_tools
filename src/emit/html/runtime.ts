export const HTML_RUNTIME = `
(function () {
	var viewport = document.querySelector('.ct-viewport');
	var canvas = document.querySelector('.ct-canvas');
	if (!viewport || !canvas) return;

	var bounds = JSON.parse(canvas.getAttribute('data-bounds') || '{"x":0,"y":0,"w":0,"h":0}');
	var state = { tx: 0, ty: 0, scale: 1 };
	var minScale = 0.1;
	var maxScale = 4;

	function apply() {
		canvas.style.transform = 'translate(' + state.tx + 'px,' + state.ty + 'px) scale(' + state.scale + ')';
	}

	function fit() {
		if (!bounds.w || !bounds.h) return;
		var pad = 40;
		var sx = (viewport.clientWidth - pad * 2) / bounds.w;
		var sy = (viewport.clientHeight - pad * 2) / bounds.h;
		var s = Math.min(sx, sy, 1);
		state.scale = s;
		state.tx = pad - bounds.x * s + (viewport.clientWidth - pad * 2 - bounds.w * s) / 2;
		state.ty = pad - bounds.y * s + (viewport.clientHeight - pad * 2 - bounds.h * s) / 2;
		apply();
	}

	function zoomAt(clientX, clientY, factor) {
		var next = Math.max(minScale, Math.min(maxScale, state.scale * factor));
		var actualFactor = next / state.scale;
		state.tx = clientX - (clientX - state.tx) * actualFactor;
		state.ty = clientY - (clientY - state.ty) * actualFactor;
		state.scale = next;
		apply();
	}

	viewport.addEventListener('wheel', function (e) {
		e.preventDefault();
		var factor = Math.exp(-e.deltaY * 0.0015);
		zoomAt(e.clientX, e.clientY, factor);
	}, { passive: false });

	var dragging = false;
	var startX = 0;
	var startY = 0;
	var startTx = 0;
	var startTy = 0;
	viewport.addEventListener('mousedown', function (e) {
		var target = e.target;
		while (target && target !== viewport) {
			if (target.tagName === 'A' || target.tagName === 'BUTTON') return;
			target = target.parentNode;
		}
		dragging = true;
		startX = e.clientX;
		startY = e.clientY;
		startTx = state.tx;
		startTy = state.ty;
		viewport.classList.add('ct-panning');
	});
	window.addEventListener('mousemove', function (e) {
		if (!dragging) return;
		state.tx = startTx + (e.clientX - startX);
		state.ty = startTy + (e.clientY - startY);
		apply();
	});
	window.addEventListener('mouseup', function () {
		dragging = false;
		viewport.classList.remove('ct-panning');
	});

	var lastTouchDist = null;
	var lastTouchMid = null;
	viewport.addEventListener('touchstart', function (e) {
		if (e.touches.length === 1) {
			startX = e.touches[0].clientX;
			startY = e.touches[0].clientY;
			startTx = state.tx;
			startTy = state.ty;
			dragging = true;
		} else if (e.touches.length === 2) {
			dragging = false;
			lastTouchDist = touchDistance(e.touches);
			lastTouchMid = touchMidpoint(e.touches);
		}
	}, { passive: true });
	viewport.addEventListener('touchmove', function (e) {
		if (e.touches.length === 1 && dragging) {
			state.tx = startTx + (e.touches[0].clientX - startX);
			state.ty = startTy + (e.touches[0].clientY - startY);
			apply();
		} else if (e.touches.length === 2 && lastTouchDist !== null && lastTouchMid !== null) {
			var dist = touchDistance(e.touches);
			var mid = touchMidpoint(e.touches);
			zoomAt(mid.x, mid.y, dist / lastTouchDist);
			state.tx += mid.x - lastTouchMid.x;
			state.ty += mid.y - lastTouchMid.y;
			apply();
			lastTouchDist = dist;
			lastTouchMid = mid;
		}
	}, { passive: true });
	viewport.addEventListener('touchend', function () {
		dragging = false;
		lastTouchDist = null;
		lastTouchMid = null;
	});
	function touchDistance(t) {
		var dx = t[0].clientX - t[1].clientX;
		var dy = t[0].clientY - t[1].clientY;
		return Math.sqrt(dx * dx + dy * dy);
	}
	function touchMidpoint(t) {
		return { x: (t[0].clientX + t[1].clientX) / 2, y: (t[0].clientY + t[1].clientY) / 2 };
	}

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
