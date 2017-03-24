/**
 * @author : gherardo varando (gherardo.varando@gmail.com)
 *
 * @license: GPL v3
 *     This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

'use strict';
//use non-map convention x-y if v=coords x=v[0] y=v[1]
//
const http = require('http');
const Baby = require("babyparse");
const fs = require("fs");

class pointsLayer {

    constructor(configuration) {
        this.configuration = configuration;
        this.options = {};
    }


    /**
     * check if a given point is inside a polygon
     * @param  {array} point   2 dimensions vector
     * @param  {polygon} polygon vector of 2dim vectors components,
     * @return {logical}
     */
    pointinpolygon(point, polygon) {
        if (!polygon) {
            return true;
        }

        // ray-casting algorithm based on
        // http://www.ecse.rpi.edu/Homepages/wrf/Research/Short_Notes/pnpoly.html
        var x = point[0],
            y = point[1]; // extract x and y form point

        //convert latlngs to a vector of coordinates
        var vs = polygon;

        var inside = false; //initialize inside variable to false

        //ray-casting algorithm
        for (var i = 0, j = vs.length - 1; i < vs.length; j = i++) {
            var xi = vs[i][0],
                yi = vs[i][1];
            var xj = vs[j][0],
                yj = vs[j][1];
            var intersect = ((yi > y) != (yj > y)) &&
                (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
        }
        return inside;
    }

    isRemote() {
        if (typeof module == 'undefined' || !module.exports){

        }
        if (typeof this.configuration.source === 'string') {
            if (this.configuration.source === 'remote') return true;
            if (this.configuration.source === 'local') return false;
        }
        if (typeof this.configuration.pointsUrlTemplate === 'string') {
            if (this.configuration.pointsUrlTemplate.startsWith('http')) return true;
            if (this.configuration.pointsUrlTemplate.startsWith('file')) return false;
            if (this.configuration.pointsUrlTemplate.startsWith('/')) return false;
        }
        return false;
    }


    getBounds(polygon) {
        if (polygon) {
            let b = {
                west: polygon[0][0],
                east: polygon[0][0],
                north: polygon[0][1],
                south: polygon[0][1]
            };
            for (var i in polygon) {
                b.west = Math.min(b.west, polygon[i][0]);
                b.east = Math.max(b.east, polygon[i][0]);
                b.north = Math.min(b.north, polygon[i][1]);
                b.south = Math.max(b.south, polygon[i][1]);
            }
            return b;
        } else {
            return polygon;
        }
    }

    // bounds is an object with .west .east .north and .south
    getReferences(bounds) {
        let tileSize = this.configuration.tileSize;
        let x0 = this.configuration.tilex0;
        let y0 = this.configuration.tiley0;
        if (bounds) {
            if (!x0) {
                x0 = 0;
            }

            if (!y0) {
                y0 = 0;
            }
            var temp = [];
            let siz = this.configuration.size;
            Object.keys(bounds).map((k) => {
                bounds[k] = Math.max(Math.min(bounds[k], siz), 0)
            });
            var xstart = Math.floor(bounds.west / tileSize);
            var xstop = Math.floor(bounds.east / tileSize);
            var ystart = Math.floor(bounds.north / tileSize);
            var ystop = Math.floor(bounds.south / tileSize);
            if (xstop === (bounds.east / tileSize)) xstop--;
            if (ystop === (bounds.south / tileSize)) ystop--;
            for (var i = xstart; i <= xstop; i++) {
                for (var j = ystart; j <= ystop; j++) {
                    //if (i>=0 && j>=0){
                    temp.push([i, j]);
                    //}
                }
            }

            var res = temp.map((coord) => {
                return ({
                    col: coord[0] + x0,
                    row: coord[1] + y0,
                    x: coord[0] * tileSize,
                    y: coord[1] * tileSize
                })
            });

            return (res);
        } else {
            return this.getReferences({
                west: 0,
                east: this.configuration.size,
                north: 0,
                south: this.configuration.size
            });
        }
    }


    count(options) {
        let t0 = process.hrtime();

        let polygon = options.polygon;
        let complete = options.complete;
        let error = options.errorcl;
        let cl = options.cl;
        let bunch = options.bunch;
        let maxTiles = options.maxTiles;


        var references = this.getReferences(this.getBounds(polygon));
        var l = references.length;
        const tot = l;
        var pointsUrlTemplate = this.configuration.pointsUrlTemplate;
        let points = [];
        let N = 0;

        var step = (point) => {
            if (this.pointinpolygon([point[0], point[1]], polygon)) {
                N = N + 1;
                if (typeof cl === 'function') {
                    cl(point);
                }
            }
        };

        var end = (num) => {
            l = l - 1;
            if (bunch) {
                bunch(tot - l, tot);
            }
            if (l <= 0) {
                let t1 = process.hrtime(t0);
                if (complete) {
                    complete({
                        N: N,
                        tot: tot,
                        time: t1
                    });
                }
            }
        };


        var err = (e) => {
            if (error) {
                error(e);
            }
            l = l - 1;
            if (bunch) {
                bunch(tot - l, tot);
            }
            if (l <= 0) {
                let t1 = process.hrtime(t0);
                if (complete) {
                    complete({
                        N: N,
                        tot: tot,
                        time: t1
                    });
                }
            }
        };

        if (maxTiles) {
            maxTiles = Math.min(maxTiles, references.length);
        } else {
            maxTiles = references.length;
        }

        for (var tt = 0; tt < maxTiles; tt++) {

            this.read(polygon, references[tt], step, err, end);
        }
    }

    read(polygon, reference, step, error, end) {
        let num = 0;
        let url = this.configuration.pointsUrlTemplate;
        url = url.replace("{x}", reference.col);
        url = url.replace("{y}", reference.row);
        try {
            let bParse = (contents) => {
                Baby.parse(contents, {
                    dynamicTyping: true,
                    fastMode: true,
                    step: (results, parser) => {
                        if (!this.configuration.excludeCF || results.data[0][3] == 0) {
                            step([results.data[0][0] + reference.x, results.data[0][1] + reference.y]);
                        }
                    },
                    complete: (results, file) => {
                        if (end) {
                            end(num);
                        }
                    },
                    error: (e, file) => {
                        if (error) {
                            error(e);
                        }
                    }
                });
            }
            if (this.isRemote()) {
                // //do not need this part because of http-browserify
                // if (typeof XMLHttpRequest === 'function') {
                //     let xhr = new XMLHttpRequest();
                //     xhr.onreadystatechange = () => {
                //         if (xhr.readyState === XMLHttpRequest.DONE && xhr.status === 200) {
                //             bParse(xhr.responseText);
                //         }
                //     };
                //     xhr.open("GET", url, true);
                //     xhr.send();
                // } else {
                    http.get(url, (res) => {
                        const statusCode = res.statusCode;
                        const contentType = res.headers['content-type'];
                        let err;
                        if (statusCode !== 200) {
                            err = new Error(`Request Failed.\n` +
                                `Status Code: ${statusCode}`);
                        }
                        if (err) {
                            if (typeof error === 'function') {
                                error(err);
                            }
                            // consume response data to free up memory
                            res.resume();
                            return;
                        }
                        res.setEncoding('utf8');
                        let rawData = '';
                        res.on('data', (chunk) => rawData += chunk);
                        res.on('end', () => {
                            try {
                                bParse(rawData);
                            } catch (e) {
                                if (typeof error === 'function') {
                                    error(e);
                                }
                            }
                        });
                    }).on('error', (e) => {
                        error(e);
                    });
              //  }
            } else {
                fs.readFile(url, (err, data) => {
                    if (err) {
                        if (typeof error === 'function') {
                            error(err);
                        }
                    } else {
                        bParse(data.toString());
                    }
                });
            }
        } catch (e) {
            if (error) {
                if (typeof error === 'function') {
                    error(e);
                }
            }
        }
    }

}

//export as node module
if (typeof module !== 'undefined' && module.exports) {
    module.exports = pointsLayer;
}
// ...or as browser global
else {
    global.pointsLayer = pointsLayer;
}
