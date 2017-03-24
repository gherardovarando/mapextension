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
const fss = require("fs");

class gridLayer {

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


    

}

//export as node module
if (typeof module !== 'undefined' && module.exports) {
    module.exports = gridLayer;
}
// ...or as browser global
else {
    global.pointsLayer = gridLayer;
}
