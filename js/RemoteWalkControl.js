THREE.RemoteWalkControl = function ( object, options ) {

	options = options || {};

	var self = this;

	// configurable
	var moveSpeed = options.moveSpeed || 10;
	var slowSpeed = options.slowSpeed | moveSpeed / 5;
	var peerApiKey = options.peerApiKey;
	var peerOptions = options.peerOptions || {
		key: peerApiKey
	};
	var camera = options.camera || object;
	//todo: allow configurable up vector. for now assume it's +Y

	var peer;
	var peerId;
	var connection;

	var lastUpdateTime = 0;
	var neverRecentered = true;
	var moving = false;

	var orientationQuaternion = new THREE.Quaternion();
	var euler = new THREE.Euler();
	var pointerVector = new THREE.Vector3();

	function startMoving() {
	}

	function stopMoving() {
	}

	function updateOrientation( data ) {
		var alpha,
			beta,
			gamma,
			orient;

		alpha = data.gamma ?
		THREE.Math.degToRad(data.alpha) : 0; // Z
		beta = data.beta ?
		THREE.Math.degToRad(data.beta) : 0; // X'
		gamma = data.gamma ?
		THREE.Math.degToRad(data.gamma) : 0; // Y''
		orient = data.orientation ?
		THREE.Math.degToRad(data.orientation) : 0; // O

		orient = 0;

		// The angles alpha, beta and gamma
		// form a set of intrinsic Tait-Bryan angles of type Z-X'-Y''

		// 'ZXY' for the device, but 'YXZ' for us
		euler.set(beta, alpha, - gamma, 'YXZ');

		orientationQuaternion.setFromEuler(euler);

		pointerVector.set(0, 0, -1).applyQuaternion(orientationQuaternion);
		pointerVector.applyAxisAngle(yAxis, offsetAngle);

		// pointerLat = Math.asin(pointerVector.y);
		// pointerLon = Math.acos(pointerVector.z / Math.cos(pointerLat));
		// if (pointerVector.x < 0) {
		// 	pointerLon *= -1;
		// }
	}

	if ( !object || !( object instanceof THREE.Object3D ) ) {
		throw "Need an object to navigate with";
	}

	if ( !peerOptions.key ) {
		throw "Need a PeerJS API Key";
	}

	this.update = function () {
		var time;
		var delta;

		time = performance.now();

		//throttle speed in case we dropped a lot of frames to prevent barf
		delta = Math.min(0.2, time - lastUpdateTime);

		if (moving) {
			/*
			cos = Math.cos(pointerLon);
			sin = Math.sin(pointerLon);

			z = cos * moveZ - sin * moveX;
			x = sin * moveZ + cos * moveX;

			//normalize for calculating longitude of movement vector
			length = Math.sqrt(x * x + z * z);
			moveLongitude = Math.acos(z / length);
			if (x < 0) {
				moveLongitude *= -1;
			}

			vector = new THREE.Vector3(0, 0, 1);
			vector.applyQuaternion(camera.quaternion);
			vector.normalize();

			cos = Math.cos(Math.asin(vector.y));
			if (cos) {
				cameraLon = Math.acos(vector.z / cos);
				if (vector.x < 0) {
					cameraLon *= -1;
				}

				//slow down if you're not moving in the direction you're looking
				//so you don't puke

				speed = SLOW_SPEED + (MOVE_SPEED - SLOW_SPEED) * Math.pow(1 - Math.abs(moveLongitude - cameraLon) / Math.PI, 2);
			}

			object.position.z += z * delta * speed;
			object.position.x += x * delta * speed;
			*/
		}

		lastUpdateTime = time;
	};

	this.recenter = function () {
	};

	this.connect = function (id) {
		if ( peer ) {
			this.disconnect();
		}

		peer = new Peer( id, peerOptions );

		peer.on( "error", function ( error ) {
			self.dispatchEvent( {
				type: "error",
				data: error
			} );
		} );

		peer.on( "disconnected", function () {
			self.dispatchEvent( {
				type: "peerdisconnected"
			} );
		} );

		peer.on( "close", function () {
			self.dispatchEvent( {
				type: "peerclosed"
			} );
		} );

		peer.on( "connection", function ( conn ) {
			if (connection && connection.open) {
				//todo: bump existing connection if we haven't had any data from it in a while
				console.log("Only one connection allowed at a time", conn);
				conn.close();
				return;
			}

			self.dispatchEvent( {
				type: "connected"
			} );

			connection = conn;
		} );

		connection.on( "data", function ( data ) {
			if (data.action === 'orientation') {
				updateOrientation(data);
				if (neverRecentered) {
					neverRecentered = false;
					self.recenter();
				}

			} else if (data.action === 'recenter') {
				self.recenter();

			} else if (data.action === 'ping') {
				connection.send({
					action: 'pong',
					pingId: data.pingId
				});

			} else if (data.action === 'move') {
				moving = true;
				moveX = data.x;
				moveZ = data.z;

			} else if (data.action === 'stop') {
				stopMoving();
			}
		});

		connection.on( "error", function ( error ) {
			self.dispatchEvent( {
				type: "error",
				data: error
			} );
		} );

		connection.on( "close", function () {
			self.dispatchEvent( {
				type: "disconnected"
			} );
			connection = null;
		} );
	};

	this.disconnect = function (id) {
		if ( peer ) {
			peer.disconnect();
		}
	};
};

THREE.RemoteWalkControl.prototype = Object.create( THREE.EventDispatcher.prototype );