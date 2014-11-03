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
	var yAxis = new THREE.Vector3(0, 1, 0);
	var offsetAngle = 0;

	var pointerVector = new THREE.Vector3(0, 0, 1);
	var moveVector = new THREE.Vector3();
	var lookVector = new THREE.Vector3(0, 0, 1);

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
		var angle = 0;
		var speed;

		time = performance.now();

		/*
		limit movement to prevent barf or getting totally lost,
		in case we dropped a lot of frames
		*/
		delta = Math.min(0.2, time - lastUpdateTime);

		if (moving) {
			moveVector.set(moveX, 0, moveZ);
			speed = moveVector.length();

			moveVector.multiply(pointerVector).normalize();

			if (camera) {
				lookVector
					.set(0, 0, 1)
					.applyQuaternion(camera.quaternion)
					.setY(0)
					.normalize();
				angle = Math.abs(lookVector.angleTo(moveVector));
				speed *= slowSpeed + (moveSpeed - slowSpeed) * Math.pow(1 - angle / Math.PI, 2);
			} else {
				speed *= moveSpeed;
			}

			moveVector.multiplyScalar(speed * delta);
			object.position.add(moveVector);
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
		if (camera) {
			lookVector
				.set(0, 0, -1)
				.applyQuaternion(camera.quaternion)
				.setY(0)
				.normalize();
			offsetAngle = lookVector.angleTo(pointerVector);
		}
		neverRecentered = false;
		self.dispatchEvent( {
			type: "recenter"
		} );
	};

	this.connect = function (id) {

		function peerConnection( conn ) {
			if ( connection && connection.open ) {
				/*
				todo: allow many connections, and pick the first one that sends
				the data we can use
				*/
				console.log( "Only one connection allowed at a time", conn );
				//conn.close();
				return;
			}

			connection = conn;

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
					moving = false;
				}
			});

			connection.on( "error", function ( error ) {
				self.dispatchEvent( {
					type: "error",
					data: error
				} );
			} );

			connection.on( "open", function () {
				console.log("connection open");
			} );

			connection.on( "close", function () {
				moving = false;
				self.dispatchEvent( {
					type: "disconnected"
				} );
				connection = null;
			} );

			self.dispatchEvent( {
				type: "connected"
			} );

			connection = conn;
		}

		function peerOpen( id ) {
			self.dispatchEvent( {
				type: "open",
				id: id
			} );
		}

		if ( peer ) {
			this.disconnect();
		}

		if ( id instanceof window.Peer ) {
			peer = id;
			if ( peer.id && peer.open ) {
				peerOpen( peer.id );
				if ( peer.connections && peer.connections.length ) {
					peerConnection( peer.connections[ 0 ] );
				}
			}
		} else {
			peer = new Peer( id, peerOptions );
		}

		peer.on( "error", function ( error ) {
			self.dispatchEvent( {
				type: "error",
				data: error
			} );
		} );

		peer.on( "disconnected", function () {
			moving = false;
			self.dispatchEvent( {
				type: "peerdisconnected"
			} );
		} );

		peer.on( "close", function () {
			self.dispatchEvent( {
				type: "peerclosed"
			} );
		} );

		peer.on( "open", peerOpen );

		peer.on( "connection", peerConnection );
	};

	this.disconnect = function ( id ) {
		if ( peer ) {
			peer.disconnect();
		}
		moving = false;
	};

	this.peer = function () {
		return peer;
	};

	this.connected = function () {
		return !!( connection && connection.open );
	};

	this.moving = function () {
		return moving;
	};
};

THREE.RemoteWalkControl.prototype = Object.create( THREE.EventDispatcher.prototype );