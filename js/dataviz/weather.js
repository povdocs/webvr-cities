(function () {
	'use strict';

	var snow,
		lastTick = 0;

	window.dataViz('weather', {
		init: function (scene) {
			var i, obj, body;
			for (i = 0; i < scene.children.length; i++) {
				obj = scene.children[i];
				if (obj.name === 'body') {
					body = obj;
					break;
				}
			}

			if (!body) {
				snow = new THREE.Object3D();
				return;
			}

			snow = new THREE.Snow({
				count: 50000,
				range: new THREE.Vector3(500, 500, 500)
			});
			snow.particles.name = 'snow';
			snow.particles.renderDepth = -100;
			body.add(snow.particles);
			snow.visible = false;
		},
		resize: function (width, height) {
			snow.screenHeight(height);
		},
		update: function (tick) {
			var delta = tick - lastTick;

			if (!delta || delta > 1000) {
				delta = 1000/60;
			}

			snow.time(snow.time() + delta * 0.00004);
		},
		activate: function () {
			snow.visible = true;
		},
		deactivate: function () {
			snow.visible = false;
		},
		disableDepth: function () {
			snow.visible = false;
		},
		resetDepth: function () {
			snow.visible = true;
		}
	});
}());
