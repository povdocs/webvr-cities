/**
 * @author bchirls / http://chirls.com/
 * Copyright (c) 2014 American Documentary Inc.
 * License: MIT http://opensource.org/licenses/mit-license.php
 */

THREE.VRMouse = function( origin, targets, options ) {
	var self = this;

	options = options || {};

	this.pointer = options.pointer;
	if ( !this.pointer ) {
		this.pointer = new THREE.Mesh(
			new THREE.TorusGeometry( 0.1, 0.02, 16, 32 ),
			new THREE.MeshBasicMaterial( { color: 0xffffff, side: THREE.DoubleSide } )
		);
	}

	var element = options.element || document.body;

	var requestPointerLock = (element.requestPointerLock ||
			element.mozRequestPointerLock ||
			element.webkitRequestPointerLock).bind(element);
	var exitPointerLock = (document.exitPointerLock ||
			document.mozExitPointerLock ||
			document.webkitExitPointerLock).bind(document);

	var near = options.near || 1;
	var far = options.far || 1000;
	var rest = options.rest || Math.min(far, Math.max(1, near * 4));
	var fixedDistance = Math.max(options.fixedDistance || 0, 0);
	var onMouseOver = options.onMouseOver;
	var onMouseOut = options.onMouseOut;
	var onClick = options.onClick;
	var onMouseDown = options.onMouseDown;
	var onMouseUp = options.onMouseUp;
	var onMouseMove = options.onMouseMove;

	var mouseLat = 0, mouseLon = Math.PI / 2;
	var raycaster = new THREE.Raycaster();
	var mouseVector = new THREE.Vector3(0, 0, 1);
	var scratchVector = new THREE.Vector3();
	var originPosition = new THREE.Vector3();
	var worldNormal = new THREE.Vector3();

	//var mouseX = 0, mouseY = 0;
	var target = null;
	var intersection;

	var frozen = false;
	var locked = false;

	var horizontal = new THREE.Vector3(0, -1, 0);
	var vertical = new THREE.Vector3(1, 0, 0);

	function mouseMove(e) {
		var dx, dy,
			cos,
			pointerLockElement;

		if ( frozen ) {
			return;
		}

		pointerLockElement = document.pointerLockElement === element ||
			document.mozPointerLockElement === element ||
			document.webkitPointerLockElement === element;

		if (pointerLockElement) {
			locked = true;
			dx = e.movementX || e.mozMovementX || e.webkitMovementX || 0;
			dy = e.movementY || e.mozMovementY || e.webkitMovementY || 0;

			mouseLat -= dy * Math.PI / 1800;
			mouseLon += dx * Math.PI / 1800;
			mouseLat = Math.min(Math.PI / 2, Math.max(-Math.PI / 2, mouseLat));

			mouseVector.y = Math.sin(mouseLat);
			cos = Math.cos(mouseLat);
			mouseVector.x = cos * Math.cos(mouseLon);
			mouseVector.z = cos * Math.sin(mouseLon);
			self.update();
			if (onMouseMove) {
				onMouseMove(intersection);
			}
		} else {
			locked = false;
		}
	}

	function mouseDown() {
		self.update();
		if (!frozen && locked) {
			onMouseDown(intersection);
			self.update();
		}
	}

	function mouseUp() {
		self.update();
		if (!frozen && locked) {
			onMouseUp(intersection);
			self.update();
		}
	}

	function click() {
		self.update();
		if (intersection && !frozen && locked) {
			onClick(intersection);
			self.update();
		}
	}

	function pointerLockChange() {
		pointerLockElement = document.pointerLockElement === element ||
			document.mozPointerLockElement === element ||
			document.webkitPointerLockElement === element;

		if (pointerLockElement === element) {
			document.addEventListener('mousemove', mouseMove, false);
		} else {
			document.removeEventListener('mousemove', mouseMove, false);
		}
	}

	document.addEventListener('pointerlockchange', pointerLockChange, false);
	document.addEventListener('mozpointerlockchange', pointerLockChange, false);
	document.addEventListener('webkitpointerlockchange', pointerLockChange, false);

	element.addEventListener('mousemove', mouseMove, false);
	if (onClick) {
		element.addEventListener('click', click, false);
	}
	if (onMouseDown) {
		element.addEventListener('mousedown', mouseDown, false);
	}
	if (onMouseUp) {
		element.addEventListener('mouseup', mouseUp, false);
	}

	Object.defineProperty(self, 'fixedDistance', {
		get: function () {
			return fixedDistance;
		},
		set: function(newValue) {
			fixedDistance = Math.max(0, newValue || 0);
			self.update();
		},
		enumerable: true,
		configurable: true
	});

	this.update = function () {
		function updatePointer() {
			if ( self.pointer ) {
				if ( intersection && !fixedDistance ) {
					self.pointer.position.copy( intersection.point );

					var normalMatrix = new THREE.Matrix3().getNormalMatrix( intersection.object.matrixWorld );
					worldNormal.copy(intersection.face.normal).applyMatrix3( normalMatrix ).normalize();

					scratchVector.copy( intersection.point ).add( worldNormal );
					self.pointer.lookAt( scratchVector );
				} else {
					//scale scratchVector (normalized mouse vector) and use it for cursor position
					scratchVector.multiplyScalar( Math.max(near, fixedDistance || rest) ).add( originPosition );
					self.pointer.position.copy( scratchVector );
					self.pointer.lookAt( originPosition );
				}
			}
		}

		if ( frozen ) {
			return;
		}

		originPosition.copy( origin.position );
		origin.localToWorld( originPosition );

		scratchVector.copy( mouseVector );
		scratchVector.normalize();
		raycaster.set( originPosition, scratchVector );

		var intersects = raycaster.intersectObjects( targets );
		var oldTarget;

		if ( intersects.length > 0 ) {
			intersection = intersects[ 0 ];
			updatePointer();

			if ( target != intersection.object ) {
				if ( target ) {
					oldTarget = target;
					target = null;
					if ( onMouseOut ) {
						onMouseOut( oldTarget );
					}
				}
				target = intersection.object;
				if ( onMouseOver ) {
					onMouseOver( target );
				}
			}
		} else {
			intersection = null;
			updatePointer();
			if ( target ) {
				oldTarget = target;
				target = null;
				if ( onMouseOut ) {
					onMouseOut( oldTarget );
				}
			}
		}
	};

	this.target = function () {
		return target;
	};

	this.frozen = function () {
		return frozen;
	};

	this.freeze = function () {
		frozen = true;
	};

	this.unfreeze = function () {
		frozen = false;
		this.update();
	};

	this.center = function () {
		var position = new THREE.Vector3();
		var quaternion = new THREE.Quaternion();
		var scale = new THREE.Vector3();
		var cos;

		origin.updateMatrixWorld( true );
		origin.matrixWorld.decompose( position, quaternion, scale );

		mouseVector.set( 0, 0, -1 ).applyQuaternion( quaternion );
		mouseLat = Math.asin( mouseVector.y );
		cos = Math.cos( mouseLat );
		mouseLon = Math.acos( mouseVector.x / cos);

		this.update();
	};

	this.lock = requestPointerLock;
	this.unlock = exitPointerLock;

	this.locked = function () {
		return locked;
	};

	//todo: destroy - release event listeners, destroy mouse object
};