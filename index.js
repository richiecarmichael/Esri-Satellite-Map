/* ------------------------------------------------------------

   Copyright 2015 Esri

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at:
   https://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.

--------------------------------------------------------------- */

require({
    packages: [{
        name: 'root',
        location: document.location.pathname + '/..'
    }]
}, [
        'esri/Map',
        'esri/Camera',
        'esri/views/SceneView',
        'esri/views/3d/externalRenderers',
        'root/renderer',
        'dojo/number',
        'dojo/string',
        'dojo/domReady!'
    ],
    function (
        Map,
        Camera,
        SceneView,
        ExternalRenderers,
        Renderer,
        number,
        string
    ) {
        $(document).ready(function () {
            // Enforce strict mode
            'use strict';

            // Files
            var TLE = 'data/tle.20200714.txt';
            var OIO = 'data/oio.20200714.txt';

            // Well known satellite constellations.
            var GPS = [20959, 22877, 23953, 24876, 25933, 26360, 26407, 26605, 26690, 27663, 27704, 28129, 28190, 28361, 28474, 28874, 29486, 29601, 32260, 32384, 32711, 35752, 36585, 37753, 38833, 39166, 39533, 39741, 40105, 40294, 40534];
            var GLONASS = [28915, 29672, 29670, 29671, 32276, 32275, 32393, 32395, 36111, 36112, 36113, 36400, 36402, 36401, 37139, 37138, 37137, 37829, 37869, 37867, 37868, 39155, 39620, 40001];
            var INMARSAT = [20918, 21149, 21814, 21940, 23839, 24307, 24674, 24819, 25153, 28628, 28899, 33278, 40384, 39476];
            var LANDSAT = [25682, 39084];
            var DIGITALGLOBE = [25919, 32060, 33331, 35946, 40115];
            var SPACESTATIONS = [
                25544, // International Space Station
                41765  // Tiangong-2
            ];

            // Orbital altitude definitions.
            var LOW_ORBIT = 2000;
            var GEOSYNCHRONOUS_ORBIT = 35786;
            
            // Satellite database urls.
            var NASA_SATELLITE_DATABASE = 'https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id='; // use International id
            var N2YO_SATELLITE_DATABASE = 'https://www.n2yo.com/satellite/?s=';                            // use NORAD id

            // Rendering variables.
            var renderer = null;

            // Create map and view
            var view = new SceneView({
                map: new Map({
                    basemap: 'satellite'
                }),
                container: 'map',
                ui: {
                    components: [
                        'zoom',
                        'compass'
                    ]
                },
                environment: {
                    lighting: {
                        directShadowsEnabled: false,
                        ambientOcclusionEnabled: false,
                        cameraTrackingEnabled: false
                    },
                    atmosphereEnabled: true,
                    atmosphere: {
                        quality: 'high'
                    },
                    starsEnabled: false
                },
                constraints: {
                    altitude: {
                        max: 12000000000
                    }
                }
            });
            view.when(function () {
                // Set initial camera position
                view.set('camera', Camera.fromJSON({
                    'position': {
                        'x': -1308000,
                        'y': 2670000,
                        'spatialReference': {
                            'wkid': 102100,
                            'latestWkid': 3857
                        },
                        'z': 110000000
                    }
                }));

                // Increase far clipping plane
                view.constraints.clipDistance.far *= 4;

                // Load satellites
                loadSatellites().done(function (satellites) {
                    // Load satellite layer
                    renderer = new Renderer(satellites);
                    ExternalRenderers.add(
                        view,
                        renderer
                    );

                    // Show satellite count
                    updateCounter();

                    // Load metadata
                    loadMetadata().done(function (metadata) {
                        $.each(renderer.satellites, function () {
                            this.metadata = metadata[this.id];
                        });
                    });
                });
            });
            view.on('click', function (e) {
                // Highlighted satellite
                var sat = renderer.satelliteHover;

                // Nothing selected. Hide orbit and close information window.
                if (sat === null) {
                    renderer.hideOrbit();
                    showDialog('main');
                    return;
                }

                // Display information panel
                $('#infoWindow-title').html(sat.metadata.name);
                $('#infoWindow-norad').html(sat.id);
                $('#infoWindow-int').html(sat.metadata.int);
                $('#infoWindow-name').html(sat.metadata.name);
                $('#infoWindow-country').html(sat.metadata.country);
                $('#infoWindow-period').html(number.format(sat.metadata.period, {
                    places: 2
                }) + ' min');
                $('#infoWindow-inclination').html(sat.metadata.inclination + '°');
                $('#infoWindow-apogee').html(number.format(sat.metadata.apogee, {
                    places: 0
                }) + ' km');
                $('#infoWindow-perigee').html(number.format(sat.metadata.perigee, {
                    places: 0
                }) + ' km');
                $('#infoWindow-size').html(sat.metadata.size);
                $('#infoWindow-launch').html(sat.metadata.launch.toLocaleDateString());
                $('#link-nasa').attr('href', string.substitute(NASA_SATELLITE_DATABASE + '${id}', { id: sat.metadata.int }));
                $('#link-n2yo').attr('href', string.substitute(N2YO_SATELLITE_DATABASE + '${id}', { id: sat.id }));
                showDialog('info');

                // Display the orbit for the click satellite
                renderer.showOrbit();
            });

            $('#map').mousemove(function (e) {
                if (!renderer) { return; }
                renderer.mousemove(e.offsetX, e.offsetY);
            });

            $('#bottom-left-help a').attr('target', '_blank');
            $('#bottom-left-about a').attr('target', '_blank');
            $('#link-nasa, #link-n2yo').attr('target', '_blank');

            $('.rc-close').click(function () {
                $.each(renderer.satellites, function () {
                    this.highlighted = false;
                });
                renderer.hideOrbit();
                showDialog('main');
            });

            $('#button-help').click(function () {
                showDialog('help');
            });

            $('#button-about').click(function () {
                showDialog('about');
            });

            // Enable bootstrap tooltips
            $('[data-toggle="tooltip"]').tooltip();

            // Handle quick link presets
            $('#dropdown-presets > li > a').click(function () {
                resetUI();
                switch ($(this).attr('data-value')) {
                    case 'american-satellites':
                        $('.rc-country > button').removeClass('active');
                        $('.rc-country > button[data-value="US"]').addClass('active');
                        selectSatellites();
                        break;
                    case 'chinese-satellites':
                        $('.rc-country > button').removeClass('active');
                        $('.rc-country > button[data-value="PRC"]').addClass('active');
                        selectSatellites();
                        break;
                    case 'russian-satellites':
                        $('.rc-country > button').removeClass('active');
                        $('.rc-country > button[data-value="CIS"]').addClass('active');
                        selectSatellites();
                        break;
                    case 'space-stations':
                        $.each(renderer.satellites, function () {
                            this.selected = SPACESTATIONS.indexOf(this.id) !== -1;
                        });
                        break;
                    case 'gps':
                        $.each(renderer.satellites, function () {
                            this.selected = GPS.indexOf(this.id) !== -1;
                        });
                        break;
                    case 'glonass':
                        $.each(renderer.satellites, function () {
                            this.selected = GLONASS.indexOf(this.id) !== -1;
                        });
                        break;
                    case 'inmarsat':
                        $.each(renderer.satellites, function () {
                            this.selected = INMARSAT.indexOf(this.id) !== -1;
                        });
                        break;
                    case 'landsat':
                        $.each(renderer.satellites, function () {
                            this.selected = LANDSAT.indexOf(this.id) !== -1;
                        });
                        break;
                    case 'digitalglobe':
                        $.each(renderer.satellites, function () {
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
                    case 'reset':
                        selectSatellites();
                        break;
                }
                updateCounter();
                renderer.updateSelection();
            });

            // Reset UI
            $('#buttonReset').click(function () {
                resetUI();
                selectSatellites();
                updateCounter();
                renderer.updateSelection();
            });

            // Country
            $('.rc-country > button').click(function () {
                $('.rc-country > button').removeClass('active');
                $(this).addClass('active');
                selectSatellites();
                updateCounter();
                renderer.updateSelection();
            });

            // Type or Size
            $('.rc-type > button, .rc-size > button').click(function () {
                $(this).addClass('active').siblings('.active').removeClass('active');
                selectSatellites();
                updateCounter();
                renderer.updateSelection();
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
                updateCounter();
                renderer.updateSelection();
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
                updateCounter();
                renderer.updateSelection();
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
                updateCounter();
                renderer.updateSelection();
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
                updateCounter();
                renderer.updateSelection();
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
                updateCounter();
                renderer.updateSelection();
            });

            function showDialog(name) {
                $('.rc-panel[data-panel!="' + name + '"]').animate({ 'margin-left': '-250px' }, {
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

            function selectSatellites() {
                // Country
                var country = $('.rc-country > button.active').attr('data-value');
                var junk = $('.rc-type > button.active').attr('data-value');
                var size = $('.rc-size > button.active').attr('data-value');

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
                    $.each(renderer.satellites, function () {
                        this.selected = false;
                    });
                    return;
                }

                //
                $.each(renderer.satellites, function () {
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
                        var y = this.metadata.launch.getFullYear();
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
                $.each(renderer.satellites, function () {
                    if (this.selected) {
                        selected++;
                    }
                });
                if (selected === 0) {
                    $('#satellite-count').html(
                        string.substitute('${count} satellites loaded', {
                            count: number.format(renderer.satellites.length, {
                                places: 0
                            })
                        })
                    );
                } else {
                    $('#satellite-count').html(
                        string.substitute('${found} of ${count} satellites found', {
                            found: number.format(selected, {
                                places: 0
                            }),
                            count: number.format(renderer.satellites.length, {
                                places: 0
                            })
                        })
                    );
                }
            }

            function loadSatellites() {
                var defer = new $.Deferred();
                $.get(TLE, function (data) {
                    var lines = data.split('\n');
                    var count = (lines.length / 2).toFixed(0);
                    var satellites = [];
                    for (var i = 0; i < count; i++) {
                        var line1 = lines[i * 2 + 0];
                        var line2 = lines[i * 2 + 1];
                        var satrec = null;
                        try {
                            satrec = satellite.twoline2satrec(line1, line2);
                        }
                        catch (err) {
                            continue;
                        }
                        if (satrec === null || satrec === undefined) { continue; }
                        satellites.push({
                            id: Number(line1.substring(2, 7)),
                            satrec: satrec,
                            selected: false,
                            highlighted: false,
                            metadata: null
                        });
                    }
                    defer.resolve(satellites);
                });
                return defer.promise();
            }

            function loadMetadata() {
                var defer = new $.Deferred();
                $.get(OIO, function (data) {
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
                        var launch = new Date(items[10]);
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

            function resetUI() {
                $('.rc-country > button').removeClass('active').siblings('[data-value="none"]').addClass('active');
                $('.rc-type > button').removeClass('active').siblings('[data-value="none"]').addClass('active');
                $('.rc-size > button').removeClass('active').siblings('[data-value="none"]').addClass('active');
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
        });
    }
);
