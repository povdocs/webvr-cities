/* globals window, _, VIZI, THREE */
(function() {
  "use strict";

/**
 * Blueprint debug points output
 * @author Robin Hawkes - vizicities.com
 */  

  // output: {
  //   type: "BlueprintOutputBars",
  //   options: {}
  // }
  VIZI.BlueprintOutputBars = function(options) {
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
      {name: "initialised", arguments: []}
    ];

    self.actions = [
      {name: "outputBars", arguments: ["data"]}
    ];

    self.world;
  };

  VIZI.BlueprintOutputBars.prototype = Object.create( VIZI.BlueprintOutput.prototype );

  // Initialise instance and start automated processes
  VIZI.BlueprintOutputBars.prototype.init = function() {
    var self = this;

    self.worker = operative(self.outputBarWorker, [
      self.options.workerURL
    ]);

    self.emit("initialised");
  };

  // {
  //   coordinates: [lon, lat]
  // }
  VIZI.BlueprintOutputBars.prototype.outputBars = function(data) {
    var self = this;

    var materialType = self.options.materialType;
    if (!materialType || typeof THREE[materialType] !== "function") {
      materialType = "MeshLambertMaterial";
    }

    var material = new THREE[materialType](self.options.materialOptions);

    // Load data in a Web Worker
    self.worker(self.world.origin, self.world.originZoom, self.options, data).then(function(result) {
      var offset = result.offset;
      var geom = new THREE.BufferGeometry();
      geom.addAttribute('position', new THREE.BufferAttribute(result.position, 3));
      geom.addAttribute('normal', new THREE.BufferAttribute(result.normal, 3));
      geom.addAttribute('uv', new THREE.BufferAttribute(result.uv, 2));

      var mesh = new THREE.Mesh(geom, material);

      // Use previously calculated offset to return merged mesh to correct position
      // This allows frustum culling to work correctly
      mesh.position.x = -1 * offset.x;
      mesh.position.y = -1 * offset.y;
      mesh.position.z = -1 * offset.z;

      self.mesh = mesh;

      // TODO: Make sure coordinate space is right
      self.add(mesh);
    }, function(failure) {
      // ...
    });
  };

  VIZI.BlueprintOutputBars.prototype.outputBarWorker = function(origin, originZoom, options, data) {
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

    _.each(data, function(feature) {
      var shape;
      var geom;

      // TODO: Don't have random height logic in here
      var scaleHeight = options.scaleHeight || 1;
      var height = (feature.height) ? feature.height : options.height || 1;
      height *= scaleHeight;
      height += Math.random(); //to avoid z-fighting

      if (feature.geometryType === 'Point' || !feature.geometryType) {
        var radius = feature.radius || options.radius || 5;
        radius *= (options.scaleRadius || 1);
        radius += Math.random() / 4; //to avoid z-fighting

        var latLon = new VIZI.LatLon(feature.coordinates[1], feature.coordinates[0]);
        var geoCoord = project(latLon);

        if (options.shape === 'sphere') {
          geom = new THREE.SphereGeometry(height, 16, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI);
          geom.applyMatrix(new THREE.Matrix4().makeRotationX(Math.PI / 2));
          geom.applyMatrix(new THREE.Matrix4().makeTranslation(geoCoord.x, geoCoord.y, height));
        } else {
          shape = new THREE.Shape();
          shape.absarc(geoCoord.x, geoCoord.y, radius, 0, Math.PI * 2, false);
        }
      } else if (feature.geometryType === 'Polygon') {
        var offset = new VIZI.Point();
        shape = new THREE.Shape();

        // TODO: Don't manually use first set of coordinates (index 0)
        _.each(feature.coordinates[0], function(coord, index) {
          var latLon = new VIZI.LatLon(coord[1], coord[0]);
          var geoCoord = project(latLon);

          if (!offset.length === 0) {
            offset.x = -1 * geoCoord.x;
            offset.y = -1 * geoCoord.y;
          }

          // Move if first coordinate
          if (index === 0) {
            shape.moveTo( geoCoord.x + offset.x, geoCoord.y + offset.y );
          } else {
            shape.lineTo( geoCoord.x + offset.x, geoCoord.y + offset.y );
          }
        });

      }

      if (shape && !geom) {
        var minHeight = (feature.minHeight) ? feature.minHeight : 0;
        minHeight *= scaleHeight;

        var extrudeSettings = {
          curveSegments: 8,
          amount: height - minHeight,
          bevelEnabled: false
        };

        geom = new THREE.ExtrudeGeometry( shape, extrudeSettings );
        geom.computeFaceNormals();

        if (!minHeight && !options.preserveGroundFaces) {
          // Remove down-facing floor faces
          for (var i = geom.faces.length - 1; i >= 0; i--) {
            if (Math.abs(geom.faces[i].normal.z - 1) < Number.EPSILON) {
              geom.faces.splice(i, 1);
              geom.faceVertexUvs[0].splice(i, 1);
            }
          }
        }
      }

      var mesh = new THREE.Mesh(geom);

      mesh.position.y = height;

      // Offset
      if (offset) {
        mesh.position.x = -1 * offset.x;
        mesh.position.z = -1 * offset.y;
      }

      // Flip as they are up-side down
      mesh.rotation.x = 90 * Math.PI / 180;

      if (mesh.matrixAutoUpdate) {
        mesh.updateMatrix();
      }
      combinedGeom.merge(mesh.geometry, mesh.matrix);
    });

    // Move merged geom to 0,0 and return offset
    var offset = combinedGeom.center();

    //TODO: save a more compact model using indices. Requires replacing fromGeometry with custom code
    var exportedGeom = new THREE.BufferGeometry();
    exportedGeom.fromGeometry(combinedGeom);

    // Store geom typed array as Three.js model object
    var model = {
      offset: offset
    };

    var transfers = [];
    exportedGeom.attributesKeys.forEach(function (key) {
      model[key] = exportedGeom.attributes[key].array;
      transfers.push(model[key].buffer);
    });

    deferred.transferResolve(model, transfers);
  };

  VIZI.BlueprintOutputBars.prototype.onAdd = function(world) {
    var self = this;
    self.world = world;
    self.init();
  };
}());