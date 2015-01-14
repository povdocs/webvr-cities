(function () {
	'use strict';

	var precision = 10000,
		ZOOM = 14;

	// from https://gist.github.com/christophermanning/ac4c3265452529a20279
	// Based on https://www.jasondavies.com/poisson-disc/
	function poissonDiscSampler(width, height, radius) {
		var k = 30, // maximum number of samples before rejection
				radius2 = radius * radius,
				R = 3 * radius2,
				cellSize = radius * Math.SQRT1_2,
				gridWidth = Math.ceil(width / cellSize),
				gridHeight = Math.ceil(height / cellSize),
				grid = new Array(gridWidth * gridHeight),
				queue = [],
				queueSize = 0,
				sampleSize = 0;

		return function() {
			if (!sampleSize) return sample(Math.random() * width, Math.random() * height);

			// Pick a random existing sample and remove it from the queue.
			while (queueSize) {
				var i = Math.random() * queueSize | 0,
						s = queue[i];

				// Make a new candidate between [radius, 2 * radius] from the existing sample.
				for (var j = 0; j < k; ++j) {
					var a = 2 * Math.PI * Math.random(),
							r = Math.sqrt(Math.random() * R + radius2),
							x = s[0] + r * Math.cos(a),
							y = s[1] + r * Math.sin(a);

					// Reject candidates that are outside the allowed extent,
					// or closer than 2 * radius to any existing sample.
					if (0 <= x && x < width && 0 <= y && y < height && far(x, y)) return sample(x, y);
				}

				queue[i] = queue[--queueSize];
				queue.length = queueSize;
			}
		};

		function far(x, y) {
			var i = x / cellSize | 0,
					j = y / cellSize | 0,
					i0 = Math.max(i - 2, 0),
					j0 = Math.max(j - 2, 0),
					i1 = Math.min(i + 3, gridWidth),
					j1 = Math.min(j + 3, gridHeight);

			for (j = j0; j < j1; ++j) {
				var o = j * gridWidth;
				for (i = i0; i < i1; ++i) {
					if (s = grid[o + i]) {
						var s,
								dx = s[0] - x,
								dy = s[1] - y;
						if (dx * dx + dy * dy < radius2) return false;
					}
				}
			}

			return true;
		}

		function sample(x, y) {
			var s = [x, y];
			queue.push(s);
			grid[gridWidth * (y / cellSize | 0) + (x / cellSize | 0)] = s;
			++sampleSize;
			++queueSize;
			return s;
		}
	}

	window.dataViz('animals', (function () {
		var object,
			scene,
			map,
			counties,
			voronoi,
			diagram,
			tiles = {};

		function long2tile(lon,zoom) { return (Math.floor((lon+180)/360*Math.pow(2,zoom))); }
		function lat2tile(lat,zoom)	{ return (Math.floor((1-Math.log(Math.tan(lat*Math.PI/180) + 1/Math.cos(lat*Math.PI/180))/Math.PI)/2 *Math.pow(2,zoom))); }

		function tile2long(x,z) {
			return (x/Math.pow(2,z)*360-180);
		}
		function tile2lat(y,z) {
			var n=Math.PI-2*Math.PI*y/Math.pow(2,z);
			return (180/Math.PI*Math.atan(0.5*(Math.exp(n)-Math.exp(-n))));
		}

		function gridUpdated(allTiles, newTiles) {
			newTiles.forEach(function (tile) {
				var lon = tile2long(tile.x, tile.z),
					lat = tile2lat(tile.y, tile.z),
					x = long2tile(lon, ZOOM),
					y = lat2tile(lat, ZOOM),
					key = [x, y].join('/'),
					countyTile = tiles[key];

				if (!countyTile || countyTile.requested) {
					return;
				}

				countyTile.requested = true;
				d3.json('data/animals/' + [ZOOM, x, y].join('/') + '.json', function(error, data) {
					if (error) {
						if (VIZI.DEBUG) console.log('Failed to request GeoJSON data');
						console.warn(error);
						return;
					}

					//todo: poisson disk sample to load pigs, chickens, etc.
				});
			});
		}

		function loadCounties() {
			if (counties === undefined) {
				counties = null;

				// Request data
				d3.csv('data/statecounty.csv', function(error, data) {
					if (error) {
						if (VIZI.DEBUG) console.log('Failed to request CSV data');
						console.warn(error);
						return;
					}

					//todo: run this all in a worker?

					var points = data.map(function (county) {
						var key = county['FIPS 5-2(State)'] + '/' + county['FIPS 6-4(County)'];

						county.Latitude = parseFloat(county.Latitude);
						county.Longitude = parseFloat(county.Longitude);

						return {
							x: county.Longitude * precision,
							y: county.Latitude * precision,
							data: county,
							id: key
						};
					});

					var bbox = points.reduce(function (bbox, point) {
						return {
							xl: Math.min(bbox.xl, point.x - 10),
							xr: Math.max(bbox.xr, point.x + 10),

							yt: Math.min(bbox.yt, point.y - 10),
							yb: Math.max(bbox.yb, point.y + 10)
						};
					}, {
						xl: Infinity,
						xr: -Infinity,
						yt: Infinity,
						yb: -Infinity
					});

					diagram = voronoi.compute(points, bbox);

					// treemap = new QuadTree({
					// 	x: bbox.xl,
					// 	y: bbox.yt,
					// 	width: bbox.xr - bbox.xl,
					// 	height: bbox.yb - bbox.yt
					// });

					//todo: add all cells from diagram to treemap
					diagram.cells.forEach(function (cell) {
						var x, y, key,
							lon, lat,
							tile;

						//var leaf = cell.getBbox();
						//leaf.cell = cell;
						//self.treemap.insert(leaf);

						lat = cell.site.data.Latitude;
						lon = cell.site.data.Longitude;

						x = long2tile(lon, ZOOM);
						y = lat2tile(lat, ZOOM);
						key = [x, y].join('/');

						tile = tiles[key];
						if (!tile) {
							tiles[key] = tile = {
								hash: {},
								list: [],
								requested: false,
								object: null
							};
						}
						tile.hash[cell.site.id] = cell;
						tile.list.push(cell);
					});

					// counties = data.reduce(function (obj, county) {
					// 	var key = county['FIPS 5-2(State)'] + '/' + county['FIPS 6-4(County)'];
					// 	obj[key] = county;

					// 	return obj;
					// }, {});
					// console.log(counties);
				});
			}
		}

		return {
			layers: {
				buildings: false,
				//map: false,
				animals: true
			},
			info: [
				'<h2>Local population by race</h2>',
				'<p>Source: US Census 2010. Inspired by ',
				'<a href="http://www.coopercenter.org/demographics/Racial-Dot-Map" target="_new">',
				'The Racial Dot Map</a>.',
				'<ul style="list-style: none; padding: 0; margin: 0;">',
				'<li><span style="color: rgb(115, 178, 255);">&#x2B24;</span> White</li>',
				'<li><span style="color: rgb(85, 255, 0);">&#x2B24;</span> Black</li>',
				'<li><span style="color: rgb(255, 0, 0);">&#x2B24;</span> Asian</li>',
				'<li><span style="color: rgb(255, 170, 0);">&#x2B24;</span> Hispanic</li>',
				'<li><span style="color: rgb(136, 90, 68);">&#x2B24;</span> Other Race / Native American / Multi-racial</li>',
				'</ul>'
			].join(''),
			init: function (s) {
				scene = s;
				//object = new THREE.Object3D();
				//scene.add(object);

				//voronoi = new Voronoi();
			},
			activate: function () {
				// object.visible = true;
				//loadCounties();
			},
			deactivate: function () {
				// object.visible = false;
			},
			layersLoaded: function (layers) {
				map = layers.map;
				//map.switchboard.output.on('gridUpdated', gridUpdated);
			},
			height: 30/*,
			latitude: 34.990574,
			longitude: -78.371382*/
		};
	}()));
}());