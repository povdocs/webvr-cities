(function () {
	'use strict';

	var triggers = [
			{
				triggerObject: 'output',
				triggerName: 'initialised',
				triggerArguments: [],
				actionObject: 'input',
				actionName: 'requestData',
				actionArguments: [],
				actionOutput: {}
			}, {
				triggerObject: 'input',
				triggerName: 'dataReceived',
				triggerArguments: ['gpx'],
				actionObject: 'output',
				actionName: 'outputLines',
				actionArguments: ['data'],
				actionOutput: {
					data: {
						process: 'map',
						itemsObject: 'gpx',
						itemsProperties: 'trk.trkseg.trkpt',
						transformation: {
							coordinates: ['@lon', '@lat'],
							time: 'time'/*,
							height: 'ele'*/
						}
					}
				}
			}
		],
		gps = {
			'anthonybike.gpx': {
				title: 'Bike: Central Park and Midtown',
				start: [40.785967525194586, -73.96889110969782]
			},
			'activity_372746372.gpx': {
				title: 'Run: SOS 1',
				start: [41.735032964497805, -74.24379958771169]
			},
			'activity_372746380.gpx': {
				title: 'Run: SOS 2',
				start: [41.71097807586193, -74.28543384186924]
			},
			'activity_372746392.gpx': {
				title: 'Run: SnowZilla 8k',
				start: [42.050846396014094, -76.25372691079974]
			},
			'activity_411138967.gpx': {
				title: 'Bike: Central Park, 2 loops',
				start: [40.785967525194586, -73.96889110969782]
			},
			'activity_417748581.gpx': {
				title: 'Bike: Central Park and Midtown',
				start: [40.785967525194586, -73.96889110969782]
			},
			'activity_439718275.gpx': {
				title: 'Bike: Central Park',
				start: [40.785967525194586, -73.96889110969782]
			}
		};

	Object.keys(gps).forEach(function (file, index, all) {
		var color = (new THREE.Color()).setHSL(index / all.length, 1, 0.5);
	});

	window.dataViz('bike', (function () {
		var body,
			viziWorld,
			layers = [],
			objects = [],
			info,
			list;

		info = document.createElement('div');
		info.innerHTML = '<h2>GPS tracking data. Source: <a href="http://anthonybagnettofitness.com/" target="_new">Anthony Bagnetto</a>.</h2>';
		list = document.createElement('ul');
		list.style.cssText = 'list-style: none; padding: 0; margin: 0;';

		Object.keys(gps).forEach(function (file, index, all) {
			var details = gps[file],
				li = document.createElement('li'),
				color = (new THREE.Color()).setHSL(index / all.length, 1, 0.5);

			layers.push({
				input: {
					type: 'BlueprintInputGPX',
					options: {
						path: './data/bike/' + file
					}
				},
				output: {
					type: 'BlueprintOutputDebugLines',
					options: {
						materialOptions: {
							color: color.getHex()
						},
						height: 1
					}
				},
				triggers: triggers
			});

			li.style.cursor = 'pointer';
			li.innerHTML = '<span style="color: #' + color.getHexString() + ';">&#x2B24;</span> <span style="text-decoration: underline">' + details.title + '</span>';
			li.addEventListener('click', function () {
				var latLng = new VIZI.LatLon(details.start[0], details.start[1]),
					pos = viziWorld.project(latLng);

				viziWorld.moveToLatLon(latLng);
				body.position.x = pos.x;
				body.position.z = pos.y;

				VIZI.Messenger.emit('controls:move', pos);
			});
			list.appendChild(li);
		});

		info.appendChild(list);

		return {
			layers: layers,
			latitude: 40.785967525194586,
			longitude: -73.96889110969782,
			height: 2,
			info: info,

			init: function (scene) {
				var i;
				for (i = 0; i < scene.children.length; i++) {
					if (scene.children[i].name === 'body') {
						body = scene.children[i];
						return;
					}
				}
			},

			layersLoaded: function (layers) {
				viziWorld = layers.map.switchboard.output.world;

				_.each(layers, function (layer, key) {
					if (key.substr(0, 4) === 'bike') {
						objects.push(layer.object);
					}
				});
			},

			disableDepth: function () {
				objects.forEach(function (obj) {
					obj.visible = false;
				});
			},

			resetDepth: function () {
				objects.forEach(function (obj) {
					obj.visible = true;
				});
			}
		};
	}()));
}());
