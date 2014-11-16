(function (root) {
	var ZOOM = 16,
		fields = ['population', 'latitude', 'longitude', 'income', 'errormargin'];

	function long2tile(lon, zoom) {
		return Math.floor((lon + 180) / 360 * Math.pow(2, zoom));
	}
	function lat2tile(lat, zoom) {
		return Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom));
	}
	function tile2long(x, z) {
		return x / Math.pow(2, z) * 360 - 180;
	}
	function tile2lat(y, z) {
		var n = Math.PI - 2 * Math.PI * y / Math.pow(2, z);
		return 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
	}

	function IncomeData(options) {
		var tiles = {},
			activeTracts = [],
			latitude = 0,
			longitude = 0,
			tilesPerDirection = options && options.tilesPerDirection || 1,
			xTile = -1,
			yTile = -1,
			xhr,
			thresholdDist2 = 0,
			minIncome = Infinity,
			maxIncome = 0;

		if (!options) {
			options = {};
		}

		function update(force) {
			var x, y,
				minX, maxX,
				minY, maxY,
				i, j,
				k,
				tile,
				d2Primary;

			function distSquared(tract, t2) {
				var lat, lon;

				if (t2) {
					lat = t2.latitude;
					lon = t2.longitude;
				} else {
					lat = latitude;
					lon = longitude;
				}
				return Math.pow(tract.latitude - lat, 2) + Math.pow(tract.longitude - lon, 2);
			}

			function sort(a, b) {
				//compare distance squared
				return distSquared(a) - distSquared(b);
			}

			x = long2tile(longitude, ZOOM);
			y = lat2tile(latitude, ZOOM);

			if (xTile !== x || yTile !== y || force) {
				xTile = x;
				yTile = y;

				minX = x - tilesPerDirection;
				maxX = x + tilesPerDirection;
				minY = y - tilesPerDirection;
				maxY = y + tilesPerDirection;

				activeTracts.length = 0;
				for (i = minX; i <= maxX; i++) {
					for (j = minY; j <= maxY; j++) {
						tile = tiles[i + '-' + j];
						if (tile) {
							activeTracts.push.apply(activeTracts, tile);
						}
					}
				}
			}

			if (activeTracts.length) {
				d2Primary = distSquared(activeTracts[0]);
				if (d2Primary >= thresholdDist2 && activeTracts.length > 1) {
					activeTracts.sort(sort);

					thresholdDist2 = Math.pow(Math.sqrt(distSquared(activeTracts[0], activeTracts[1])) / 2, 2);
				}
			}
			if (options && options.onUpdate) {
				options.onUpdate(activeTracts);
			}
		}

		this.load = function () {
			if (xhr) {
				return;
			}

			xhr = new XMLHttpRequest();
			xhr.onload = function () {
				var response = this.responseText,
					regex = /(\d+),([+\-]?\d+\.\d+),([+\-]?\d+\.\d+),(\d+),(\d+)/g;

				function reduce(previous, current, index) {
					var field = fields[index];

					if (field) {
						previous[field] = parseFloat(current);
					}

					return previous;
				}

				function next() {
					var start = Date.now(),
						match,
						tile,
						x, y,
						key;

					//do it in chunks, taking no more than a few milliseconds at a time
					do {
						match = regex.exec(response);
						if (match && match.length) {
							match.shift();
							tile = match.reduce(reduce, {});

							if (tile.income && tile.population) {
								minIncome = Math.min(minIncome, tile.income);
								maxIncome = Math.max(maxIncome, tile.income);

								x = long2tile(tile.longitude, ZOOM);
								y = lat2tile(tile.latitude, ZOOM);
								key = [x, y].join('-');
								
								if (!tiles[key]) {
									tiles[key] = [tile];
								} else {
									tiles[key].push(tile);
								}
							}
						}
					} while (match !== null && Date.now() - start < 6);

					if (match !== null) {
						setTimeout(next, 5);
					} else {
						if (options && options.onLoad) {
							options.onLoad();
						}
						update(true);
					}
				}

				next();
			};
			xhr.open('get', options.path || 'data/incomedata.csv', true);
			xhr.send();
		};

		this.update = function (lat, lon) {
			if (latitude !== lat || longitude !== lon) {
				latitude = lat;
				longitude = lon;
				update();
			}
		};

		this.minIncome = function () {
			return minIncome;
		};

		this.maxIncome = function () {
			return maxIncome;
		};
	}

	root.IncomeData = IncomeData;
}(this));