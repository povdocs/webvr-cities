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
				count: 100000,
				minSize: 10,
				maxSize: 20,
				range: new THREE.Vector3(6000, 2000, 6000)
			});
			snow.particles.name = 'snow';
			snow.particles.renderDepth = -100;
			body.add(snow.particles);
			snow.visible = false;
		},
		update: function (tick) {
			var delta = tick - lastTick;

			if (!delta || delta > 1000) {
				delta = 1000/60;
			}

			snow.time(snow.time() + delta * 0.00005);
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
