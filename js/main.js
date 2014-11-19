(function () {
	var initialCameraPosition = {
			x: 0,
			y: 130,
			z: 0
		},

		PEER_API_KEY = 'evy8rcz8vdy22o6r',

		START_LAT = 40.7564812,
		START_LON = -73.9861832,

		MAX_INCOME_HEIGHT = 130,
		MIN_INCOME_HEIGHT = 10,

		// START_LAT = 56.046467,
		// START_LON = 12.694512,

		FOG = 250,
		MOVE_SPEED = 80,
		SLOW_SPEED = MOVE_SPEED / 4,
		CITY_SCALE = 6,
		COLLISION_RADIUS = 1,

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
		floorContainer,
		incomeColumns = [],
		//octree, //for picking, collision detection
		rayCaster = new THREE.Raycaster(),

		depthTarget,
		sceneTarget,
		depthMaterial,
		ssaoEffect,

		//VIZI stuff
		viziWorld,

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

		vrButton = document.getElementById('vr'),
		infobutton = document.getElementById('infobutton'),
		info = document.getElementById('info'),
		searchbutton = document.getElementById('search'),

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
				/*
				scratchVector2.copy(scratchVector).normalize().setY(0.001);
				rayCaster.set(body.position, scratchVector2);
				//rayCaster.far = distance + COLLISION_RADIUS;
				octreeResults = octree.search(body.position, rayCaster.far, true, scratchVector2);
				intersections = rayCaster.intersectOctreeObjects(octreeResults, true);
				//intersections = rayCaster.intersectObjects(octree.objects, true);
				if (!intersections.length) {
					//*/
					body.position.add(scratchVector);
					floorContainer.position.x = body.position.x;
					floorContainer.position.z = body.position.z;

					scratchVector.copy(body.position);//.divideScalar(CITY_SCALE);

					var point = new VIZI.Point(body.position.x, body.position.z);
					VIZI.Messenger.emit('controls:move', point);

					// TODO: Only emit this if it has changed
					//var zoom = self.getZoom();
					//VIZI.Messenger.emit("controls:zoom", zoom);
					//Mediator.publish('targetPositionChanged', scratchVector);
					//vrMouse.update(); //only need this if the world is animating
				//}
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
		var tick = Date.now();

		//Mediator.publish('update', tick - lastTick, lastTick);

		vrControls.update();

		walkControl.update();
		if (!walkControl.moving()) {
			updatePosition();
		} else {
			VIZI.Messenger.emit('controls:move', new VIZI.Point(body.position.x, body.position.z));
		}

		scene.overrideMaterial = depthMaterial;
		vrEffect.render(scene, camera, depthTarget, true);

		scene.overrideMaterial = null;
		vrEffect.render(scene, camera, sceneTarget, true);

		ssaoEffect.render(renderer, null, sceneTarget);

		lastTick = tick;

		requestAnimationFrame( render );
	}

	/*
	function addObject(object) {
		cityContainer.add(object);
		// octree.add(object, {
		//		useFaces: true
		// });
		console.log('added', object);
	}

	function removeObject(object) {
		cityContainer.remove(object);
		// octree.remove(object, {
		// 	useFaces: true
		// });
		console.log('removed', object);
	}
	*/

	function initScene() {
		renderer = new THREE.WebGLRenderer();

		body = new THREE.Object3D();
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

		/*
		var loader = new THREE.OBJMTLLoader();
		loader.load( 'Godzilla/Godzilla.obj', 'Godzilla/Godzilla.mtl', function ( object ) {
			//recenterCompoundObject(object);
			object.position.z = -400;
			object.position.x = 200;
			object.scale.multiplyScalar(1 / 8 * CITY_SCALE);
			//object.rotateY(Math.PI);
			scene.add( object );
			//objects.push(object);
			//pickTargets.push(object);
		});
		//*/

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

	function initVizi() {
		var switchboardBuildings,
			switchboardMap;

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

		switchboardBuildings = new VIZI.BlueprintSwitchboard({
			input: {
				type: "BlueprintInputGeoJSON",
				options: {
					tilePath: "http://vector.mapzen.com/osm/buildings/{z}/{x}/{y}.json"
				}
			},
			output: {
				type: "BlueprintOutputBuildingTiles",
				options: {
					grids: [{
						zoom: 15,
						tilesPerDirection: 2,
						cullZoom: 13
					}],
					workerURL: "js/lib/vizi-worker.js"
				}
			},
			triggers: [{
				triggerObject: "output",
				triggerName: "initialised",
				triggerArguments: ["tiles"],
				actionObject: "input",
				actionName: "requestTiles",
				actionArguments: ["tiles"],
				actionOutput: {
					tiles: "tiles" // actionArg: triggerArg
				}
			}, {
				triggerObject: "output",
				triggerName: "gridUpdated",
				triggerArguments: ["tiles"],
				actionObject: "input",
				actionName: "requestTiles",
				actionArguments: ["tiles"],
				actionOutput: {
					tiles: "tiles" // actionArg: triggerArg
				}
			}, {
				triggerObject: "input",
				triggerName: "tileReceived",
				triggerArguments: ["geoJSON", "tile"],
				actionObject: "output",
				actionName: "outputBuildingTile",
				actionArguments: ["buildings", "tile"],
				actionOutput: {
					buildings: {
						process: "map",
						itemsObject: "geoJSON",
						itemsProperties: "features",
						transformation: {
							outline: "geometry.coordinates",
							height: "properties.height"
						}
					},
					tile: "tile"
				}
			}]
		});
		switchboardBuildings.addToWorld(viziWorld);

		//*
		switchboardMap = new VIZI.BlueprintSwitchboard({
			input: {
				type: "BlueprintInputMapTiles",
				options: {
					tilePath: "https://a.tiles.mapbox.com/v3/examples.map-i86l3621/{z}/{x}/{y}@2x.png"
				}
			},
			output: {
				type: "BlueprintOutputImageTiles",
				options: {
					grids: [{
						zoom: 19,
						tilesPerDirection: 3,
						cullZoom: 17
					}, {
						zoom: 18,
						tilesPerDirection: 3,
						cullZoom: 16
					}, {
						zoom: 17,
						tilesPerDirection: 3,
						cullZoom: 15
					}, {
						zoom: 16,
						tilesPerDirection: 3,
						cullZoom: 14
					}, {
						zoom: 15,
						tilesPerDirection: 3,
						cullZoom: 13
					}, {
						zoom: 14,
						tilesPerDirection: 3,
						cullZoom: 12
					}, {
						zoom: 13,
						tilesPerDirection: 5,
						cullZoom: 11
					}]
				}
			},
			triggers: [{
				triggerObject: "output",
				triggerName: "initialised",
				triggerArguments: ["tiles"],
				actionObject: "input",
				actionName: "requestTiles",
				actionArguments: ["tiles"],
				actionOutput: {
					tiles: "tiles" // actionArg: triggerArg
				}
			}, {
				triggerObject: "output",
				triggerName: "gridUpdated",
				triggerArguments: ["tiles"],
				actionObject: "input",
				actionName: "requestTiles",
				actionArguments: ["tiles"],
				actionOutput: {
					tiles: "tiles" // actionArg: triggerArg
				}
			}, {
				triggerObject: "input",
				triggerName: "tileReceived",
				triggerArguments: ["image", "tile"],
				actionObject: "output",
				actionName: "outputImageTile",
				actionArguments: ["image", "tile"],
				actionOutput: {
					image: "image", // actionArg: triggerArg
					tile: "tile"
				}
			}]
		});
		switchboardMap.addToWorld(viziWorld);
		//c*/

		// Mediator.subscribe('addToScene', addObject);
		// Mediator.subscribe('removeFromScene', removeObject);
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

	function initIncomeData() {
		var incomeGeo,
			minIncome = 0,
			maxIncome = 0,
			incomeRange = 0,
			heightRange = MAX_INCOME_HEIGHT - MIN_INCOME_HEIGHT,
			incomeData;

		incomeData = new IncomeData({
			tilesPerDirection: 4,
			//path: 'data/testdata.csv',
			onLoad: function () {
				minIncome = incomeData.minIncome();
				maxIncome = incomeData.maxIncome();
				incomeRange = maxIncome - minIncome;
			},
			onUpdate: function (tracts) {
				var max = 0;
				tracts.forEach(function (tract, index) {
					var mesh = incomeColumns[index],
						amount,
						point;

					if (!mesh) {
						mesh = new THREE.Mesh(
							incomeGeo,
							new THREE.MeshBasicMaterial({
								opacity: 0.4
							})
						);
						scene.add(mesh);
						incomeColumns.push(mesh);
					} else {
						mesh.visible = true;
					}

					amount = (tract.income - minIncome) / incomeRange;
					mesh.material.color.setHSL(amount / 3, 1, 0.5);

					mesh.scale.y = MIN_INCOME_HEIGHT + amount * heightRange;

					point = viziWorld.project(new VIZI.LatLon(tract.latitude, tract.longitude));
					mesh.position.set(point.x, 0, point.y);

					max = index;
				});

				while (max < incomeColumns.length) {
					incomeColumns[max].visible = false;
					max++;
				}
			}
		});
		incomeData.load();

		incomeGeo = new THREE.CylinderGeometry(5, 5, 1, 8);
		incomeGeo.applyMatrix(new THREE.Matrix4().makeTranslation(0, 0.5, 0));

		VIZI.Messenger.on("world:updateView", function(center, zoom) {
			incomeData.update(center.lat, center.lon);
		});

		incomeData.update(START_LAT, START_LON);
	}

	function parseQuery() {
		var search = window.location.search.substr(1),
			queries = search.split('&'),
			hash;
		hash = queries.reduce(function (previous, current) {
			var split = current.split('='),
				key = split[0],
				val = split[1],
				num = parseFloat(val);

			previous[key] = isNaN(num) ? val : num;

			return previous;
		}, {});

		if (hash.height) {
			initialCameraPosition.y = hash.height;
		}

		if (hash.speed > 0) {
			MOVE_SPEED = hash.speed;
		}
	}

	function init() {
		var locationCache = {};

		parseQuery();
		initIncomeData();
		initVizi();
		initScene();
		initControls();

		resize();
		window.addEventListener('resize', resize, false);

		vrButton.addEventListener('click', function () {
			vrEffect.requestFullScreen();
		}, false);

		//todo: set up button to trigger full screen
		window.addEventListener('keydown', function (evt) {
			//console.log('keydown', evt.keyCode);

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
			} else if (evt.keyCode === 187 || evt.keyCode === 61) { //+
				//resizeFOV(0.1);
			} else if (evt.keyCode === 189 || evt.keyCode === 173) { //-
				//resizeFOV(-0.1);
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
			} else if (evt.keyCode === 32) { //space
				//vrMouse.center();
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
			function changeLocation(loc) {
				var latLng = new VIZI.LatLon(parseFloat(loc.lat), parseFloat(loc.lon)),
					pos = viziWorld.project(latLng);
				viziWorld.moveToLatLon(latLng);
				body.position.x = pos.x;
				body.position.z = pos.y;
			}

			var val = document.getElementById('location').value,
				url = 'http://nominatim.openstreetmap.org/search?format=json&q=',
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
		});
	}

	init();
	render();
}());