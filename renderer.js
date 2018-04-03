define([
    'esri/Camera',
    'esri/core/declare',
    'esri/views/3d/externalRenderers'
], function (
    Camera,
    declare,
    externalRenderers
) {
        // Enforce strict mode
        'use strict';

        // Constants
        var THREE = window.THREE;
        var RADIUS = 6378137;
        var THRESHOLD = 1000000;
        var TRAJECTORY_SEGMENTS = 1000;

        return declare([], {
            constructor: function (satellites) {
                // All satellite and the date for computation.
                this.satellites = satellites;
                this.satelliteHover = null;
                this.satelliteIdentified = null;

                // Layers
                this.normal = null;     // All satellites. Colored white.
                this.selected = null;   // Colored red based on filters.
                this.hover = null;      // Colored cyan when the user's mouse hovers over.
                this.trajectory = null; // Orbital trajectory of a clicked satellite.
                this.identified = null; // A clicked satellite. Colored cyan.

                // SceneView
                this.view = null;
            },
            setup: function (context) {
                // Store view
                this.view = context.view;

                // Create the THREE.js webgl renderer
                this.renderer = new THREE.WebGLRenderer({
                    context: context.gl,
                    premultipliedAlpha: false
                });

                //
                this.renderer.setPixelRatio(window.devicePixelRatio);
                this.renderer.setSize(
                    this.view.size[0],
                    this.view.size[1]
                );

                // Make sure it does not clear anything before rendering
                this.renderer.autoClearDepth = false;
                this.renderer.autoClearColor = false;
                this.renderer.autoClearStencil = false;

                // The ArcGIS JS API renders to custom offscreen buffers, and not to the default framebuffers.
                // We have to inject this bit of code into the three.js runtime in order for it to bind those
                // buffers instead of the default ones.
                var originalSetRenderTarget = this.renderer.setRenderTarget.bind(this.renderer);
                this.renderer.setRenderTarget = function (target) {
                    originalSetRenderTarget(target);
                    if (target === null) {
                        context.bindRenderTarget();
                    }
                };

                //
                this.scene = new THREE.Scene();
                this.camera = new THREE.PerspectiveCamera();

                // Create both a directional light, as well as an ambient light
                this.directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
                this.ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
                this.scene.add(
                    this.directionalLight,
                    this.ambientLight
                );

                // Create objects and add them to the scene
                this.normal = new THREE.Points(
                    new THREE.BufferGeometry(),
                    new THREE.PointsMaterial({
                        color: 0xffffff,
                        size: 1,
                        sizeAttenuation: false,
                        vertexColors: THREE.NoColors,
                        fog: false
                    })
                );

                this.selected = new THREE.Points(
                    new THREE.BufferGeometry(),
                    new THREE.PointsMaterial({
                        color: 0xff0000,
                        size: 4,
                        sizeAttenuation: false,
                        vertexColors: THREE.NoColors,
                        fog: false
                    })
                );
                this.selected.frustumCulled = false;

                this.hover = new THREE.Points(
                    new THREE.BufferGeometry(),
                    new THREE.PointsMaterial({
                        color: 0x00ffff,
                        size: 6,
                        sizeAttenuation: false,
                        vertexColors: THREE.NoColors,
                        fog: false
                    })
                );
                this.hover.frustumCulled = false;

                this.trajectory = new THREE.Line(
                    new THREE.BufferGeometry(),
                    new THREE.LineBasicMaterial({
                        color: 0xffffff,
                        linewidth: 1,
                        vertexColors: THREE.NoColors,
                        fog: false
                    })
                );
                this.trajectory.frustumCulled = false;

                this.identified = new THREE.Points(
                    new THREE.BufferGeometry(),
                    new THREE.PointsMaterial({
                        color: 0xff7f00,
                        size: 6,
                        sizeAttenuation: false,
                        vertexColors: THREE.NoColors,
                        fog: false
                    })
                );
                this.identified.frustumCulled = false;

                // Add all satellites to normal layer.
                var vertex = [];
                var valid = [];
                var date = new Date();
                for (var i = 0; i < this.satellites.length; i++) {
                    var satellite = this.satellites[i];
                    var eci = this.getSatelliteLocation(satellite.satrec, date);
                    if (eci === null || eci === undefined || isNaN(eci.x) || isNaN(eci.y) || isNaN(eci.z)) {
                        continue;
                    }
                    vertex.push(
                        eci.x * 1000,
                        eci.y * 1000,
                        eci.z * 1000
                    );
                    valid.push(satellite);
                }

                // Satellites that returned a computable location.
                this.satellites = valid;

                // Assign buffer.
                var position = new THREE.Float32Attribute(vertex, 3);
                position.setDynamic(true);
                this.normal.geometry.addAttribute('position', position);

                // Add to scene
                this.scene.add(
                    this.normal,
                    this.selected,
                    this.hover,
                    this.trajectory,
                    this.identified
                );

                // Start web worker
                var worker = new Worker('worker.js');
                worker.onmessage = function (e) {
                    // Update all satellites.
                    position.set(e.data.vertex);
                    position.needsUpdate = true;

                    // Update selected satellites.
                    var vertex = [];
                    for (var i = 0; i < this.satellites.length; i++) {
                        var satellite = this.satellites[i];
                        if (!satellite.selected) {
                            continue;
                        }
                        vertex.push(
                            position.getX(i),
                            position.getY(i),
                            position.getZ(i)
                        );
                    }
                    this.selected.geometry.removeAttribute('position');
                    this.selected.geometry.addAttribute('position', new THREE.Float32Attribute(vertex, 3));
                    this.selected.needsUpdate = true;

                    // Update hover-over satellite.
                    if (this.satelliteHover !== null) {
                        var index2 = this.satellites.indexOf(this.satelliteHover);
                        var vertex2 = [];
                        vertex2.push(
                            position.getX(index2),
                            position.getY(index2),
                            position.getZ(index2)
                        );
                        this.hover.geometry.removeAttribute('position');
                        this.hover.geometry.addAttribute('position', new THREE.Float32Attribute(vertex2, 3));
                        this.hover.needsUpdate = true;
                    }

                    // Update highlighted satellite.
                    if (this.satelliteIdentified !== null) {
                        var index3 = this.satellites.indexOf(this.satelliteIdentified);
                        var vertex3 = [];
                        vertex3.push(
                            position.getX(index3),
                            position.getY(index3),
                            position.getZ(index3)
                        );
                        this.identified.geometry.removeAttribute('position');
                        this.identified.geometry.addAttribute('position', new THREE.Float32Attribute(vertex3, 3));
                        this.identified.needsUpdate = true;
                    }
                }.bind(this);
                worker.postMessage({
                    satellites: this.satellites.map(function (e) {
                        return {
                            satrec: e.satrec
                        };
                    })
                });

                // Refresh the screen
                externalRenderers.requestRender(this.view);
            },
            render: function (context) {
                // Get Esri's camera
                var c = context.camera;

                // Update three.js camera
                this.camera.position.set(c.eye[0], c.eye[1], c.eye[2]);
                this.camera.up.set(c.up[0], c.up[1], c.up[2]);
                this.camera.lookAt(new THREE.Vector3(c.center[0], c.center[1], c.center[2]));
                this.camera.projectionMatrix.fromArray(c.projectionMatrix);

                // Get Esri's current sun settings
                this.view.environment.lighting.date = this.date;

                // Update lighting
                var direction = context.sunLight.direction;
                var diffuse = context.sunLight.diffuse;
                var ambient = context.sunLight.ambient;

                // Update the directional light color, intensity and position
                this.directionalLight.color.setRGB(diffuse.color[0], diffuse.color[1], diffuse.color[2]);
                this.directionalLight.intensity = diffuse.intensity;
                this.directionalLight.position.set(direction[0], direction[1], direction[2]);

                // Update the ambient light color and intensity
                this.ambientLight.color.setRGB(ambient.color[0], ambient.color[1], ambient.color[2]);
                this.ambientLight.intensity = ambient.intensity;

                // Render the scene
                this.renderer.resetGLState();
                this.renderer.render(this.scene, this.camera);

                // Request a re-render
                externalRenderers.requestRender(this.view);

                // Cleanup
                context.resetWebGLState();
            },
            dispose: function (content) { },
            getSatelliteLocation: function (satrec, date) {
                var position_and_velocity = satellite.propagate(
                    satrec,
                    date.getUTCFullYear(),
                    date.getUTCMonth() + 1,
                    date.getUTCDate(),
                    date.getUTCHours(),
                    date.getUTCMinutes(),
                    date.getUTCSeconds()
                );
                return position_and_velocity.position;
            },
            updateSelection: function () {
                // Get locations of selected satellites
                var vertex = [];
                for (var i = 0; i < this.satellites.length; i++) {
                    var satellite = this.satellites[i];
                    if (!satellite.selected) {
                        continue;
                    }
                    var p = this.normal.geometry.getAttribute('position');
                    vertex.push(
                        p.getX(i),
                        p.getY(i),
                        p.getZ(i)
                    );
                }

                // Assign location array to 
                this.selected.geometry.removeAttribute('position');
                this.selected.geometry.addAttribute('position', new THREE.Float32Attribute(vertex, 3));

                // Immediately request a new redraw
                externalRenderers.requestRender(this.view);
            },
            mousemove: function (x, y) {
                // Normalize mouse
                var mouse = new THREE.Vector2(
                    x / $('#map').width() * 2 - 1,
                    y / $('#map').height() * -2 + 1
                );
                var raycaster = new THREE.Raycaster();
                raycaster.params.Points.threshold = THRESHOLD;
                raycaster.setFromCamera(mouse, this.camera);

                var intersections = raycaster.intersectObject(this.normal);
                //
                var satellite = null;
                var vertex = [];
                var index = null;
                if (intersections.length !== 0) {
                    intersections.sort(function (a, b) {
                        return a.distanceToRay - b.distanceToRay;
                    });
                    var intersection = intersections[0];
                    index = intersection.index;
                    satellite = this.satellites[index];
                }
                if (satellite === null && this.satelliteHover === null) { return; }
                if (satellite === this.satelliteHover) { return; }

                //
                this.satelliteHover = satellite;
                if (this.satelliteHover !== null) {
                    var p = this.normal.geometry.getAttribute('position');
                    vertex.push(
                        p.getX(index),
                        p.getY(index),
                        p.getZ(index)
                    );
                }
                this.hover.geometry.removeAttribute('position');
                this.hover.geometry.addAttribute('position', new THREE.Float32Attribute(vertex, 3));

                // Immediately request a new redraw
                externalRenderers.requestRender(this.view);
            },
            hideOrbit: function () {
                // Clear orbit
                this.trajectory.geometry.removeAttribute('position');
                this.identified.geometry.removeAttribute('position');

                //
                this.satelliteIdentified = null;

                // Immediately request a new redraw
                externalRenderers.requestRender(this.view);
            },
            showOrbit: function () {
                // Exit if no satellite currently under the user's mouse.
                if (this.satelliteHover === null) { return; }
                this.satelliteIdentified = this.satelliteHover;

                // Time between orbital vertex
                var ms = this.satelliteIdentified.metadata.period * 60000;
                ms /= TRAJECTORY_SEGMENTS;

                // Show orbit
                var vertex = [];
                var start = new Date();
                for (var i = 0; i <= TRAJECTORY_SEGMENTS; i++) {
                    var date = new Date(start.valueOf() + i * ms);
                    var eci = this.getSatelliteLocation(this.satelliteIdentified.satrec, date);
                    if (eci === null || eci === undefined || isNaN(eci.x) || isNaN(eci.y) || isNaN(eci.z)) {
                        continue;
                    }
                    vertex.push(
                        eci.x * 1000,
                        eci.y * 1000,
                        eci.z * 1000
                    );
                }
                this.trajectory.geometry.removeAttribute('position');
                this.trajectory.geometry.addAttribute('position', new THREE.Float32Attribute(vertex, 3));

                // Show satellite
                this.identified.geometry.removeAttribute('position');
                this.identified.geometry.addAttribute('position', new THREE.Float32Attribute(vertex.slice(0, 3), 3));

                // Immediately request a new redraw
                externalRenderers.requestRender(this.view);
            }
        });
    }
);