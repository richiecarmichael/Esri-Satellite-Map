/* -----------------------------------------------------------------------------------
   Developed by the Applications Prototype Lab
   (c) 2015 Esri | http://www.esri.com/legal/software-license  
----------------------------------------------------------------------------------- */

require([
    'esri/Map',
    'esri/Camera',
    'esri/core/Scheduler',
    'esri/views/SceneView',
    'esri/geometry/Point',
    'esri/geometry/SpatialReference',
    'dojo/domReady!'
],
function (
    Map,
    Camera,
    Scheduler,
    SceneView,
    Point,
    SpatialReference
    ) {
    $(document).ready(function () {
        // Enforce strict mode
        'use strict';

        // jQuery formating function
        $.format = function (f, e) {
            $.each(e, function (i) {
                f = f.replace(new RegExp('\\{' + i + '\\}', 'gm'), this);
            });
            return f;
        };

        // Well known satellite constellations.
        var GPS          = [20959, 22877, 23953, 24876, 25933, 26360, 26407, 26605, 26690, 27663, 27704, 28129, 28190, 28361, 28474, 28874, 29486, 29601, 32260, 32384, 32711, 35752, 36585, 37753, 38833, 39166, 39533, 39741, 40105, 40294, 40534];
        var GLONASS      = [28915, 29672, 29670, 29671, 32276, 32275, 32393, 32395, 36111, 36112, 36113, 36400, 36402, 36401, 37139, 37138, 37137, 37829, 37869, 37867, 37868, 39155, 39620, 40001];
        var INMARSAT     = [20918, 21149, 21814, 21940, 23839, 24307, 24674, 24819, 25153, 28628, 28899, 33278, 40384, 39476];
        var LANDSAT      = [25682, 39084];
        var DIGITALGLOBE = [25919, 32060, 33331, 35946, 40115];

        // Orbital altitude definitions
        var LOW_ORBIT = 2000;
        var GEOSYNCHRONOUS_ORBIT = 35786;
        var TRAJECTORY_SEGMENTS = 1000;

        // Satellite database urls
        var NASA_SATELLITE_DATABASE = 'http://nssdc.gsfc.nasa.gov/nmc/masterCatalog.do?sc={0}'; // use International id
        var N2YO_SATELLITE_DATABASE = 'http://www.n2yo.com/satellite/?s={0}';                   // use NORAD id

        // Rendering variables
        var _gl = null;
        var _camera = null;
        var _shader = null;
        var _positionBuffer = null;
        var _colorBuffer = null;
        var _sizeBuffer = null;
        var _positionLineBuffer = null;
        var _colorLineBuffer = null;
        var _sizeLineBuffer = null;       
        var _selectedSatellite = null;

        // The array of all upload satellites
        var _satellites = [];

        // Create map and view
        var _view = new SceneView({
            container: 'map',
            ui: {
                components: [
                    'zoom',
                    'compass'
                ]
            },
            map: new Map({
                basemap: 'satellite'
            }),
            constraints: {
                altitude: {
                    max: 12000000000
                }
            }
        });
        _view.then(function () {
            // Set initial camera position
            _view.set('camera', Camera.fromJSON({
                'position': {
                    'x': -1308000,
                    'y': 2670000,
                    'spatialReference': {
                        'wkid': 102100,
                        'latestWkid': 3857
                    },
                    'z': 110000000
                },
                'heading': 0,
                'tilt': 0,
                'fov': 55
            }));

            // Increase far clipping plane
            _view.constraints.clipDistance.far *= 2;

            // Disable idle frame refreshes
            _view._stage.setRenderParams({
                idleSuspend: false
            });

            // Get webgl context and create shader
            _gl = _view.canvas.getContext('experimental-webgl');

            // Get a refernce to the Esri camera
            _camera = _view._stage.getCamera();

            // Load shaders
            loadShaders();

            // Load satellites
            loadSatellites().done(function () {
                //initBuffer();
                updateBuffers();
                loadMetadata().done(function (metadata) {
                    $.each(_satellites, function () {
                        this.metadata = metadata[this.id];
                    });
                    updateCounter();
                });

                // Add custom renderer
                Scheduler.addFrameTask({
                    postRender: postRender
                });
            });
        });
        _view.on('click', function (e) {
            // Exit if invalid or missing map point
            if (!e || !e.screenPoint) { return; }

            // Find satellites close to screen coordinates
            var locations = [];
            var camera = _view._stage.getCamera();
            $.each(_satellites, function () {
                var screenPoint = [0, 0, 0];
                camera.projectPoint(this.world, screenPoint);
                var x = screenPoint[0];
                var y = screenPoint[1];

                // 
                var pythagoras = Math.sqrt(
                    Math.pow(e.screenPoint.x - x, 2) +
                    Math.pow(e.screenPoint.y - y, 2)
                );
                if (pythagoras <= 5) {
                    locations.push(this);
                }
                this.highlighted = false;
            });
            if (locations.length === 0) {
                _selectedSatellite = null;
                hideTrajectory();
                showDialog('main');
                updateBuffers();
                return;
            }
            var location = null;
            if (locations.length === 1) {
                _selectedSatellite = null;
                hideTrajectory();
                location = locations[0];
            } else {
                var point = _view.get('camera').position;
                var result = new Float32Array(3);
                _view.coordinateSystemHelper.pointToEnginePosition(point, result);
                $.each(locations, function () {
                    this.distanceToCamera = Math.sqrt(
                        Math.pow(this.world[0] - result[0], 2) +
                        Math.pow(this.world[1] - result[1], 2) +
                        Math.pow(this.world[2] - result[2], 2)
                    );
                });
                locations.sort(function (a, b) {
                    return a.distanceToCamera - b.distanceToCamera;
                });
                location = locations[0];
            }
            location.highlighted = true;
            _selectedSatellite = location;

            $('#infoWindow-title').html(_selectedSatellite.metadata.name);
            $('#infoWindow-norad').html(_selectedSatellite.id);
            $('#infoWindow-int').html(_selectedSatellite.metadata.int);
            $('#infoWindow-name').html(_selectedSatellite.metadata.name);
            $('#infoWindow-country').html(_selectedSatellite.metadata.country);
            $('#infoWindow-period').html(_selectedSatellite.metadata.period + ' min');
            $('#infoWindow-inclination').html(_selectedSatellite.metadata.inclination + '°');
            $('#infoWindow-apogee').html(_selectedSatellite.metadata.apogee + ' km');
            $('#infoWindow-perigee').html(_selectedSatellite.metadata.perigee + ' km');
            $('#infoWindow-size').html(_selectedSatellite.metadata.size);
            $('#infoWindow-launch').html(_selectedSatellite.metadata.launch);
            $('#link-nasa').attr('href', $.format(NASA_SATELLITE_DATABASE, [_selectedSatellite.metadata.int]));
            $('#link-n2yo').attr('href', $.format(N2YO_SATELLITE_DATABASE, [_selectedSatellite.id]));

            showDialog('info');
            showTrajectory();
            updateBuffers();
        });

        $('#bottom-left-help a').attr('target', '_blank');
        $('#bottom-left-about a').attr('target', '_blank');
        $('#link-nasa, #link-n2yo').attr('target', '_blank');

        $('#buttonCloseWindow').click(function () {
            $.each(_satellites, function () {
                this.highlighted = false;
            });
            _selectedSatellite = null;
            hideTrajectory();
            showDialog('main');
            updateBuffers();
        });

        $('#button-help').click(function () {
            showDialog('help');
        });

        $('#button-about').click(function () {
            showDialog('about');
        });

        $('#buttonTrajectory > button').click(function () {
            $(this).addClass('active').siblings('.active').removeClass('active');
            $('#buttonCountry2 > button.active').removeClass('active');
            showTrajectory();
        });
        
        // Enable bootstrap tooltips
        $('[data-toggle="tooltip"]').tooltip();

        // Handle quick link presets
        $('#dropdown-presets > li > a').click(function () {
            resetUI();
            switch ($(this).attr('data-value')) {
                case 'american-satellites':
                    $('#buttonCountry1 > button, #buttonCountry2 > button').removeClass('active');
                    $('#buttonCountry2 > button[data-value="US"]').addClass('active');
                    selectSatellites();
                    break;
                case 'chinese-satellites':
                    $('#buttonCountry1 > button, #buttonCountry2 > button').removeClass('active');
                    $('#buttonCountry1 > button[data-value="PRC"]').addClass('active');
                    selectSatellites();
                    break;
                case 'russian-satellites':
                    $('#buttonCountry1 > button, #buttonCountry2 > button').removeClass('active');
                    $('#buttonCountry2 > button[data-value="CIS"]').addClass('active');
                    selectSatellites();
                    break;
                case 'gps':
                    $.each(_satellites, function () {
                        this.selected = GPS.indexOf(this.id) !== -1;
                    });
                    break;
                case 'glonass':
                    $.each(_satellites, function () {
                        this.selected = GLONASS.indexOf(this.id) !== -1;
                    });
                    break;
                case 'inmarsat':
                    $.each(_satellites, function () {
                        this.selected = INMARSAT.indexOf(this.id) !== -1;
                    });
                    break;
                case 'landsat':
                    $.each(_satellites, function () {
                        this.selected = LANDSAT.indexOf(this.id) !== -1;
                    });
                    break;
                case 'digitalglobe':
                    $.each(_satellites, function () {
                        this.selected = DIGITALGLOBE.indexOf(this.id) !== -1;
                    });
                    break;
                case 'low-earth-orbit':
                    $('#slider-apogee').slider('setValue', [
                        $('#slider-apogee').slider('getAttribute', 'min'),
                        LOW_ORBIT
                    ]);
                    $('#slider-perigee').slider('setValue', [
                        $('#slider-perigee').slider('getAttribute', 'min'),
                        LOW_ORBIT
                    ]);
                    selectSatellites();
                    break;
                case 'medium-earth-orbit':
                    $('#slider-apogee').slider('setValue', [LOW_ORBIT, GEOSYNCHRONOUS_ORBIT]);
                    $('#slider-perigee').slider('setValue', [LOW_ORBIT, GEOSYNCHRONOUS_ORBIT]);
                    selectSatellites();
                    break;
                case 'geosynchronous-orbit':
                    $('#slider-apogee').slider('setValue', [GEOSYNCHRONOUS_ORBIT * 0.98, GEOSYNCHRONOUS_ORBIT * 1.02]);
                    $('#slider-perigee').slider('setValue', [GEOSYNCHRONOUS_ORBIT * 0.98, GEOSYNCHRONOUS_ORBIT * 1.02]);
                    selectSatellites();
                    break;
                case 'geostationary-orbit':
                    $('#slider-apogee').slider('setValue', [GEOSYNCHRONOUS_ORBIT * 0.98, GEOSYNCHRONOUS_ORBIT * 1.02]);
                    $('#slider-perigee').slider('setValue', [GEOSYNCHRONOUS_ORBIT * 0.98, GEOSYNCHRONOUS_ORBIT * 1.02]);
                    $('#slider-inclination').slider('setValue', [0, 1]);
                    selectSatellites();
                    break;
                case 'high-earth-orbit':
                    $('#slider-apogee').slider('setValue', [
                        GEOSYNCHRONOUS_ORBIT * 1.02,
                        $('#slider-apogee').slider('getAttribute', 'max')
                    ]);
                    $('#slider-perigee').slider('setValue', [
                        GEOSYNCHRONOUS_ORBIT * 1.02,
                        $('#slider-perigee').slider('getAttribute', 'max')
                    ]);
                    selectSatellites();
                    break;
                case 'reset-all':
                    selectSatellites();
                    break;
            }
            updateBuffers();
            updateCounter();
        });

        // Country
        $('#buttonCountry1 > button').click(function () {
            $(this).addClass('active').siblings('.active').removeClass('active');
            $('#buttonCountry2 > button.active').removeClass('active');
            selectSatellites();
            updateBuffers();
            updateCounter();
        });
        $('#buttonCountry2 > button').click(function () {
            $(this).addClass('active').siblings('.active').removeClass('active');
            $('#buttonCountry1 > button.active').removeClass('active');
            selectSatellites();
            updateBuffers();
            updateCounter();
        });

        // Type or Size
        $('#buttonType > button, #buttonSize > button').click(function () {
            $(this).addClass('active').siblings('.active').removeClass('active');
            selectSatellites();
            updateBuffers();
            updateCounter();
        });

        // Initialize sliders
        $('#slider-launchdate').slider({
            id: 'slider-launchdate-internal',
            ticks: [1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020],
            ticks_labels: ['\'50', '\'60', '\'70', '\'80', '\'90', '\'00', '\'10', '\'20'],
            range: true,
            value: [1950, 2020]
        }).slider().on('slideStop', function () {
            selectSatellites();
            updateBuffers();
            updateCounter();
        });
        $('#slider-period').slider({
            id: 'slider-period-internal',
            ticks: [0, 100, 200, 1000, 10000, 60000],
            ticks_positions: [0, 20, 40, 60, 80, 100],
            ticks_labels: ['0', '100', '200', '1K', '10K', '60K'],
            range: true,
            value: [0, 60000]
        }).slider().on('slideStop', function () {
            selectSatellites();
            updateBuffers();
            updateCounter();
        });
        $('#slider-inclination').slider({
            id: 'slider-inclination-internal',
            ticks: [0, 30, 60, 90, 120, 150],
            ticks_positions: [0, 20, 40, 60, 80, 100],
            ticks_labels: ['0°', '30°', '60°', '90°', '120°', '150°'],
            range: true,
            value: [0, 150]
        }).slider().on('slideStop', function () {
            selectSatellites();
            updateBuffers();
            updateCounter();
        });
        $('#slider-apogee').slider({
            id: 'slider-apogee-internal',
            ticks: [0, 1000, 2000, 5000, 10000, 600000],
            ticks_positions: [0, 20, 40, 60, 80, 100],
            ticks_labels: ['0', '1K', '2K', '5K', '10K', '600K'],
            range: true,
            value: [0, 600000]
        }).slider().on('slideStop', function () {
            selectSatellites();
            updateBuffers();
            updateCounter();
        });
        $('#slider-perigee').slider({
            id: 'slider-perigee-internal',
            ticks: [0, 1000, 2000, 5000, 10000, 500000],
            ticks_positions: [0, 20, 40, 60, 80, 100],
            ticks_labels: ['0', '1K', '2K', '5K', '10K', '500K'],
            range: true,
            value: [0, 500000]
        }).slider().on('slideStop', function () {
            selectSatellites();
            updateBuffers();
            updateCounter();
        });
        
        function showDialog(name) {
            $('.rc-panel[data-panel!="' + name + '"]').animate({'margin-left': '-250px'}, {
                duration: 300,
                easing: 'swing',
                queue: false,
                complete: function () {
                    $('.rc-panel[data-panel="' + name + '"]').animate({ 'margin-left': '0px' }, {
                        duration: 300,
                        easing: 'swing',
                        queue: false
                    });
                }
            });
        }

        function showTrajectory() {
            var position = [];
            var color = [];
            var size = [];

            var length = Number($('#buttonTrajectory > button.active').attr('data-value'));

            for (var i = 0; i < TRAJECTORY_SEGMENTS; i++) {
                var world = new Float32Array(3);
                var point = getSatelliteLocation(
                    new Date(_selectedSatellite.time + i * length / TRAJECTORY_SEGMENTS),
                    _selectedSatellite.line1,
                    _selectedSatellite.line2
                );
                _view.coordinateSystemHelper.pointToEnginePosition(point, world);
                position.push(world[0], world[1], world[2]);
                color.push(1.0, 1.0, 1.0, 1.0);
                size.push(1.0);
            }

            _gl.bindBuffer(_gl.ARRAY_BUFFER, _positionLineBuffer);
            _gl.bufferData(_gl.ARRAY_BUFFER, new Float32Array(position), _gl.STATIC_DRAW);

            _gl.bindBuffer(_gl.ARRAY_BUFFER, _colorLineBuffer);
            _gl.bufferData(_gl.ARRAY_BUFFER, new Float32Array(color), _gl.STATIC_DRAW);

            _gl.bindBuffer(_gl.ARRAY_BUFFER, _sizeLineBuffer);
            _gl.bufferData(_gl.ARRAY_BUFFER, new Float32Array(size), _gl.STATIC_DRAW);
        }

        function hideTrajectory() {
            _gl.bindBuffer(_gl.ARRAY_BUFFER, _positionLineBuffer);
            _gl.bufferData(_gl.ARRAY_BUFFER, new Float32Array([]), _gl.STATIC_DRAW);

            _gl.bindBuffer(_gl.ARRAY_BUFFER, _colorLineBuffer);
            _gl.bufferData(_gl.ARRAY_BUFFER, new Float32Array([]), _gl.STATIC_DRAW);

            _gl.bindBuffer(_gl.ARRAY_BUFFER, _sizeLineBuffer);
            _gl.bufferData(_gl.ARRAY_BUFFER, new Float32Array([]), _gl.STATIC_DRAW);
        }
       
        function selectSatellites() {
            // Country
            var country = $('#buttonCountry1 > button.active, #buttonCountry2 > button.active').attr('data-value');
            var junk = $('#buttonType > button.active').attr('data-value');
            var size = $('#buttonSize > button.active').attr('data-value');

            var val1 = $('#slider-launchdate').slider('getValue');
            var val2 = $('#slider-period').slider('getValue');
            var val3 = $('#slider-inclination').slider('getValue');
            var val4 = $('#slider-apogee').slider('getValue');
            var val5 = $('#slider-perigee').slider('getValue');

            var min1 = $('#slider-launchdate').slider('getAttribute', 'min');
            var min2 = $('#slider-period').slider('getAttribute', 'min');
            var min3 = $('#slider-inclination').slider('getAttribute', 'min');
            var min4 = $('#slider-apogee').slider('getAttribute', 'min');
            var min5 = $('#slider-perigee').slider('getAttribute', 'min');

            var max1 = $('#slider-launchdate').slider('getAttribute', 'max');
            var max2 = $('#slider-period').slider('getAttribute', 'max');
            var max3 = $('#slider-inclination').slider('getAttribute', 'max');
            var max4 = $('#slider-apogee').slider('getAttribute', 'max');
            var max5 = $('#slider-perigee').slider('getAttribute', 'max');

            // Exit if nothing selected
            if (country === 'none' &&
                junk === 'none' &&
                size === 'none' &&
                (val1[0] === min1 && val1[1] === max1) &&
                (val2[0] === min2 && val2[1] === max2) &&
                (val3[0] === min3 && val3[1] === max3) &&
                (val4[0] === min4 && val4[1] === max4) &&
                (val5[0] === min5 && val5[1] === max5)) {
                $.each(_satellites, function () {
                    this.selected = false;
                });
                return;
            }

            //
            $.each(_satellites, function () {
                // Reset selection
                this.selected = false;

                // Exit if metadata is missing
                if (this.metadata === null || this.metadata === undefined) { return true; }

                // Select by country
                if (country !== 'none') {
                    if (this.metadata.country !== country) { return true; }
                }

                // Select by junk
                if (junk !== 'none') {
                    var name = this.metadata.name;
                    if (junk === 'junk' && (name.indexOf(' DEB') === -1 && name.indexOf(' R/B') === -1)) { return true; }
                    if (junk === 'not-junk' && (name.indexOf(' DEB') !== -1 || name.indexOf(' R/B') !== -1)) { return true; }
                }

                // Size
                if (size !== 'none') {
                    if (this.metadata.size !== size) { return true; }
                }

                // Launch date
                if (val1[0] !== min1 || val1[1] !== max1) {
                    var d = new Date(this.metadata.launch);
                    var y = d.getFullYear();
                    if (y <= val1[0] || y >= val1[1]) { return true; }
                }

                // Orbital period
                if (val2[0] !== min2 || val2[1] !== max2) {
                    if (this.metadata.period < val2[0] || this.metadata.period > val2[1]) { return true; }
                }

                // Inclination
                if (val3[0] !== min3 || val3[1] !== max3) {
                    if (this.metadata.inclination < val3[0] || this.metadata.inclination > val3[1]) { return true; }
                }

                // Apogee
                if (val4[0] !== min4 || val4[1] !== max4) {
                    if (this.metadata.apogee < val4[0] || this.metadata.apogee > val4[1]) { return true; }
                }

                // Perigee
                if (val5[0] !== min5 || val5[1] !== max5) {
                    if (this.metadata.perigee < val5[0] || this.metadata.perigee > val5[1]) { return true; }
                }

                // Select satellite
                this.selected = true;
            });
        }

        function updateCounter() {
            var selected = 0;
            $.each(_satellites, function () {
                if (this.selected) {
                    selected++;
                }
            });
            if (selected === 0) {
                $('#satellite-count').html(
                    $.format('{0} satellites loaded', [
                        d3_format.format(',d')(_satellites.length)
                    ])
                );
            } else {
                $('#satellite-count').html(
                    $.format('{0} of {1} satellites found', [
                        d3_format.format(',d')(selected),
                        d3_format.format(',d')(_satellites.length)
                    ])
                );
            }
        }

        function loadShaders() {
            // Compile fragment and vertex shaders
            var v = 'uniform mat4 uPMatrix;' +
                    'uniform mat4 uVMatrix;' +
                    'attribute vec3 aPosition;' +
                    'attribute vec4 aColor;' +
                    'attribute float aSize;' +
                    'varying vec4 vColor;' +
                    'void main(void) {' +
                        'gl_Position = uPMatrix * uVMatrix * vec4(aPosition, 1.0);' +
                        'gl_PointSize = aSize;' +
                        'vColor = aColor;' +
                    '}';
            var f = 'precision mediump float;' +
                    'varying vec4 vColor;' +
                    'void main(void) {' +
                        'gl_FragColor = vColor;' +
                    '}';
            var vshader = _gl.createShader(_gl.VERTEX_SHADER);
            var fshader = _gl.createShader(_gl.FRAGMENT_SHADER);
            _gl.shaderSource(vshader, v);
            _gl.shaderSource(fshader, f);
            _gl.compileShader(vshader);
            _gl.compileShader(fshader);

            // Create and attach shaders
            _shader = _gl.createProgram();
            _gl.attachShader(_shader, vshader);
            _gl.attachShader(_shader, fshader);
            
            // Compile and load shader
            _gl.linkProgram(_shader);
            if (!_gl.getProgramParameter(_shader, _gl.LINK_STATUS)) {
                alert('Could not initialise shaders');
            }
            _gl.useProgram(_shader);

            // Define variables in the vertex shader
            _shader.pMatrixUniform = _gl.getUniformLocation(_shader, 'uPMatrix');
            _shader.vMatrixUniform = _gl.getUniformLocation(_shader, 'uVMatrix');

            // Assign position vertex buffer
            _shader.position = _gl.getAttribLocation(_shader, 'aPosition');
            _gl.enableVertexAttribArray(_shader.position);

            // Assign color vertex buffer
            _shader.color = _gl.getAttribLocation(_shader, 'aColor');
            _gl.enableVertexAttribArray(_shader.color);

            // Assign size vertex buffer
            _shader.size = _gl.getAttribLocation(_shader, 'aSize');
            _gl.enableVertexAttribArray(_shader.size);

            // Create satellite buffer
            _positionBuffer = _gl.createBuffer();
            _colorBuffer = _gl.createBuffer();
            _sizeBuffer = _gl.createBuffer();

            // Create trajectory buffer
            _positionLineBuffer = _gl.createBuffer();
            _colorLineBuffer = _gl.createBuffer();
            _sizeLineBuffer = _gl.createBuffer();
        }

        function updateBuffers() {
            var position = [];
            var color = [];
            var size = [];
            $.each(_satellites, function () {
                position.push(this.world[0], this.world[1], this.world[2]);
                if (this.highlighted) {
                    color.push(0.0, 1.0, 1.0, 1.0);
                    size.push(4.0);
                } else if (this.selected) {
                    color.push(1.0, 0.0, 0.0, 1.0);
                    size.push(3.0);
                } else {
                    color.push(1.0, 1.0, 1.0, 1.0);
                    size.push(1.0);
                }
            });

            _gl.bindBuffer(_gl.ARRAY_BUFFER, _positionBuffer);
            _gl.bufferData(_gl.ARRAY_BUFFER, new Float32Array(position), _gl.STATIC_DRAW);

            _gl.bindBuffer(_gl.ARRAY_BUFFER, _colorBuffer);
            _gl.bufferData(_gl.ARRAY_BUFFER, new Float32Array(color), _gl.STATIC_DRAW);

            _gl.bindBuffer(_gl.ARRAY_BUFFER, _sizeBuffer);
            _gl.bufferData(_gl.ARRAY_BUFFER, new Float32Array(size), _gl.STATIC_DRAW);
        }

        function loadSatellites() {
            var defer = new $.Deferred();
            $.get('data/tle.txt', function (data) {
                var lines = data.split('\n');
                var count = (lines.length / 2).toFixed(0);
                for (var i = 0; i < count; i++) {
                    var line1 = lines[i * 2 + 0];
                    var line2 = lines[i * 2 + 1];
                    var point = null;
                    var time = Date.now();
                    try {
                        point = getSatelliteLocation(new Date(time), line1, line2);
                    }
                    catch (err) { }
                    if (point !== null) {
                        var result = new Float32Array(3);
                        _view.coordinateSystemHelper.pointToEnginePosition(point, result);
                        _satellites.push({
                            world: result,
                            id: Number(line1.substring(2, 7)),
                            line1: line1,
                            line2: line2,
                            time: time,
                            selected: false,
                            highlighted: false,
                            metadata: null
                        });
                    }
                }
                defer.resolve();
            });
            return defer.promise();
        }

        function loadMetadata() {
            var defer = new $.Deferred();
            $.get('data/oio.txt', function (data) {
                var metadata = {};
                var lines = data.split('\n');
                $.each(lines, function () {
                    var items = this.split(',');
                    var int = items[0];
                    var name = items[1];
                    var norad = Number(items[2]);
                    var country = items[3];
                    var period = items[4];
                    var inclination = items[5];
                    var apogee = items[6];
                    var perigee = items[7];
                    var size = items[8];
                    var launch = items[10];
                    metadata[norad] = {
                        int: int,
                        name: name,
                        country: country,
                        period: period,
                        inclination: inclination,
                        apogee: apogee,
                        perigee: perigee,
                        size: size,
                        launch: launch
                    };
                });
                defer.resolve(metadata);
            });
            return defer.promise();
        }

        function getSatelliteLocation(date, line1, line2) {
            var satrec = satellite.twoline2satrec(line1, line2);
            var position_and_velocity = satellite.propagate(
                satrec,
                date.getUTCFullYear(),
                date.getUTCMonth() + 1,
                date.getUTCDate(),
                date.getUTCHours(),
                date.getUTCMinutes(),
                date.getUTCSeconds()
            );
            var position_eci = position_and_velocity.position;
            var gmst = satellite.gstime_from_date(
                date.getUTCFullYear(),
                date.getUTCMonth() + 1,
                date.getUTCDate(),
                date.getUTCHours(),
                date.getUTCMinutes(),
                date.getUTCSeconds()
            );
            var position_gd = satellite.eci_to_geodetic(position_eci, gmst);
            var longitude = position_gd.longitude;
            var latitude = position_gd.latitude;
            var height = position_gd.height;
            if (isNaN(longitude) || isNaN(latitude) || isNaN(height)) {
                return null;
            }
            var rad2deg = 180 / Math.PI;
            while (longitude < -Math.PI) {
                longitude += 2 * Math.PI;
            }
            while (longitude > Math.PI) {
                longitude -= 2 * Math.PI;
            }
            return new Point(
                rad2deg * longitude,
                rad2deg * latitude,
                height * 1000,
                new SpatialReference(4326)
            );
        }

        function resetUI() {
            $('#buttonCountry1 > button, #buttonCountry2 > button').removeClass('active');
            $('#buttonCountry1 > button[data-value="none"]').addClass('active');
            $('#buttonType > button[data-value="none"]').addClass('active').siblings().removeClass('active');
            $('#buttonSize > button[data-value="none"]').addClass('active').siblings().removeClass('active');
            resetSlider('#slider-launchdate');
            resetSlider('#slider-period');
            resetSlider('#slider-inclination');
            resetSlider('#slider-apogee');
            resetSlider('#slider-perigee');
        }

        function resetSlider(name) {
            $(name).slider('setValue', [
                $(name).slider('getAttribute', 'min'),
                $(name).slider('getAttribute', 'max')
            ]);
        }

        function postRender() {
            // Exit if no webgl context
            if (_gl === null) { return; }
            if (_positionBuffer === null) { return; }

            // Reassign shader program
            _gl.useProgram(_shader);

            // Assign projection and view matrices
            _gl.uniformMatrix4fv(_shader.pMatrixUniform, false, _camera.projectionMatrix);
            _gl.uniformMatrix4fv(_shader.vMatrixUniform, false, _camera.viewMatrix);

            // Enable vertex arrays
            _gl.enableVertexAttribArray(_shader.position);
            _gl.enableVertexAttribArray(_shader.color);
            _gl.enableVertexAttribArray(_shader.size);

            // Draw satellites
            render(_gl.POINTS, _positionBuffer, _colorBuffer, _sizeBuffer, _satellites.length);

            // Draw trajectory
            if (_selectedSatellite !== null) {
                render(_gl.LINE_STRIP, _positionLineBuffer, _colorLineBuffer, _sizeLineBuffer, TRAJECTORY_SEGMENTS);
            }
        }

        function render(type, positions, colors, sizes, length) {
            _gl.bindBuffer(_gl.ARRAY_BUFFER, positions);
            _gl.vertexAttribPointer(_shader.position, 3, _gl.FLOAT, false, 0, 0);

            _gl.bindBuffer(_gl.ARRAY_BUFFER, colors);
            _gl.vertexAttribPointer(_shader.color, 4, _gl.FLOAT, false, 0, 0);

            _gl.bindBuffer(_gl.ARRAY_BUFFER, sizes);
            _gl.vertexAttribPointer(_shader.size, 1, _gl.FLOAT, false, 0, 0);

            _gl.drawArrays(type, 0, length);
        }
    });
});
