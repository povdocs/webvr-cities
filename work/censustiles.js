var shapefile = require('shapefile-stream'),
	through = require('through2'),
	simplify = require('simplify-js'),
	fs = require('fs');

var quantization = 0.001,
	hq = false,
	ZOOM = 14;

function long2tile(lon,zoom) { return (Math.floor((lon+180)/360*Math.pow(2,zoom))); }
function lat2tile(lat,zoom)	{ return (Math.floor((1-Math.log(Math.tan(lat*Math.PI/180) + 1/Math.cos(lat*Math.PI/180))/Math.PI)/2 *Math.pow(2,zoom))); }

var tiles = {},
	tileNames = [],
	count = 0;

function simplifyFeature(feature, tolerance, highQuality){
	function simpleFeature (geom, properties) {
		return {
			type: 'Feature',
			geometry: geom,
			properties: properties
		};
	}

	if(feature.geometry.type === 'LineString') {
		var line = {
			type: 'LineString',
			coordinates: []
		};
		var pts = feature.geometry.coordinates.map(function(coord) {
			return {x: coord[0], y: coord[1]};
		});
		line.coordinates = simplify(pts, tolerance, highQuality).map(function(coords){
			return [coords.x, coords.y];
		});
		
		return simpleFeature(line, feature.properties);
	}

	if(feature.geometry.type === 'Polygon') {
		var poly = {
			type: feature.geometry.type,
			coordinates: []
		};
		feature.geometry.coordinates.forEach(function(ring){
			var pts = ring.map(function(coord) {
				return {x: coord[0], y: coord[1]};
			});
			var simpleRing = simplify(pts, tolerance, highQuality).map(function(coords){
				return [coords.x, coords.y];
			});
			poly.coordinates.push(simpleRing);
		});
		return simpleFeature(poly, feature.properties)
	}

	if(feature.geometry.type === 'MultiPolygon') {
		var multiPoly = {
			type: feature.geometry.type,
			coordinates: []
		};
		feature.geometry.coordinates.forEach(function (poly) {
			var polygon = [];
			poly.forEach(function(ring){
				var pts = ring.map(function(coord) {
					return {x: coord[0], y: coord[1]};
				});
				var simpleRing = simplify(pts, tolerance, highQuality).map(function(coords){
					return [coords.x, coords.y];
				});
				polygon.push(simpleRing);
			});
			multiPoly.coordinates.push(polygon);
		});
		return simpleFeature(multiPoly, feature.properties)
	}

	console.log('unknown geometry type', feature.geometry.type);
	debugger;
}

function saveNextFile() {
	var key, features, tile;

	if (!tileNames.length) {
		console.log('all done!');
		return;
	}

	key = tileNames.shift();
	features = tiles[key];
	delete tiles[key];

	tile = {
		type: 'FeatureCollection',
		features: features
	};

	fs.writeFile('censusdata/' + key + '.json', JSON.stringify(tile), function (err) {
	  if (err) throw err;
	  
	  saveNextFile();
	});
}

// both the .shp and the .dbf files are required 
shapefile.createReadStream( 'census/Tract_2010Census_DP1.shp' )
	.pipe( shapefile.stringify )
	.pipe( through.obj( function( data, enc, next ){
		var feature = JSON.parse(data),
			latitude = parseFloat(feature.properties.INTPTLAT10),
			longitude = parseFloat(feature.properties.INTPTLON10),

			before = feature.geometry.coordinates[0].length,
			after,
			x, y,
			key;

		count++;
		if (!(count % 100)) {
			console.log(count);
		}

		try {
			feature = simplifyFeature(feature, quantization, hq);

			after = feature.geometry.coordinates[0].length;

			if (after < 4) {
				console.log(feature.properties.GEOID10, before, after);
			}

			x = long2tile(longitude, ZOOM);
			y = lat2tile(latitude, ZOOM);
			key = [ZOOM, x, y].join('-');
			if (tiles[key]) {
				tiles[key].push(feature);
			} else {
				tileNames.push(key);
				tiles[key] = [feature];
			}
		} catch (e) {
			debugger;
			console.log('error', e, before, after, feature, Object.keys(JSON.parse(data)));
			return;
		}

		// if (count >= 700) {
		// 	saveNextFile();
		// 	return;
		// }

		next();
	}, function (next) {
		//all done. now write files
		console.log('done reading shapefile');

		saveNextFile();
	}));