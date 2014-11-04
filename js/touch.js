(function () {
	var PEER_API_KEY = 'evy8rcz8vdy22o6r',

		//communication stuff
		peer,
		connection;

	function initPeer(peerId) {
		var status = document.getElementById('status'),
			connectionDied = false,
			pingCount = 0;

		function updateStatus() {
			var text = [];
			if (peer && peer.open) {
				text.push('Connected to PeerJS Server: ' + peer.id);
			} else {
				text.push('No open Peer yet');
			}

			if (connection) {
				if (connection.open) {
					text.push('Connected to Peer: ' + connection.peer);
				} else {
					text.push('Disconnected from Peer: ' + connection.peer);
				}
			}

			status.innerText = text.join('\n');
		}

		function connect() {
			var pingTime,
				pingId;

			function ping() {
				pingId = pingCount++;
				pingTime = performance.now();
				connection.send({
					action: 'ping',
					pingId: pingId
				});
			}

			if (connection && !connectionDied) {
				return;
			}

			connectionDied = false;

			connection = peer.connect(peerId);

			connection.on('data', function(data){
				if (data.action === 'hover') {
					if (navigator.vibrate) {
						navigator.vibrate(20);
					}
				} else if (data.action === 'pong' && data.pingId === pingId) {
					console.log('pong', (performance.now() - pingTime) / 2);
				}
			});

			connection.on('error', function (err){
				console.log('connection error', err);
				connectionDied = true;
				updateStatus();
			});

			connection.on('open', function (){
				console.log('connection opened');
				ping();
				updateStatus();
			});

			connection.on('close', function (){
				console.log('connection closed');
				//connection = null;
				connectionDied = true;
				updateStatus();
			});
			updateStatus();
		}

		function visibilityChange() {
			if (document.hidden ||
					document.mozHidden ||
					document.webkitHidden ||
					document.msHidden) {

				if (connection) {
					connection.close();
					updateStatus();
				}
			} else if (!connection || !connection.open) {
				connect();
			}
		}

		peer = new Peer({
			key: PEER_API_KEY
		});

		peer.on('open', function () {
			console.log('peer opened');
			visibilityChange();
		});

		peer.on('error', function (err) {
			console.log('peer error', err);
			updateStatus();
		});

		peer.on('disconnected', function () {
			console.log('peer disconnected');
			updateStatus();
		});

		peer.on('close', function () {
			console.log('peer closed');
			updateStatus();
		});

		//todo: close connection when tab in background, re-open when returns
		window.addEventListener('visibilitychange', visibilityChange, true);
		window.addEventListener('mozvisibilitychange', visibilityChange, true);
		window.addEventListener('webkitvisibilitychange', visibilityChange, true);
		window.addEventListener('msvisibilitychange', visibilityChange, true);

		window.addEventListener('touchstart', function (evt) {
			if (!connection || !connection.open) {
				connect();
			}
		}, true);

		updateStatus();
	}

	function initFullScreen() {
		function fullScreenChange() {
			var screen = window.screen;
			if (screen.lockOrientation) {
				screen.lockOrientation('portrait-primary');
			} else if (screen.mozLockOrientation) {
				screen.mozLockOrientation('portrait-primary');
			} else if (screen.orientation && screen.orientation.lock) {
				screen.orientation.lock('portrait-primary');
			}
		}

		function requestFullScreen(element) {
			var method = element.requestFullScreen ||
				element.mozRequestFullScreen ||
				element.webkitRequestFullScreen ||
				element.msRequestFullscreen;

			if (method) {
				method.call(element);
			}
		}

		window.addEventListener('fullscreenchange', fullScreenChange, true);
		window.addEventListener('mozfullscreenchange', fullScreenChange, true);
		window.addEventListener('webkitfullscreenchange', fullScreenChange, true);
		window.addEventListener('msfullscreenchange', fullScreenChange, true);

		window.addEventListener('touchstart', function (evt) {
			requestFullScreen(document.body);
		}, true);

		requestFullScreen(document.body);
	}

	function getOrientation() {
		switch (window.screen.orientation || window.screen.mozOrientation) {
			case 'landscape-primary':
				return 90;
			case 'landscape-secondary':
				return -90;
			case 'portrait-secondary':
				return 180;
			case 'portrait-primary':
				return 0;
		}
		// this returns 90 if width is greater then height
		// and window orientation is undefined OR 0
		// if (!window.orientation && window.innerWidth > window.innerHeight)
		//   return 90;
		return window.orientation || 0;
	}

	function initOrientation() {
		var absolute = document.getElementById('absolute'),
			alpha = document.getElementById('alpha'),
			beta = document.getElementById('beta'),
			gamma = document.getElementById('gamma');

		window.addEventListener('deviceorientation', function (evt) {
			absolute.textContent = evt.absolute;
			alpha.textContent = evt.alpha;
			beta.textContent = evt.beta;
			gamma.textContent = evt.gamma;

			if (connection && connection.open) {
				connection.send({
					action: 'orientation',
					orientation: getOrientation(),
					alpha: evt.alpha,
					beta: evt.beta,
					gamma: evt.gamma
				});
			}
		}, true);
	}

	function initTouch() {
		var moved = false,
			touchX,
			touchY,
			multiTouch = false,
			startOrientation = 0;

		window.addEventListener('touchstart', function (evt) {
			if (evt.touches.length > 1) {
				multiTouch = true;
			}
			if (!moved && multiTouch &&
					connection && connection.open) {

				connection.send({
					action: 'recenter'
					//todo: add orientation data?
				});
				return;
			}
			if (!moved && evt.touches.length === 1) {
				touchX = evt.touches[0].screenX;
				touchY = evt.touches[0].screenY;

				//todo: account for rotation
				startOrientation = getOrientation();
			}
			evt.preventDefault();
		}, true);

		window.addEventListener('touchmove', function (evt) {
			var x, y,
				orientation;

			if (evt.touches.length === 1) {
				moved = true;

				x = evt.touches[0].screenX;
				y = evt.touches[0].screenY;

				//todo: account for rotation
				orientation = getOrientation();

				if (connection && connection.open) {
					connection.send({
						action: 'move',
						x: (touchX - x) / window.screen.width,
						z: (touchY - y) / window.screen.height
					});
				}
			}
		}, true);

		window.addEventListener('touchend', function (evt) {
			if (!evt.touches.length) {
				if (!moved && !multiTouch && connection && connection.open) {
					connection.send({
						action: 'click'
					});
				} else if (moved && connection && connection.open) {
					connection.send({
						action: 'stop'
					});
				}

				moved = false;
				multiTouch = false;
			}
		}, true);

		window.addEventListener('touchcancel', function (evt) {
			console.log('touchcancel!');
		}, true);
	}

	initOrientation();
	initTouch();
	initFullScreen();
	initPeer(window.location.hash.substr(1));
}());