// ISO31662A2(State),FIPS 5-2(State),ShortName(County),FIPS 6-4(County),ADM2,Latitude,Longitude
var fullShapes = false;

var csv = require('fast-csv'),
	fs = require('node-fs'),
	Voronoi = require('../js/lib/rhill-voronoi-core'),
	d3 = require('d3-geo');

//console.log(Voronoi);

var quantization = 0.001,
	hq = false,
	precision = 10000,
	ZOOM = 14;

function long2tile(lon,zoom) { return (Math.floor((lon+180)/360*Math.pow(2,zoom))); }
function lat2tile(lat,zoom)	{ return (Math.floor((1-Math.log(Math.tan(lat*Math.PI/180) + 1/Math.cos(lat*Math.PI/180))/Math.PI)/2 *Math.pow(2,zoom))); }

var tiles = {},
	allCounties = {},
	tileNames = [],
	count = 0;

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
		features: []
	};

	tile.features = features.list.map(function (county) {
		console.log('saving', county.feature.properties.county, county.feature.properties.state);
		return county.feature;
	});

	var path = key.split('/');
	path.pop();
	var dir = path.join('/');

	fs.mkdir('scratch/animaldata/' + dir, 0777, true, function (err) {
		if(err) {
			console.log('directory error', err);
			//next();
		} else {

			fs.writeFile('scratch/animaldata/' + key + '.json', JSON.stringify(tile), function (err) {
				if (err) {
					console.log(err, err.stack);
					throw err;
				}

				saveNextFile();
			});

		}
	});
}

var countyStream = fs.createReadStream('statecounty.csv');
var animalStream = fs.createReadStream('animals.csv');

var bbox = {
	xl: Infinity,
	xr: -Infinity,
	yt: Infinity,
	yb: -Infinity
},
points = [],
geoPath = d3.geo.path()
	.projection(d3.geo.orthographic().scale(3660).rotate([-3,-46.35])
		.clipExtent([[0,0], [720, 640]]).translate([720/2,640/2]));

var countyCsv = csv
	.parse({ headers: true })
	.on("data", function(county) {
		var key = county.stateansi + '/' + county.countyansi;

		county.latitude = parseFloat(county.latitude);
		county.longitude = parseFloat(county.longitude);

		//console.log('county', key, county);

		var point = {
			x: county.longitude * precision,
			y: county.latitude * precision,
			data: county,
			id: key
		};

		points.push(point);

		bbox = {
			xl: Math.min(bbox.xl, point.x - 10),
			xr: Math.max(bbox.xr, point.x + 10),

			yt: Math.min(bbox.yt, point.y - 10),
			yb: Math.max(bbox.yb, point.y + 10)
		};
	})
	.on("end", function() {
		//return;
		var voronoi = new Voronoi();
		var diagram = voronoi.compute(points, bbox);

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

			lat = cell.site.data.latitude;
			lon = cell.site.data.longitude;

			x = long2tile(lon, ZOOM);
			y = lat2tile(lat, ZOOM);
			key = [ZOOM, x, y].join('/');

			tile = tiles[key];
			if (!tile) {
				tiles[key] = tile = {
					hash: {},
					list: [],
					requested: false,
					object: null
				};
				tileNames.push(key);
			}

			cell.feature = {
				type: 'Feature',
				geometry: {
					type: 'Polygon',
					coordinates: null
				},
				properties: cell.site.data
			};

			cell.feature.geometry.coordinates = [cell.halfedges.map(function (halfedge) {
				//console.log(halfedge.getStartpoint(), halfedge.getEndpoint())
				var v = halfedge.getStartpoint();
				return [
					v.x / precision,
					v.y / precision
				];
			})];
			cell.feature.geometry.coordinates[0].push(cell.feature.geometry.coordinates[0][0].slice());

			cell.feature.properties.area = d3.geo.area(cell.feature) / 12.56637 * 510072000;

			allCounties[cell.site.id] = cell.feature;

			//console.log(JSON.stringify(cell.feature, null, 2));
			// console.log('path area', cell.feature.properties.county, cell.feature.properties.state, d3.geo.area(cell.feature) / 12.56637 * 510072000);
			//process.exit();

			tile.hash[cell.site.id] = cell;
			tile.list.push(cell);
		});

		var commas = /,/g;
		var animalCsv = csv.parse({ headers: true })
			.on('data', function (animal) {
				//console.log(animal);

				var key = animal['State ANSI'] + '/' + animal['County ANSI'];
				var feature = allCounties[key];
				var commodity = animal.Commodity.toLowerCase();

				if (feature) {
					feature.properties[commodity] = (feature.properties[commodity] || 0) + (parseFloat(animal.Value.replace(commas, '')) || 0);
					//console.log(feature);
					//process.exit();
				}
			})
			.on('end', function () {
				saveNextFile();
			});

		animalStream.pipe(animalCsv);
	});
countyStream.pipe(countyCsv);
