/* globals window, _, VIZI, THREE, operative */
(function() {
  "use strict";

/**
 * Blueprint bar chart tiles output
 * @author Brian Chirls - chirls.com.com
 */

  // output: {
  //   type: "BlueprintOutputRandomObjects",
  //   options: {
  //     grids: [{
  //       zoom: 19,
  //       tilesPerDirection: 3,
  //       cullZoom: 15
  //     },
  //     ...
  //   }
  // }

  VIZI.BlueprintOutputRandomObjects = function(options) {
    var self = this;

    VIZI.BlueprintOutput.call(self, options);

    _.defaults(self.options, {
      materialType: "MeshLambertMaterial",
      materialOptions: {},
      workerURL: "vizi-worker.min.js"
    });

    _.defaults(self.options.materialOptions, {
      color: 0xeeeeee,
      ambient: 0xffffff,
      emissive: 0xcccccc,
      shading: THREE.SmoothShading
    });

    // Triggers and actions reference
    self.triggers = [
      {name: "initialised", arguments: ["tiles"]},
      {name: "gridUpdated", arguments: ["tiles", "newTiles"]}
    ];

    self.actions = [
      {name: "outputObjectsTile", arguments: ["data", "tile"]}
    ];

    // Grids
    // {16: {
    //   grid: VIZI.BlueprintHelperTileGrid,
    //   mesh: THREE.Object3D
    // }, ...}
    self.grids = {};

    self.world;
    self.worker;
  };

  VIZI.BlueprintOutputRandomObjects.prototype = Object.create( VIZI.BlueprintOutput.prototype );

  // Initialise instance and start automated processes
  VIZI.BlueprintOutputRandomObjects.prototype.init = function() {
    var self = this;

    self.worker = operative(self.outputObjectsTileWorker, [
      self.options.workerURL
    ]);

    // Create grids
    _.each(self.options.grids, function(grid) {
      self.grids[grid.zoom] = self.createGrid(grid);
    });

    var combinedTiles = [];

    _.each(self.grids, function(gridHash) {
      combinedTiles = combinedTiles.concat(gridHash.grid.tiles);
    });

    self.emit("initialised", combinedTiles);
  };

  VIZI.BlueprintOutputRandomObjects.prototype.createGrid = function(gridOptions) {
    var self = this;

    var gridOutput = {};

    var grid = new VIZI.BlueprintHelperTileGrid(self.world, gridOptions);

    grid.on("moved", function(tiles, diff) {
      if (VIZI.DEBUG) console.log("Grid moved", tiles, diff);

      // TODO: Check whether this is enough to remove references to the old mesh
      var oldMeshes = gridOutput.meshes;
      var newTiles = [];
      gridOutput.meshes = {};
      tiles.forEach(function (tile) {
        var key = tile.x + '/' + tile.y;
        if (oldMeshes.hasOwnProperty(key)) {
          gridOutput.meshes[key] = oldMeshes[key];
          delete oldMeshes[key];
        } else {
          newTiles.push(tile);
        }
      });

      // TODO: Animate bar heights before removing them
      _.forEach(oldMeshes, function (mesh) {
        self.remove(mesh);
      });

      // Only emit update event if grid is enabled
      if (!grid.disable) {
        self.emit("gridUpdated", tiles, newTiles);
      }
    });

    grid.on("disabled", function() {
      if (VIZI.DEBUG) console.log("Grid disabled");

      _.each(gridOutput.meshes, function(mesh) {
        mesh.visible = false;
      });
    });

    // TODO: Either remove previous tiles or prevent event if grid hasn't moved
    // There's a huge hang-up when zooming in due to re-loading and processing tiles
    grid.on("enabled", function() {
      if (VIZI.DEBUG) console.log("Grid enabled");

      self.emit("gridUpdated", grid.tiles);

      // TODO: Animate bar heights when making them visible again
      _.each(gridOutput.meshes, function(mesh) {
        mesh.visible = true;
      });
    });

    var tiles = grid.init();

    if (VIZI.DEBUG) console.log("Grid initialised", tiles);

    gridOutput.grid = grid;
    gridOutput.meshes = {};

    return gridOutput;
  };

  // TODO: Cache processed tile
  // TODO: Use cached tile if available
  // TODO: Animate bar heights on load
  VIZI.BlueprintOutputRandomObjects.prototype.outputObjectsTile = function(data, tile) {
    var self = this;

    // Find grid
    var gridHash = self.grids[tile.z];
    var tileKey = tile.x + '/' + tile.y;

    if (gridHash.meshes[tileKey]) {
      // This mesh is already loaded
      return;
    }

    var materialType = self.options.materialType;
    if (!materialType || typeof THREE[materialType] !== "function") {
      materialType = "MeshLambertMaterial";
    }

    var material = new THREE[materialType](self.options.materialOptions);

    // Load data in a Web Worker
    self.worker(self.world.origin, self.world.originZoom, self.options, data).then(function(results) {
      var object = new THREE.Object3D();
      gridHash.meshes[tileKey] = object;

      results.forEach(function (result) {
        var offset = result.offset;
        var geom = new THREE.BufferGeometry();
        geom.addAttribute('position', new THREE.BufferAttribute(result.position, 3));
        geom.addAttribute('normal', new THREE.BufferAttribute(result.normal, 3));
        geom.addAttribute('uv', new THREE.BufferAttribute(result.uv, 2));

        var mat = material.clone();
        mat.color.setHSL(Math.random(), 1, 0.8);

        var mesh = new THREE.Mesh(geom, mat);

        // Use previously calculated offset to return merged mesh to correct position
        // This allows frustum culling to work correctly
        mesh.position.x = -1 * offset.x;
        mesh.position.y = -1 * offset.y;
        mesh.position.z = -1 * offset.z;

        object.add(mesh);
      });
      // TODO: Make sure coordinate space is right
      self.add(object);
    }, function(failure) {
      // ...
    });
  };

  // TODO: Is this running before the Blueprint is initialised and taking up unnecessary memory?
  // TODO: Find a better way to replicate World state (origin, origin zoom, CRS, etc) so it doesn't have to be duplicated for every Blueprint
  VIZI.BlueprintOutputRandomObjects.prototype.outputObjectsTileWorker = function(origin, originZoom, options, data) {

    function pointInPolygon(point, polygon) {
      for (var n = polygon.length, i = 0, j = n - 1, x = point[0], y = point[1], inside = false; i < n; j = i++) {
        var xi = polygon[i][0], yi = polygon[i][1],
            xj = polygon[j][0], yj = polygon[j][1];
        if ((yi > y ^ yj > y) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
      }
      return inside;
    }

    if (!data.length) {
      return;
    }
    var self = this;
    var deferred = self.deferred();

    // Set up CRS to replicate main thread
    var crs = VIZI.CRS.EPSG3857;

    // Proxy world project (normal project - world origin)
    // TODO: Find a better way so this doesn't have to be duplicated for every Blueprint
    var project = function(latLon, zoom) {
      zoom = zoom || originZoom;

      // TODO: Are there ramifications to rounding the pixels?
      var originPoint = crs.latLonToPoint(origin, zoom, {round: true});
      var projected = crs.latLonToPoint(latLon, zoom, {round: true});

      return projected.subtract(originPoint);
    };

    // Proxy world pixelPerMeter
    // TODO: Find a better way so this doesn't have to be duplicated for every Blueprint
    var pixelsPerMeter = function(latLon, zoom) {
      zoom = zoom || originZoom;
      return crs.pixelsPerMeter(latLon, zoom);
    };

    var combinedGeom = new THREE.Geometry();

    // TODO: Remove manual, hard-baked height-related stuff
    var metersPerLevel = 3;

    var maxX = -Infinity, minX = Infinity;
    var maxY = -Infinity, minY = Infinity;

    var models = [];
    var transfers = [];

    _.each(data, function(feature) {
      var model;
      var exportedGeom;

      function processAttribute(key) {
        model[key] = exportedGeom.attributes[key].array;
        transfers.push(model[key].buffer);
      }

      var polygon = [];
      if (feature.geometryType === 'Polygon') {

        // TODO: Don't manually use first set of coordinates (index 0)
        _.each(feature.coordinates[0], function(coord, index) {
          var latLon = new VIZI.LatLon(coord[1], coord[0]);
          var geoCoord = project(latLon);

          maxX = Math.max(geoCoord.x, maxX);
          minX = Math.min(geoCoord.x, minX);

          maxY = Math.max(geoCoord.y, maxY);
          minY = Math.min(geoCoord.y, minY);

          polygon.push([geoCoord.x, geoCoord.y]);
        });

      }

      if (polygon.length > 3) {
        feature.quantity.forEach(function (quantity, index) {
          //todo: get loaded geometry
          var geom = new THREE.BoxGeometry( 10, 10, 10 );

          for (var i = Math.min(5000, quantity || 0); i; i--) {
            var mesh = new THREE.Mesh(geom);
            var position = [];
            var j = 10;
            do {
              position[0] = minX + Math.random() * (maxX - minX);
              position[1] = minY + Math.random() * (maxY - minY);
              j--;
            } while (j && !pointInPolygon(position, polygon));

            mesh.position.set(position[0], 10, position[1]);
            if (mesh.matrixAutoUpdate) {
              mesh.updateMatrix();
            }
            combinedGeom.merge(mesh.geometry, mesh.matrix);

            if (i % 100 === 1) {
              // Move merged geom to 0,0 and return offset
              var offset = combinedGeom.center();

              //TODO: save a more compact model using indices. Requires replacing fromGeometry with custom code
              exportedGeom = new THREE.BufferGeometry();
              exportedGeom.fromGeometry(combinedGeom);

              // Store geom typed array as Three.js model object
              model = {
                offset: offset,
                material: index
              };
              models.push(model);

              exportedGeom.attributesKeys.forEach(processAttribute);
            }
          }
        });
      }

    });

    if (models.length) {
      deferred.transferResolve(models, transfers);
    }
  };

  VIZI.BlueprintOutputRandomObjects.prototype.onAdd = function(world) {
    var self = this;
    self.world = world;
    self.init();
  };
}());