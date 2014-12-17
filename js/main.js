(function () {
	var initialCameraPosition = {
			x: 0,
			y: 130,
			z: 0
		},

		PEER_API_KEY = 'evy8rcz8vdy22o6r',

		START_LOCATION = 'Times Square, New York',

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
		compass,
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

		dataVizes = {},

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

		stats,
		lastTick = 0,
		clock = new THREE.Clock();

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
		if (!keys.w && !keys.a && !keys.s && !keys.d) {
			moving = false;
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

		//update hide active dataviz scenes that don't render depth
		_.each(dataVizes, function (dataViz) {
			if (dataViz && dataViz.active && dataViz.disableDepth) {
				dataViz.disableDepth();
			}
		});

		scene.overrideMaterial = depthMaterial;
		vrEffect.render(scene, camera, depthTarget, true);

		//reset hide active dataviz scenes that don't render depth
		_.each(dataVizes, function (dataViz) {
			if (dataViz && dataViz.active && dataViz.resetDepth) {
				dataViz.resetDepth();
			}
		});

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
		body.position.x = initialCameraPosition.x;
		body.position.y = initialCameraPosition.y;
		body.position.z = initialCameraPosition.z;
		scene.add(body);

		body.add(camera);

		pointer = new THREE.Object3D();
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
			if (vrEffect.hmd()) {
				vrButton.disabled = false;
			}
		});
	}

	function initDataViz() {
		var defaultLayers = [
				'buildings',
				'map'
			],
			layers = {};

		function nop() {}

		function loadLayer(name, obj) {
			var layer = layers[name],
				switchboard = new VIZI.BlueprintSwitchboard(obj);

			switchboard.addToWorld(viziWorld);
			layer.object = switchboard.output.object;
		}

		function requestLayer(name) {
			var layer = layers[name];
			if (!layer) {
				layer = layers[name] = {
					object: null,
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

		function activateDataViz(name) {
			var script,
				dataViz = dataVizes[name];

			if (!name) {
				return;
			}

			/*
			Would like to use something like requirejs to load script,
			but it's not compatible with vizicities at the moment
			*/
			if (dataViz === undefined) {
				dataVizes[name] = null;
				script = document.createElement('script');
				script.src = 'js/dataViz/' + name + '.js';
				document.body.appendChild(script);
				return;
			}

			dataViz.active = true;

			_.each(dataViz.layers, function (layer, key) {
				activateLayer(key);
			});

			dataViz.activate();
		}

		function deactivateDataViz(name) {
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

			dataViz.deactivate();

			_.each(dataViz.layers, function (layer, key) {
				deactivateLayer(key);
			});
			defaultLayers.forEach(activateLayer);
		}

		window.dataViz = function (name, options) {
			var active = (name in dataVizes),
				dataViz = dataVizes[name];

			if (!name || !options || dataViz) {
				return;
			}

			dataViz = dataVizes[name] = {
				active: false,
				name: name,
				layers: {},
				activate: options.activate || nop,
				deactivate: options.deactivate || nop,
				update: options.update,
				disableDepth: options.disableDepth,
				resetDepth: options.resetDepth
			};

			defaultLayers.forEach(function (layerName) {
				dataViz.layers[layerName] = true;
			});

			if (options.layers) {
				_.each(options.layers, function (layer, key) {
					if (!layer) {
						delete dataViz.layers[key];
						return;
					}
					if (typeof layer === 'string' && typeof key === 'number') {
						key = layer;
						layer = true;
					}
					dataViz.layers[key] = true;

					if (typeof layer === 'object') {
						loadLayer(key, layer);
					} else {
						requestLayer(key);
					}
				});
			}

			if (options.init) {
				options.init(scene);
			}

			if (active) {
				activateDataViz(name);
			}
		};

		defaultLayers.forEach(activateLayer);

		document.getElementById('visualization').addEventListener('change', function () {
			var val = this.value;
			_.each(dataVizes, function (dataViz, name) {
				if (name !== val) {
					deactivateDataViz(name);
				}
			});

			activateDataViz(val);
		});

		//todo: load from query. activateDataViz('weather');
	}

	function initVizi() {
		viziWorld = new VIZI.World({
			viewport: document.body,
			center: new VIZI.LatLon(40.7564812, -73.9861832),
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

	function searchLocation(val) {
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
				return;
			}
			if (loc === null) {
				//query in progress
				return;
			}

			locationCache[val] = null;
			d3.json(url + val, function(error, response) {
				if (error) {
					console.warn('Location search failed', val, error);
					return;
				}

				if (response && response[0] && response[0].lat && response[0].lon) {
					locationCache[val] = response[0];
					changeLocation(locationCache[val]);
				}
			});
		}
	}

	function initControls() {
		var qrCode,
			connectionInfo = document.getElementById('connection-info');

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
	}

	function parseQuery() {
		var search = window.location.search.substr(1),
			queries = search.split('&'),
			hash;

		hash = queries.reduce(function (previous, current) {
			var split = current.split('='),
				key = split[0],
				val = split[1];

			if (/^\s*\-?\d+(\.\d+)?\s*$/.test(val)) {
				previous[key] = parseFloat(val);
			} else {
				previous[key] = val;
			}

			return previous;
		}, {});

		if (hash.speed > 0) {
			MOVE_SPEED = hash.speed;
			SLOW_SPEED = MOVE_SPEED / 4;
		}

		if (hash.height) {
			initialCameraPosition.y = hash.height;
			MOVE_SPEED = Math.max(5, MOVE_SPEED * hash.height / 130);
			SLOW_SPEED = Math.max(5, SLOW_SPEED * hash.height / 130);
		}

		if (hash.loc) {
			searchLocation(hash.loc);
		} else {
			searchLocation(START_LOCATION);
		}
	}

	function init() {
		parseQuery();
		initVizi();
		initScene();
		initControls();
		initDataViz();

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
				startMoving();
			} else if (evt.keyCode === 40) { //down
				keys.backward = true;
				startMoving();
			} else if (evt.keyCode === 37) { //left
				keys.left = true;
				startMoving();
			} else if (evt.keyCode === 39) { //right
				keys.right = true;
				startMoving();
			} else if (evt.keyCode === 'W'.charCodeAt(0)) {
				keys.w = true;
			} else if (evt.keyCode === 'A'.charCodeAt(0)) {
				keys.a = true;
			} else if (evt.keyCode === 'S'.charCodeAt(0)) {
				keys.s = true;
			} else if (evt.keyCode === 'D'.charCodeAt(0)) {
				keys.d = true;
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
			} else if (evt.keyCode === 'A'.charCodeAt(0)) {
				keys.a = false;
			} else if (evt.keyCode === 'S'.charCodeAt(0)) {
				keys.s = false;
			} else if (evt.keyCode === 'D'.charCodeAt(0)) {
				keys.d = false;
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
		});
		locationInput.addEventListener('keypress', function (evt) {
			if (evt.keyCode === 13) {
				searchLocation(locationInput.value);
				locationInput.blur();
			}
		});
	}

	init();
	render();
}());