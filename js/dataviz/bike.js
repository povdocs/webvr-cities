(function () {
	'use strict';

	window.dataViz('bike', {
		layers: ['anthonybike'],
		height: 2,
		latitude: 40.78698618490198 + 0.003,
		longitude: -73.97130228695384,

		lookDirection: -2,

		init: function (scene) {
		},

		layersLoaded: function (layers) {
			layers.anthonybike.switchboard.input.on('dataReceived', function (data) {

			});
		},

		update: function (tick) {
		},
		activate: function () {
		},
		deactivate: function () {
		},
		disableDepth: function () {
		},
		resetDepth: function () {
		}
	});
}());
