importScripts('js/satellite.min.js');

addEventListener('message', function (e) {
    while (true) {
        var vertex = [];
        var date = new Date();
        e.data.satellites.forEach(function (sat, i) {
            var position_and_velocity = satellite.propagate(
                sat.satrec,
                date.getUTCFullYear(),
                date.getUTCMonth() + 1,
                date.getUTCDate(),
                date.getUTCHours(),
                date.getUTCMinutes(),
                date.getUTCSeconds()
            );
            var eci = position_and_velocity.position;
            if (eci === null || eci === undefined || isNaN(eci.x) || isNaN(eci.y) || isNaN(eci.z)) {
                vertex.push(
                    0,
                    0,
                    0
                );
            }
            else {
                vertex.push(
                    eci.x * 1000,
                    eci.y * 1000,
                    eci.z * 1000
                );
            }
        });
        postMessage({
            vertex: new Float32Array(vertex)
        });
    }
}, false);