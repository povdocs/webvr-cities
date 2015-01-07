/* globals window, _, VIZI, THREE, operative */
(function() {
  "use strict";

  var precision = 10000;

  var snowShader = {
    uniforms: {
      texture:  { type: "t", value: null },
      globalTime: { type: "f", value: 0.0 },
      size: { type: "f", value: 1.5 }, //????
      range: { type: "3f", value: [50, 50, 50] },
      screenHeight: { type: "f", value: 1080 },
      population: { type: "1fv", value: [1 / 5, 2 / 5, 3 / 5, 4 / 5, 5 / 5] }
    },
    vertexShader: [
      'uniform float globalTime;',
      'uniform float size;',
      'uniform float screenHeight;',
      'uniform vec3 range;',
      'uniform float population[5];',

      'attribute float popindex;',

      'varying vec4 vColor;',

      'const vec4 zero = vec4(0.0, 0.0, 0.0, 1.0);',

      'void main() {',

      // Colors hard-coded for now. Could be loaded in a uniform array
      ' if (popindex < population[0]) {',
          //white
      '   vColor = vec4(0.45, 0.698, 1.0, 1.0);',
      ' } else if (popindex < population[1]) {',
          //black
      '   vColor = vec4(0.33, 1.0, 0.0, 1.0);',
      ' } else if (popindex < population[2]) {',
          //asian
      '   vColor = vec4(1.0, 0.0, 0.0, 1.0);',
      ' } else if (popindex < population[3]) {',
          //hispanic
      '   vColor = vec4(1.0, 0.66, 0.0, 1.0);',
      ' } else if (popindex < population[4]) {',
          //other/native american/multi-racial
      '   vColor = vec4(0.53, 0.353, 0.27, 1.0);',
      ' } else {',
          //nobody
      '   vColor = vec4(0.0, 0.0, 0.0, 0.0);',
      '   gl_PointSize = 0.0;',
      '   return;',
      ' }',

      ' float maxSize = size * screenHeight * length(range.xy) / 1000.0;',

      ' vec3 pos = position;',

        // time
      ' float localTime = length(position) + globalTime;',
      ' float modTime = mod( localTime, 1.0 );',

      ' pos.x += cos(modTime*8.0 + position.z) * 0.02 * range.x;',
      ' pos.y += cos(modTime*5.0 + position.y) * 0.02 * range.y;',
      ' pos.z += sin(modTime*6.0 + position.x) * 0.02 * range.z;',

      ' vec4 mPosition = modelMatrix * vec4( pos, 1.0 );',

      // offset pos by world position and then mod by range so particles repeat forever
      // then set back to world position
      ' vec4 offset = modelMatrix * zero;',
      ' mPosition.xz = mod(pos.xz + range.xz / 2.0 - offset.xz, range.xz) - range.xz / 2.0 + offset.xz;',

      ' gl_Position = projectionMatrix * viewMatrix * mPosition;',

      ' gl_PointSize = maxSize / gl_Position.z;',
      '}'
    ].join("\n"),
    fragmentShader: [
      'uniform sampler2D texture;',

      'varying vec4 vColor;',

      'void main() {',

      ' vec4 pixel = texture2D( texture, gl_PointCoord );',
      ' gl_FragColor = vColor * vec4(1.0, 1.0, 1.0, pixel.r);',

      '}'
    ].join("\n")
  };

/**
 * Blueprint bar chart tiles output
 * @author Brian Chirls - chirls.com.com
 */

  // output: {
  //   type: "BlueprintOutputParticleTiles",
  //   options: {
  //     grids: [{
  //       zoom: 19,
  //       tilesPerDirection: 3,
  //       cullZoom: 15
  //     },
  //     ...
  //   }
  // }
  VIZI.BlueprintOutputParticleTiles = function(options) {
    var self = this;

    VIZI.BlueprintOutput.call(self, options);

    _.defaults(self.options, {
      maxDensity: 0.06,
      minDensity: 0.002,
      timeScale: 0.00004
    });

    // Triggers and actions reference
    self.triggers = [
      {name: "initialised", arguments: ["tiles"]},
      {name: "gridUpdated", arguments: ["tiles", "newTiles"]}
    ];

    self.actions = [
      {name: "outputParticleTile", arguments: ["data", "tile"]}
    ];

    self.grids = {};

    self.world = null;
  };

  VIZI.BlueprintOutputParticleTiles.prototype = Object.create( VIZI.BlueprintOutput.prototype );

  // Initialise instance and start automated processes
  VIZI.BlueprintOutputParticleTiles.prototype.init = function() {
    var self = this;
    var options = self.options;
    var grid = self.options.grids[0];

    // Create grid (only one for now)
    self.grid = self.grids[grid.zoom] = self.createGrid(grid);

    // var combinedTiles = [];
    // _.each(self.grids, function(gridHash) {
    //   combinedTiles = combinedTiles.concat(gridHash.grid.tiles);
    // });

    var uniforms = THREE.UniformsUtils.clone( snowShader.uniforms );

    var shaderMaterial = new THREE.ShaderMaterial( {
      uniforms:     uniforms,
      attributes:     {
        popindex: { type: 'f', value: 0 },
      },
      vertexShader:   snowShader.vertexShader,
      fragmentShader: snowShader.fragmentShader,

      //blending:     THREE.AdditiveBlending,
      depthTest:    false,
      transparent:  true
    });

    var count = options.count || 10000;
    // var minSize = options.minSize || 50;
    // var sizeRange = (options.maxSize || 80) - minSize;
    var range = options.range || [100, 50, 100];

    uniforms.range.value = range;
    uniforms.texture.value = THREE.ImageUtils.loadTexture( options.texture ); //todo: throw error if missing. or maybe a default?

    var geometry = new THREE.BufferGeometry();
    var vertices = [];
    var indices = [];

    for ( var i = 0; i < count; i++ ) {
      vertices.push(
        Math.random() * range[0] - range[0] / 2,
        Math.random() * range[1] - range[1] / 2,
        Math.random() * range[2] - range[2] / 2
      );
      indices.push(i / count); //todo: can we be more efficient than this?
    }

    geometry.addAttribute( 'position',
      new THREE.BufferAttribute( new Float32Array( vertices ), 3 )
    );

    geometry.addAttribute( 'popindex',
      new THREE.BufferAttribute( new Float32Array( indices ), 1 )
    );

    var particles = new THREE.PointCloud( geometry, shaderMaterial );

    particles.renderDepth = -100;

    self.particles = particles;
    particles.name = 'particles';
    self.object.add(particles);

    self.uniforms = uniforms;
    self.voronoi = new Voronoi();
    self.diagram = null;
    self.treemap = null;
    self.position = self.world.unproject(new VIZI.Point(0, 0));
    self.lastLocationId = null;

    VIZI.Messenger.on('controls:move', function (point) {
      self.position = self.world.unproject(point);

      //console.log('moved to point', self.position);

      self.updatePosition(self.position);
    });

    self.emit("initialised", self.grids[grid.zoom].grid.tiles);
  };

  VIZI.BlueprintOutputParticleTiles.prototype.onTick = function(delta) {
    this.uniforms.globalTime.value += delta * this.options.timeScale;
  };

  VIZI.BlueprintOutputParticleTiles.prototype.createGrid = function(gridOptions) {
    var self = this;

    var gridOutput = {};

    var grid = new VIZI.BlueprintHelperTileGrid(self.world, gridOptions);

    grid.on("moved", function(tiles, diff) {
      if (VIZI.DEBUG) console.log("Grid moved", tiles, diff);

      var oldTilePoints = gridOutput.tilePoints;
      var newTiles = [];

      gridOutput.tilePoints = {};
      gridOutput.points.length = 0;

      tiles.forEach(function (tile) {
        var key = tile.x + '/' + tile.y;

        if (oldTilePoints.hasOwnProperty(key)) {

          gridOutput.tilePoints[key] = oldTilePoints[key];
          gridOutput.points.push.apply(gridOutput.points, oldTilePoints[key].points);

          delete oldTilePoints[key]; //todo: unnecessary?

        } else {

          newTiles.push(tile);

        }
      });

      gridOutput.bounding = gridOutput.points.reduce(function (bbox, point) {
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

      //todo: unnecessary?
      // _.forEach(oldTilePoints, function (data) {
      //   //todo: remove
      // });

      // Only emit update event if grid is enabled
      if (!grid.disable) {
        self.updateVoronoi();
        self.emit("gridUpdated", tiles, newTiles);
      }
    });

    /*
    grid.on("disabled", function() {
      if (VIZI.DEBUG) console.log("Grid disabled");

      _.each(gridOutput.data, function(data) {
        //todo mesh.visible = false;
      });
    });
    */

    // TODO: Either remove previous tiles or prevent event if grid hasn't moved
    // There's a huge hang-up when zooming in due to re-loading and processing tiles
    grid.on("enabled", function() {
      if (VIZI.DEBUG) console.log("Grid enabled");

      self.updateVoronoi();
      self.emit("gridUpdated", grid.tiles);

      /*
      // TODO: Animate bar heights when making them visible again
      _.each(gridOutput.data, function(mesh) {
        //todo mesh.visible = true;
      });
      */
    });

    var tiles = grid.init();

    if (VIZI.DEBUG) console.log("Grid initialised", tiles);

    gridOutput.grid = grid;
    gridOutput.tilePoints = {};
    gridOutput.points = [];
    gridOutput.bounding = {
      xl: Infinity,
      xr: -Infinity,
      yt: Infinity,
      yb: -Infinity
    };

    return gridOutput;
  };

  VIZI.BlueprintOutputParticleTiles.prototype.updateVoronoi = function() {
    var self = this,
      bbox = this.grid.bounding,
      points = this.grid.points;

    if (!points) {
      return;
    }

    this.diagram = this.voronoi.compute(points, bbox);

    this.treemap = new QuadTree({
      x: bbox.xl,
      y: bbox.yt,
      width: bbox.xr - bbox.xl,
      height: bbox.yb - bbox.yt
    });

    //todo: add all cells from diagram to treemap
    this.diagram.cells.forEach(function (cell) {
      var leaf = cell.getBbox();
      leaf.cell = cell;
      self.treemap.insert(leaf);
    });

    this.updatePosition(this.position);
  };

  VIZI.BlueprintOutputParticleTiles.prototype.updatePosition = function() {
    if (!this.grid.points.length) {
      //clear everything
      if (this.lastLocationId) {
        this.lastLocationId = '';
        this.uniforms.population.value.forEach(function (v, i, a) {
          a[i] = 0;
        });
      }
      return;
    }

    var self = this,
        x = this.position.lon * precision,
        y = this.position.lat * precision,
        items = this.treemap.retrieve({
          x: x,
          y: y
        }),
        cells = this.diagram.cells,
        i, item, j,
        cum = 0,
        max, densityScale = 1;

      for (i = items.length - 1; i >= 0; i--) {
        item = items[i];
        if (item.cell.pointIntersection(x, y) > 0) {
          if (self.lastLocationId !== item.cell.site.id || !item.cell.site.id) {

            self.lastLocationId = item.cell.site.id;

            // set shader values based on this data
            max = Math.max(self.options.maxDensity * item.cell.site.area, item.cell.site.total);
            densityScale = Math.max(1, self.options.minDensity / (item.cell.site.total / item.cell.site.area));
            for (j = 0; j < 7; j++) {
              cum += item.cell.site.data[j] * densityScale / max;
              self.uniforms.population.value[j] = cum;
            }

            //console.log(item.cell.site.id, item.cell.site.data, self.uniforms.population.value);
          }
          break;
        }
      }
  };

  // TODO: Cache processed tile
  // TODO: Use cached tile if available
  // TODO: Animate bar heights on load
  VIZI.BlueprintOutputParticleTiles.prototype.outputParticleTile = function(features, tile) {
    var self = this;

    // Find grid
    var gridHash = self.grids[tile.z];
    var tileKey = tile.x + '/' + tile.y;
    var tilePoints;

    if (gridHash.tilePoints[tileKey]) {
      // This mesh is already loaded
      return;
    }

    tilePoints = features.map(function (point) {
      var data = point.population.slice(0);
      data.push(Math.max(0, point.total - data.reduce(function sum(prev, current) {
        return prev + current;
      })));
      return {
        x: point.coordinates[0] * precision,
        y: point.coordinates[1] * precision,
        data: data,
        area: point.area,
        total: point.total,
        id: point.id
      };
    });

    gridHash.tilePoints[tileKey] = {
      features: features,
      points: tilePoints
    };
    gridHash.points.push.apply(gridHash.points, tilePoints);
    gridHash.bounding = gridHash.points.reduce(function (bbox, point) {
      return {
        xl: Math.min(bbox.xl, point.x - 10),
        xr: Math.max(bbox.xr, point.x + 10),

        yt: Math.min(bbox.yt, point.y - 10),
        yb: Math.max(bbox.yb, point.y + 10)
      };
    }, gridHash.bounding);

    self.updateVoronoi();
  };

  VIZI.BlueprintOutputParticleTiles.prototype.onAdd = function(world) {
    var self = this;
    self.world = world;
    self.init();
  };
}());