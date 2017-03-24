process.on('message', (m) => {
    switch (m.job) {
        case 'points':
            const pointsLayer = require(`./pointsLayer.js`);
            let points = new pointsLayer(m.points);
            points.count({
                polygon: m.polygon,
                complete: (r) => {
                    r.x = 'complete';
                    process.send(r);
                },
                error: (e) => {
                    e.x = 'error'
                    //process.send(e);
                },
                bunch: (s, t) => {
                    let step = {
                        x: 'step',
                        prog: s,
                        tot: t
                    };
                    process.send(step);
                }
            });
            break;
        case 'pixels':
            const pixelsLayer = require(`./pixelsLayer.js`);
            let pixels = new pixelsLayer(m.pixels);
            pixels.sum({
                polygon: m.polygon,
                complete: (r) => {
                    r.x = 'complete';
                    process.send(r);
                },
                error: (e) => {
                    e.x = 'error'
                    process.send(e);
                },
                bunch: (s, t) => {
                    let step = {
                        x: 'step',
                        prog: s,
                        tot: t
                    };
                    process.send(step);
                }
            });
            break
        default:
            return;
    }
});
