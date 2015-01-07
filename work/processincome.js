var zoom = 12;
var fs = require('node-fs');
var csv = require('fast-csv');
var stream = fs.createReadStream('censusincome.csv');

var tiles = {};

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

var fields = ['tract', 'income', 'errormargin', 'population', 'latitude', 'longitude'];
var minX = Infinity,
	maxX = 0,
	minY = Infinity,
	maxY = 0;
var most = 0;

var badData = [];

var csvStream = csv
	.parse()
	.on("data", function(data){
		if (data[0][0] === '#') {
			return;
		}

		//console.log(data);

		//var values = data.map(parseFloat);
		var point = data.reduce(function (previous, current, index) {
			var field = fields[index];
			//console.log('field', field);
			//console.log(previous, current, index);
			previous[field] = parseFloat(current);

			return previous;
		}, {});

		var x = long2tile(point.longitude, zoom);
		var y = lat2tile(point.latitude, zoom);

		if (isNaN(x) || isNaN(y)) {
			if (!isNaN(point.longitude) || !isNaN(point.latitude)) {
				debugger;
			} else {
				badData.push(point);
			}
			return;
		}
		var key = [zoom, x, y].join('/');

		var feature = {
			type: 'Feature',
			geometry: {
				type: 'Point',
				coordinates: [
					point.longitude,
					point.latitude
				]
			},
			properties: {}
		};

		fields.forEach(function (field) {
			if (field !== 'latitude' && field !== 'longitude') {
				feature.properties[field] = point[field];
			}
		});

		if (!tiles[key]) {
			tiles[key] = [feature];
		} else {
			tiles[key].push(feature);
		}

		most++;
	})
	.on("end", function(){
		console.log("pre-processed", most);
		console.log("bad", badData, badData.length);

		var keys = Object.keys(tiles);

		function next() {
			if (!keys.length) {
				return;
			}

			var key = keys.shift();

			var collection = {
				type: 'FeatureCollection',
				features: tiles[key]
			};

			var path = key.split('/');
			path.pop();
			var dir = path.join('/');

			fs.mkdir('incomedata/' + dir, 0777, true, function (err) {
				if(err) {
					console.log('directory error', err);
					//next();
				} else {
					fs.writeFile('incomedata/' + key + '.json', JSON.stringify(collection), function(err) {
						if(err) {
							console.log('file error', err);
						} else {
							console.log('saved', key, ' (' + keys.length + ' left)');
						}
						//setImmediate(next);
						next();
					});
				}
			});
		}

		next();
	});

stream.pipe(csvStream);