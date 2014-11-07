(function () {
	var initialCameraPosition = {
			x: 0,
			y: 801.82,
			z: 0
		},

		PEER_API_KEY = 'evy8rcz8vdy22o6r',

		START_LAT = 40.7564812,
		START_LON = -73.9861832,

		// START_LON = -77.03674468051466,
		// START_LAT = 38.89854112150404,

		FOG = 250,
		MOVE_SPEED = 800,
		SLOW_SPEED = MOVE_SPEED / 2,
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
		//octree, //for picking, collision detection
		rayCaster = new THREE.Raycaster(),

		depthTarget,
		sceneTarget,
		depthMaterial,
		ssaoEffect,

		//VIZI stuff
		Mediator = VIZI.Mediator,
		viziData,
		viziGeo,
		lastTick,

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

		clock = new THREE.Clock();

	function startMoving() {
		if (!moving) {
			// start moving in whichever direction the camera is looking
			moveVector.set(0, 0, 1).applyQuaternion(camera.quaternion);

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

					scratchVector.copy(body.position).divideScalar(CITY_SCALE);
					Mediator.publish('targetPositionChanged', scratchVector);
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
		//renderer.setSize(width, height);
		renderer.setSize(width / devicePixelRatio, height / devicePixelRatio);

		depthTarget = new THREE.WebGLRenderTarget( width, height, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, format: THREE.RGBAFormat } );
		sceneTarget = new THREE.WebGLRenderTarget( width, height, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, format: THREE.RGBAFormat } );
		ssaoEffect.uniforms.tDiffuse.value = sceneTarget;
		ssaoEffect.uniforms.tDepth.value = depthTarget;
		ssaoEffect.uniforms.size.value.set( width / 2, height );
	}

	function render() {
		var tick = Date.now();

		Mediator.publish('update', tick - lastTick, lastTick);

		vrControls.update();

		walkControl.update();
		if (!walkControl.moving()) {
			updatePosition();
		}

		scene.overrideMaterial = depthMaterial;
		vrEffect.render(scene, camera, depthTarget, true);

		scene.overrideMaterial = null;
		vrEffect.render(scene, camera, sceneTarget, true);

		ssaoEffect.render(renderer, null, sceneTarget);

		lastTick = tick;

		requestAnimationFrame( render );
	}

	function addObject(object) {
		cityContainer.add(object);
		// octree.add(object, {
		//  	useFaces: true
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

	function initScene() {
		renderer = new THREE.WebGLRenderer();

		scene = new THREE.Scene();
		//scene.fog = new THREE.Fog( 0xffffff, FOG * 0.9, FOG );

		/*
		octree = new THREE.Octree({
			// uncomment below to see the octree (may kill the fps)
			//scene: scene,
			// when undeferred = true, objects are inserted immediately
			// instead of being deferred until next octree.update() call
			// this may decrease performance as it forces a matrix update
			undeferred: true,
			// set the max depth of tree
			depthMax: Infinity,
			// max number of objects before nodes split or merge
			objectsThreshold: 8,
			// percent between 0 and 1 that nodes will overlap each other
			// helps insert objects that lie over more than one node
			overlapPct: 0.15
		});
		*/

		cityContainer = new THREE.Object3D();
		cityContainer.scale.multiplyScalar(CITY_SCALE);
		scene.add(cityContainer);

		body = new THREE.Object3D();
		body.position.x = initialCameraPosition.x;
		body.position.y = initialCameraPosition.y;
		body.position.z = initialCameraPosition.z;
		scene.add(body);

		camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 2, 40000);
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

		floorContainer = new THREE.Object3D();
		var floorGeom = new THREE.CircleGeometry(20000, 32);
		var floorMat = new THREE.MeshBasicMaterial({color: 0xf8f8f8});
		var floor = new THREE.Mesh(floorGeom, floorMat);
		floor.position.y = -0.4;
		floor.rotation.x = - 90 * Math.PI / 180;
		floor.name = 'floor';
		floorContainer.add(floor);
		addObject(floorContainer);

		var directionalLight = new THREE.DirectionalLight( 0x999999 );
		directionalLight.intesity = 0.1;
		THREE.ColorConverter.setHSV( directionalLight.color, 0.1, 0.1, 0.55 );
		directionalLight.position.x = 1;
		directionalLight.position.y = 1;
		directionalLight.position.z = 1;
		scene.add(directionalLight);

	    var directionalLight2 = new THREE.DirectionalLight( 0x999999 );
	    directionalLight2.intesity = 0.1;
	    // THREE.ColorConverter.setHSV( directionalLight2.color, 0.1, 0.1, 0.5 );
	    directionalLight2.position.x = -1;
	    directionalLight2.position.y = 1;
	    directionalLight2.position.z = -1;
	    scene.add(directionalLight2);

	    /*
		var loader = new THREE.OBJMTLLoader();
		loader.load( 'Godzilla/Godzilla.obj', 'Godzilla/Godzilla.mtl', function ( object ) {
			//recenterCompoundObject(object);
			object.position.z = -400;
			object.position.x = 1000;
			object.scale.multiplyScalar(4 * CITY_SCALE);
			//object.rotateY(Math.PI);
			scene.add( object );
			//objects.push(object);
			//pickTargets.push(object);
		});
		*/

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

		// depthTarget = new THREE.WebGLRenderTarget( window.innerWidth, window.innerHeight, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, format: THREE.RGBAFormat } );
		// sceneTarget = new THREE.WebGLRenderTarget( window.innerWidth, window.innerHeight, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, format: THREE.RGBAFormat } );

		ssaoEffect = new THREE.ShaderPass( THREE.SSAOShader );
		ssaoEffect.uniforms.lumInfluence.value = 0.8;
		// ssaoEffect.uniforms.tDiffuse.value = sceneTarget;
		// ssaoEffect.uniforms.tDepth.value = depthTarget;
		// ssaoEffect.uniforms.size.value.set( window.innerWidth, window.innerHeight );
		ssaoEffect.uniforms.cameraNear.value = camera.near;
		ssaoEffect.uniforms.cameraFar.value = camera.far;
		ssaoEffect.renderToScreen = true;
		ssaoEffect.clear = true;

		//ssaoEffect.uniforms.onlyAO.value = true;

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
		//VIZI.DEBUG = true;
		//VIZI.ENABLE_OUTLINES = true;
		//VIZI.ENABLE_ROADS = true;

		geo = VIZI.Geo.getInstance({
			center: [START_LON, START_LAT] //midtown manhattan
		});

		grid = VIZI.Grid.getInstance();
		grid.init(geo.center);

		data = new VIZI.DataOverpass({
			gridUpdate: true
		});

		data.update().done(function() {
			VIZI.Log('Finished loading Overpass data');
		});

		Mediator.subscribe('addToScene', addObject);
		Mediator.subscribe('removeFromScene', removeObject);
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

	function init() {
		initScene();
		initVizi();
		initControls();

		resize();
		window.addEventListener('resize', resize, false);

		vrButton.addEventListener('click', function () {
			vrEffect.requestFullScreen();
		}, false);

		//todo: set up button to trigger full screen
		window.addEventListener('keydown', function (evt) {
			console.log('keydown', evt.keyCode);
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
	}

	init();
	render();
}());