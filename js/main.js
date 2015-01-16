(function () {
	var PEER_API_KEY = 'evy8rcz8vdy22o6r',

		START_LOCATION = 'Times Square, New York',
		START_LAT = 40.7564812,
		START_LON = -73.9861832,

		DEFAULT_HEIGHT = 130,
		FOG = 250,
		MOVE_SPEED = 80,
		SLOW_SPEED = MOVE_SPEED / 4,
		CITY_SCALE = 6,
		COLLISION_RADIUS = 1,
		NEAR = 1,
		FAR = 10000,

		// Three.js stuff
		camera,
		body,
		pointer,
		scene,
		renderer,
		vrEffect,
		vrControls,
		vrMouse,
		walkControl,
		cityContainer,

		//octree, //for picking, collision detection
		rayCaster = new THREE.Raycaster(),

		depthTarget,
		sceneTarget,
		depthMaterial,
		ssaoEffect,

		//VIZI stuff
		viziWorld,

		dataVizes = {
			'': {
				height: DEFAULT_HEIGHT
			}
		},

		keys = {
			forward: false,
			left: false,
			backward: false,
			right: false,
			w: false,
			a: false,
			s: false,
			d: false
		},
		moving = false,

		moveVector = new THREE.Vector3(),
		leftVector = new THREE.Vector3(),
		scratchVector = new THREE.Vector3(),
		scratchVector2 = new THREE.Vector3(),
		leftRotateMatrix = new THREE.Matrix4().makeRotationAxis(new THREE.Vector3( 0, 1, 0 ), Math.PI / 2),

		lookTarget = new THREE.Vector3(),
		lookLatitude = 0,
		lookLongitude = -Math.PI / 2,

		pickTargets = [],

		fsButton = document.getElementById('fs'),
		vrButton = document.getElementById('vr'),
		infobutton = document.getElementById('infobutton'),
		info = document.getElementById('info'),
		searchbutton = document.getElementById('search'),
		locationInput = document.getElementById('location'),

		locationCache = {},
		searchCallbacks = {},
		queryHash = {},

		stats,
		lastTick = 0,
		clock = new THREE.Clock(),

		activateDataViz,
		deactivateDataViz;

	function startMoving() {
		if (!moving) {
			// start moving in whichever direction the camera is looking
			moveVector.set(0, 0, -1).applyQuaternion(camera.quaternion);

			//only move along the ground
			moveVector.setY(0).normalize();

			leftVector.copy(moveVector).applyMatrix4(leftRotateMatrix);
			moving = true;
		}
	}

	function stopMoving() {
		updatePosition();
		if (!keys.w && !keys.a && !keys.s && !keys.d &&
			!keys.forward && !keys.backward && !keys.left && !keys.right) {
			moving = false;
		}
	}

	function updateHeight(height) {
		MOVE_SPEED = Math.max(5, 180 * height / 100);
		SLOW_SPEED = Math.max(5, 180 / 4 * height / 100);
		if (body) {
			body.position.y = height;
			walkControl.speed(MOVE_SPEED);
		}
	}

	function updatePosition() {
		var delta = clock.getDelta(),
			cos,
			distance,
			octreeResults,
			intersections;

		//return;
		delta = Math.min(delta, 0.2); //throttle speed in case we dropped a lot of frames

		if (vrControls.freeze) {
			if (keys.a) { //look left
				lookLongitude -= Math.PI * delta / 5;
			} else if (keys.d) { //look right
				lookLongitude += Math.PI * delta / 5;
			}

			if (keys.w) { //look up
				lookLatitude = Math.min(0.8 * Math.PI / 2, lookLatitude + Math.PI * delta / 5);
			} else if (keys.s) { //look down
				lookLatitude = Math.max(-0.8 * Math.PI / 2, lookLatitude - Math.PI * delta / 5);
			}

			lookTarget.y = Math.sin(lookLatitude);
			cos = Math.cos(lookLatitude);
			lookTarget.x = cos * Math.cos(lookLongitude);
			lookTarget.z = cos * Math.sin(lookLongitude);
			camera.lookAt(lookTarget);
		}

		if (moving) {
			scratchVector.set(0, 0, 0);
			if (keys.forward) {
				scratchVector2.copy(moveVector).multiplyScalar(delta * MOVE_SPEED);
				scratchVector.add(scratchVector2);
			} else if (keys.backward) {
				scratchVector2.copy(moveVector).multiplyScalar(-delta * SLOW_SPEED);
				scratchVector.add(scratchVector2);
			}

			if (keys.left) {
				scratchVector2.copy(leftVector).multiplyScalar(delta * SLOW_SPEED);
				scratchVector.add(scratchVector2);
			} else if (keys.right) {
				scratchVector2.copy(leftVector).multiplyScalar(-delta * SLOW_SPEED);
				scratchVector.add(scratchVector2);
			}

			distance = scratchVector.length();
			if (distance) {
				body.position.add(scratchVector);

				scratchVector.copy(body.position);//.divideScalar(CITY_SCALE);

				var point = new VIZI.Point(body.position.x, body.position.z);
				VIZI.Messenger.emit('controls:move', point);
			}
		}
	}

	function resize() {
		var width = window.innerWidth,
			height = window.innerHeight,
			devicePixelRatio = window.devicePixelRatio || 1;

		if (!vrEffect.isFullscreen()) {
			width *= devicePixelRatio;
			height *= devicePixelRatio;
		}

		_.each(dataVizes, function (dataViz) {
			if (dataViz && dataViz.resize) {
				dataViz.resize(width, height);
			}
		});

		camera.aspect = width / height;
		camera.updateProjectionMatrix();
		renderer.setSize(width / devicePixelRatio, height / devicePixelRatio);

		depthTarget = new THREE.WebGLRenderTarget( width, height, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, format: THREE.RGBAFormat } );
		sceneTarget = new THREE.WebGLRenderTarget( width, height, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, format: THREE.RGBAFormat } );
		ssaoEffect.uniforms.tDiffuse.value = sceneTarget;
		ssaoEffect.uniforms.tDepth.value = depthTarget;
		ssaoEffect.uniforms.size.value.set( width / 2, height );
	}

	function render() {
		var tick = Date.now(),
			delta = tick - lastTick;

		//update any active dataviz scenes
		_.each(dataVizes, function (dataViz) {
			if (dataViz && dataViz.active && dataViz.update) {
				dataViz.update(tick);
			}
		});

		//Mediator.publish('update', tick - lastTick, lastTick);

		vrControls.update();

		walkControl.update();
		if (!walkControl.moving()) {
			updatePosition();
		} else {
			VIZI.Messenger.emit('controls:move', new VIZI.Point(body.position.x, body.position.z));
		}

		viziWorld.onTick(delta);

		//update hide active dataviz scenes that don't render depth
		_.each(dataVizes, function (dataViz) {
			if (dataViz && dataViz.active && dataViz.disableDepth) {
				dataViz.disableDepth();
			}
		});

		pointer.visible = false;
		scene.overrideMaterial = depthMaterial;
		vrEffect.render(scene, camera, depthTarget, true);

		//reset hide active dataviz scenes that don't render depth
		_.each(dataVizes, function (dataViz) {
			if (dataViz && dataViz.active && dataViz.resetDepth) {
				dataViz.resetDepth();
			}
		});

		pointer.visible = true;
		scene.overrideMaterial = null;
		vrEffect.render(scene, camera, sceneTarget, true);

		ssaoEffect.render(renderer, null, sceneTarget);

		lastTick = tick;

		stats.update();

		requestAnimationFrame( render );
	}

	function initScene() {
		renderer = new THREE.WebGLRenderer();

		body = new THREE.Object3D();
		body.name = 'body';
		body.position.y = DEFAULT_HEIGHT;
		scene.add(body);

		body.add(camera);

		pointer = new THREE.Object3D();
		pointer.name = 'pointer';
		pointer.position.y = -5;
		pointer.add(
			//todo: make a better-looking pointer
			new THREE.ArrowHelper(
				new THREE.Vector3( 0, 0, -2 ),
				new THREE.Vector3( 0, 0, 0 ),
				5,
				0x00f800
			)
		);
		body.add(pointer);

		vrControls = new THREE.VRControls( camera );
		vrControls.freeze = true;

		// Gamma settings make things look 'nicer' for some reason
		renderer.gammaInput = true;
		renderer.gammaOutput = true;
		renderer.physicallyBasedShading = true;
		renderer.shadowMapEnabled = true;
		renderer.shadowMapSoft = true;
		//renderer.setClearColor( scene.fog.color, 1 );
		//renderer.shadowMapType = THREE.PCFSoftShadowMap;

		document.body.appendChild( renderer.domElement );

		var depthShader = THREE.ShaderLib.depthRGBA;
		var depthUniforms = THREE.UniformsUtils.clone( depthShader.uniforms );

		depthMaterial = new THREE.ShaderMaterial( { fragmentShader: depthShader.fragmentShader, vertexShader: depthShader.vertexShader, uniforms: depthUniforms } );
		depthMaterial.blending = THREE.NoBlending;

		// postprocessing

		ssaoEffect = new THREE.ShaderPass( THREE.SSAOShader );
		ssaoEffect.uniforms.lumInfluence.value = 0.8;
		ssaoEffect.uniforms.cameraNear.value = camera.near;
		ssaoEffect.uniforms.cameraFar.value = camera.far;
		ssaoEffect.renderToScreen = true;
		ssaoEffect.clear = true;

		vrEffect = new THREE.VRStereoEffect(renderer);
		vrEffect.near = NEAR;
		vrEffect.far = FAR;
		vrEffect.addEventListener('fullscreenchange', function () {
			vrControls.freeze = !(vrEffect.isFullscreen() || vrEffect.vrPreview());
			if (vrControls.freeze) {
				vrControls.reset();
			} else {
				//vrMouse.lock();
			}
		});

		vrEffect.addEventListener('devicechange', function () {
			var hmd = vrEffect.hmd(),
				info = document.getElementById('hmd-info');

			if (hmd) {
				vrButton.disabled = false;
			}

			info.innerHTML = hmd && hmd.deviceName ? 'HMD: ' + hmd.deviceName : '';
			info.className = hmd && hmd.deviceId !== 'debug-0' ? 'has-hmd' : '';
		});
	}

	function initDataViz() {
		var defaultLayers = [
				//'population'/*,
				'buildings',
				'map'//*/
			],
			info = document.getElementById('dataviz-info'),
			layers = {};

		function notifyLayersLoaded(dataViz) {
			var k,
				layer,
				layerParams = {};

			if (!dataViz || dataViz.notifiedLayers) {
				return;
			}

			if (!dataViz.layersLoaded) {
				dataViz.notifiedLayers = true;
				return;
			}

			for (k in dataViz.layers) {
				if (dataViz.layers.hasOwnProperty(k) && dataViz.layers[k]) {
					layer = layers[k];
					if (!layer || !layer.switchboard) {
						return;
					}
					layerParams[k] = layer;
				}
			}

			dataViz.layersLoaded(layerParams);

			dataViz.notifiedLayers = true;
		}

		function loadLayer(name, obj) {
			var layer = layers[name],
				switchboard = new VIZI.BlueprintSwitchboard(obj);

			switchboard.addToWorld(viziWorld);
			layer.switchboard = switchboard;
			layer.object = switchboard.output.object;
		}

		function requestLayer(name) {
			var layer = layers[name];
			if (!layer) {
				layer = layers[name] = {
					name: name,
					object: null,
					switchboard: null,
					active: false
				};

				d3.json('layers/' + name + '.json', function(error, data) {
					if (error) {
						console.warn(error);
						return;
					}

					loadLayer(name, data);
					if (layer.object) {
						layer.object.visible = layer.active;
					}

					//notify any dataviz objects that have requested layers
					_.each(dataVizes, notifyLayersLoaded);
				});
			}
		}

		function activateLayer(name) {
			var layer = layers[name];

			if (!layer) {
				requestLayer(name);
			} else  if (layer.object) {
				layer.object.visible = true;
			}
			layers[name].active = true;
		}

		function deactivateLayer(name) {
			var layer = layers[name];
			if (layer) {
				layer.active = false;
				if (layer.object) {
					layer.object.visible = false;
				}
			}
		}

		activateDataViz = function (name) {
			var script,
				dataViz = dataVizes[name];

			_.each(dataVizes, function (dataViz, id) {
				if (name !== id) {
					deactivateDataViz(id);
				}
			});

			/*
			Would like to use something like requirejs to load script,
			but it's not compatible with vizicities at the moment
			*/
			if (dataViz === undefined) {
				dataVizes[name] = null;
				info.style.display = 'none';
				script = document.createElement('script');
				script.src = 'js/dataviz/' + name + '.js';
				document.body.appendChild(script);
				return;
			}

			dataViz.active = true;

			updateHeight(dataViz.height);

			if (dataViz.latitude) {
				searchLocation(dataViz.latitude + ', ' + dataViz.longitude);
				updateQuery('loc', null);
			}

			body.rotation.y = dataViz.lookDirection || 0;

			_.each(dataViz.layers, function (layer, key) {
				if (layer) {
					activateLayer(key);
				} else {
					deactivateLayer(key);
				}
			});

			if (dataViz.info) {
				info.style.display = '';
				info.innerHTML = '';
				info.appendChild(dataViz.info);
			} else {
				info.style.display = 'none';
			}

			if (dataViz.activate) {
				dataViz.activate();
			}
		};

		deactivateDataViz = function (name) {
			var dataViz = dataVizes[name];

			if (!dataViz) {
				delete dataVizes[name];
				return;
			}

			if (!dataViz.active) {
				// nothing to do
				return;
			}

			dataViz.active = false;

			if (dataViz.deactivate) {
				dataViz.deactivate();
			}

			_.each(dataViz.layers, function (layer, key) {
				deactivateLayer(key);
			});
			defaultLayers.forEach(activateLayer);
		};

		window.dataViz = function (name, options) {
			var active = (name in dataVizes),
				dataViz = dataVizes[name],
				lat, lon,
				width, height,
				devicePixelRatio;

			if (!name || !options || dataViz) {
				return;
			}

			dataViz = dataVizes[name] = {
				name: name,
				active: false,
				notifiedLayers: false,
				layers: {},
				height: 0,
				info: null,
				lookDirection: options.lookDirection,
				layersLoaded: options.layersLoaded,
				activate: options.activate,
				deactivate: options.deactivate,
				update: options.update,
				resize: options.resize,
				disableDepth: options.disableDepth,
				resetDepth: options.resetDepth
			};

			defaultLayers.forEach(function (layerName) {
				dataViz.layers[layerName] = true;
			});

			dataViz.height = Math.max(2, parseFloat(options.height) || DEFAULT_HEIGHT);
			lat = parseFloat(options.latitude);
			lon = parseFloat(options.longitude);

			if (Math.abs(lat) < 90 && !isNaN(lon) && lon !== Infinity && lon !== -Infinity) {
				dataViz.latitude = lat;
				dataViz.longitude = lon;
			}

			if (options.layers) {
				_.each(options.layers, function (layer, key) {
					if (typeof key === 'number') {
						if (typeof layer === 'string') {
							key = layer;
							layer = true;
						} else {
							key = name + key;
						}
					}
					dataViz.layers[key] = !!layer;

					if (layer) {
						if (typeof layer === 'object') {
							layers[key] = {
								name: key,
								object: null,
								switchboard: null,
								active: false
							};

							loadLayer(key, layer);
						} else {
							requestLayer(key);
						}
					}
				});
			}

			if (options.init) {
				options.init(scene);
			}

			if (options.info) {
				if (typeof options.info === 'string') {
					dataViz.info = document.createElement('div');
					dataViz.info.innerHTML = options.info;
				} else {
					dataViz.info = options.info;
				}
			}

			if (dataViz.resize) {
				width = window.innerWidth;
				height = window.innerHeight;
				devicePixelRatio = window.devicePixelRatio || 1;

				if (!vrEffect.isFullscreen()) {
					width *= devicePixelRatio;
					height *= devicePixelRatio;
				}

				dataViz.resize(height, width);
			}


			notifyLayersLoaded(dataViz);

			if (active) {
				activateDataViz(name);
			}
		};

		defaultLayers.forEach(activateLayer);

		document.getElementById('visualization').addEventListener('change', function () {
			activateDataViz(this.value);
			updateQuery('viz', this.value);

			this.blur();
		});

		//todo: load from query. activateDataViz('weather');
	}

	function initVizi() {
		viziWorld = new VIZI.World({
			viewport: document.body,
			center: new VIZI.LatLon(START_LAT, START_LON),
			//zoom: 19,
			suppressRenderer: true
		});

		scene = viziWorld.scene.scene;
		scene.matrixAutoUpdate = false;
		camera = viziWorld.camera.camera;
		camera.position.set(0, 0, 0);
		camera.rotation.set(0, 0, 0);
		camera.near = NEAR;
		camera.far = FAR;
	}

	function searchLocation(val, callback) {
		var locationName = document.getElementById('location-name');

		function changeLocation(loc) {
			var latLng = new VIZI.LatLon(parseFloat(loc.lat - 0.003), parseFloat(loc.lon)),
				pos = viziWorld.project(latLng),
				cos;

			viziWorld.moveToLatLon(latLng);
			body.position.x = pos.x;
			body.position.z = pos.y;

			//reset camera view
			lookLongitude = -Math.PI / 2;
			lookLatitude = 0;
			lookTarget.y = Math.sin(lookLatitude);
			cos = Math.cos(lookLatitude);
			lookTarget.x = cos * Math.cos(lookLongitude);
			lookTarget.z = cos * Math.sin(lookLongitude);
			camera.lookAt(lookTarget);

			VIZI.Messenger.emit('controls:move', pos);

			if (locationName.firstChild) {
				locationName.firstChild.nodeValue = loc.display_name;
			} else {
				locationName.appendChild(document.createTextNode(loc.display_name));
			}

			if (locationInput !== document.activeElement) {
				locationInput.value = '';
			}

			//todo: update query param in URL
		}

		var url = 'http://nominatim.openstreetmap.org/search?addressdetails=1&format=json&q=',
			loc;

		if (val) {
			loc = locationCache[val];
			if (loc) {
				changeLocation(loc);
				if (callback) {
					callback(loc);
				}
				return;
			}

			if (callback) {
				if (searchCallbacks[val]) {
					searchCallbacks[val].push(callback);
				} else {
					searchCallbacks[val] = [callback];
				}
			}

			if (loc === null) {
				//query in progress
				return;
			}

			locationCache[val] = null;
			d3.json(url + encodeURIComponent(val), function(error, response) {
				var match,
					callbacks;
				if (error) {
					console.warn('Location search failed', val, error);
					return;
				}

				response = response && response[0];
				if (response && response.lat && response.lon) {
					match = /([\-+]?\d+(?:\.\d*)?)[, ]\s*([\-+]?\d+(?:\.\d*))?/.exec(val);
					if (match) {
						response.lat = parseFloat(match[1]);
						response.lon = parseFloat(match[2]);
					}
					locationCache[val] = response;
					changeLocation(response);

					callbacks = searchCallbacks[val];
					if (callbacks) {
						while (callbacks.length) {
							callbacks.shift()(response);
						}
					}
				}
			});
		}
	}

	function initControls() {
		var qrCode,
			connectionInfo = document.getElementById('connection-info'),
			minimize = document.getElementById('minimize');

		function lostConnection() {
			var peer = walkControl.peer();
			if (peer && peer.open) {
				connectionInfo.style.display = '';
			}
		}

		console.log('Waiting to register peer');
		walkControl = new THREE.RemoteWalkControl(body, {
			peerApiKey: PEER_API_KEY,
			camera: camera,
			moveSpeed: MOVE_SPEED,
			compass: pointer
		});

		walkControl.addEventListener('open', function (evt) {
			var peerId = evt.id,
				url,
				location = window.location,
				path;

			path = location.pathname.split('/');
			path.pop();
			url = location.origin + path.join('/') + '/touch.html#' + peerId;
			document.getElementById('link').setAttribute('href', url);
			connectionInfo.style.display = '';
			window.location.hash = peerId;

			if (!qrCode) {
				qrCode = new QRCode('qrcode', {
					text: url,
					width: 200,
					height: 200,
					correctLevel: QRCode.CorrectLevel.L
				});
			} else {
				qrCode.makeImage(url);
			}

			console.log('peer registered');
		});

		walkControl.addEventListener('connected', function () {
			connectionInfo.style.display = 'none';
			console.log('remote connected');
		});

		walkControl.addEventListener('error', lostConnection);
		walkControl.addEventListener('close', lostConnection);
		walkControl.addEventListener('disconnected', lostConnection);

		walkControl.addEventListener('recenter', function () {
			console.log('recenter');
		});

		walkControl.connect(window.location.hash.substr(1));

		minimize.addEventListener('click', function (evt) {
			if (!connectionInfo.className) {
				connectionInfo.className = 'min';
				evt.stopPropagation();
			}
		}, false);

		connectionInfo.addEventListener('click', function (evt) {
			if (connectionInfo.className) {
				connectionInfo.className = '';
				evt.preventDefault();
			}
		}, false);
	}

	function updateQuery(field, val) {
		var key, v, query = [],
			url;

		queryHash[field] = val;

		for (key in queryHash) {
			if (queryHash.hasOwnProperty(key)) {
				v = queryHash[key];
				if (v || typeof v === 'number') {
					query.push(encodeURIComponent(key) + '=' + encodeURIComponent(v));
				}
			}
		}

		url = location.origin + location.pathname;
		if (query.length) {
			url += '?' + query.join('&');
		}
		url += location.hash;

		history.pushState(queryHash, '', url);
	}

	function parseQuery() {
		var search = window.location.search.substr(1),
			queries = search.split('&'),
			select = document.getElementById('visualization');

		queryHash = queries.reduce(function (previous, current) {
			var split = current.split('='),
				key = decodeURIComponent(split[0]),
				val = decodeURIComponent(split[1]);

			if (/^\s*\-?\d+(\.\d+)?\s*$/.test(val)) {
				previous[key] = parseFloat(val);
			} else if (val && split.length >= 2) {
				previous[key] = val;
			}

			return previous;
		}, {});

		if (queryHash.speed > 0) {
			MOVE_SPEED = queryHash.speed;
			SLOW_SPEED = MOVE_SPEED / 4;
		}

		if (queryHash.height) {
			DEFAULT_HEIGHT = Math.max(0.2, parseFloat(queryHash.height) || DEFAULT_HEIGHT);
			dataVizes[''].height = DEFAULT_HEIGHT;
			updateHeight(DEFAULT_HEIGHT);
		}

		if (queryHash.loc) {
			searchLocation(queryHash.loc);
		} else {
			searchLocation(START_LOCATION);
		}

		if (queryHash.viz) {
			select.value = queryHash.viz;
			if (select.selectedIndex >= 0) {
				activateDataViz(queryHash.viz);
			} else {
				select.selectedIndex = 0;
			}
		}
	}

	function init() {
		initDataViz();
		parseQuery();
		initVizi();
		initScene();
		initControls();

		stats = new Stats();
		stats.domElement.style.position = 'absolute';
		stats.domElement.style.top = '0px';
		stats.domElement.style.right = '0px';
		document.body.appendChild( stats.domElement );

		resize();
		window.addEventListener('resize', resize, false);

		vrButton.addEventListener('click', function () {
			vrEffect.requestFullScreen();
		}, false);

		fsButton.addEventListener('click', function () {
			var fullScreenElement = renderer.domElement,
				requestFullscreen = fullScreenElement.webkitRequestFullscreen ||
					fullScreenElement.mozRequestFullScreen ||
					fullScreenElement.msRequestFullscreen;

			if (requestFullscreen) {
				requestFullscreen.call(fullScreenElement);
			}
		}, false);

		//todo: set up button to trigger full screen
		window.addEventListener('keydown', function (evt) {
			if (evt.target instanceof HTMLInputElement) {
				return;
			}

			if (evt.keyCode === 38) { //up
				keys.forward = true;
				keys.backward = false;
				startMoving();
			} else if (evt.keyCode === 40) { //down
				keys.backward = true;
				keys.forward = false;
				startMoving();
			} else if (evt.keyCode === 37) { //left
				keys.left = true;
				keys.right = false;
				startMoving();
			} else if (evt.keyCode === 39) { //right
				keys.right = true;
				keys.left = false;
				startMoving();
			} else if (evt.keyCode === 'W'.charCodeAt(0)) {
				keys.w = true;
				keys.s = false;
			} else if (evt.keyCode === 'A'.charCodeAt(0)) {
				keys.a = true;
				keys.d = false;
			} else if (evt.keyCode === 'S'.charCodeAt(0)) {
				keys.s = true;
				keys.w = false;
			} else if (evt.keyCode === 'D'.charCodeAt(0)) {
				keys.d = true;
				keys.a = false;
			} else if (evt.keyCode === 'Z'.charCodeAt(0)) {
				vrControls.zeroSensor();
			} else if (evt.keyCode === 'P'.charCodeAt(0)) {
				if (!vrEffect.isFullscreen()) {
					vrEffect.vrPreview(!vrEffect.vrPreview());
					vrControls.freeze = !vrEffect.vrPreview();
					if (vrControls.freeze) {
						vrControls.reset();
					}
				}
			} else if (evt.keyCode === 13) {
				vrEffect.requestFullScreen();
			}
		}, false);

		window.addEventListener('keyup', function (evt) {
			if (evt.keyCode === 38) { //up
				keys.forward = false;
				stopMoving();
			} else if (evt.keyCode === 40) { //down
				keys.backward = false;
				stopMoving();
			} else if (evt.keyCode === 37) { //left
				keys.left = false;
				stopMoving();
			} else if (evt.keyCode === 39) { //right
				keys.right = false;
				stopMoving();
			} else if (evt.keyCode === 'W'.charCodeAt(0)) {
				keys.w = false;
				stopMoving();
			} else if (evt.keyCode === 'A'.charCodeAt(0)) {
				keys.a = false;
				stopMoving();
			} else if (evt.keyCode === 'S'.charCodeAt(0)) {
				keys.s = false;
				stopMoving();
			} else if (evt.keyCode === 'D'.charCodeAt(0)) {
				keys.d = false;
				stopMoving();
			}
		}, false);

		window.addEventListener('touchend', function () {
			vrEffect.requestFullScreen();
		});

		infobutton.addEventListener('click', function () {
			if (info.className) {
				info.className = '';
			} else {
				info.className = 'open';
			}
		});

		searchbutton.addEventListener('click', function () {
			searchLocation(locationInput.value);
			updateQuery('loc', locationInput.value);
		});
		locationInput.addEventListener('keypress', function (evt) {
			if (evt.keyCode === 13) {
				searchLocation(locationInput.value);
				updateQuery('loc', locationInput.value);
				locationInput.blur();
			}
		});
	}

	init();
	render();
}());