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


const Task = require('Task');
const TaskManager = require('TaskManager');
const Util = require('Util');
const {
    fork
} = require('child_process');
const {
    ipcRenderer
} = require('electron');
const {
    ChildProcess
} = require('child_process');
const async = require('async');

let gui = require('Gui');



/**
 * compute the area of a polygon
 * code from http://www.mathopenref.com/coordpolygonarea2.html
 * original from http://alienryderflex.com/polygon_area/
 *  Public-domain function by Darel Rex Finley, 2006.
 * @param  {array of ltlng} coords array of the vertex of the polygon
 * @return {number}        area of the polygon
 */
let polygonArea = function(coords) {
    coords = coords[0]; //lealfet 1 uncomment this line
    coords = coords.map(function(ltlng) {
        return ([ltlng.lat, ltlng.lng])
    });
    var numPoints = coords.length;
    var area = 0; // Accumulates area in the loop
    var j = numPoints - 1; // The last vertex is the 'previous' one to the first

    for (var i = 0; i < numPoints; i++) {
        area = area + (coords[j][0] + coords[i][0]) * (coords[j][1] -
            coords[i][1]);
        j = i; //j is previous vertex to i
    }
    return Math.abs(area / 2);
}



class RegionAnalyzer {
    constructor(mapManager) {
        this.mapManager = mapManager;
    }

    areaPx(polygon) {
        return polygonArea(polygon.getLatLngs());
    }

    areaCal(polygon) {
        return this.areaPx(polygon) * (this.mapManager.getSizeCal() * this.mapManager.getSizeCal()) / (this.mapManager.getSize() * this.mapManager.getSize());
    }

    volumeCal(polygon) {
        return this.areaCal(polygon) * this.mapManager.getDepthCal();
    }





    computeRegionStats(polygon) {
        let area_px = this.areaPx(polygon);
        let areaCal = this.areaCal(polygon);
        let volumeCal = this.volumeCal(polygon);
        let aPxtoVcal = volumeCal / area_px;
        let size = this.mapManager.getSize();
        let sizeCal = this.mapManager.getSizeCal();
        let depthCal = this.mapManager.getDepthCal();
        let allPromises = [];
        let nt = 0;
        let points = this.mapManager.getLayers('pointsLayer');
        let pixels = this.mapManager.getLayers('pixelsLayer');
        let arNvol = [];
        let unit = this.mapManager.getUnitCal();

        polygon._configuration.stats = polygon._configuration.stats || {};
        polygon._configuration.stats.area_px = area_px;
        polygon._configuration.stats[`area_cal_${unit}^2`] = areaCal;
        polygon._configuration.stats[`volume_cal_${unit}^3`] = volumeCal;
        arNvol.push(`area_cal_${unit}^2`);
        arNvol.push(`volume_cal_${unit}^3`);

        points.map((point) => {
            let task = new PointsCounting(polygon, point, size);
            TaskManager.addTask(task);
            let promise = new Promise((resolve) => {
                task.run((m) => {
                    polygon._configuration.stats[point.name] = m.N;
                    resolve();
                });
            });
            allPromises.push(promise);
        });

        pixels.map((pixel) => {
            let task = new PixelsCounting(polygon, pixel, size);
            TaskManager.addTask(task);
            let promise = new Promise((resolve) => {
                task.run((m) => {
                    let sc = (sizeCal * sizeCal) / (pixel.size * pixel.size);
                    let label;
                    let value;
                    switch (pixel.role) {
                        case 'holes':
                            polygon._configuration.stats[`${pixel.name}_holes_area_${unit}^2`] = m.sumNorm * sc;
                            polygon._configuration.stats[`${pixel.name}_holes_volume_${unit}^3`] = m.sumNorm * sc * depthCal;
                            polygon._configuration.stats[`area_cal_minus_holes_${pixel.name}_${unit}^2`] = (m.N - m.sumNorm) * sc;
                            polygon._configuration.stats[`volume_cal_minus_holes_${pixel.name}_${unit}^3`] = (m.N - m.sumNorm) * sc * depthCal;
                            arNvol.push(`area_cal_minus_holes_${pixel.name}_${unit}^2`);
                            arNvol.push(`volume_cal_minus_holes_${pixel.name}_${unit}^3`);
                            break;
                        case 'area':
                            polygon._configuration.stats[`${pixel.name}_area_${unit}^2`] = m.sumNorm * sc;
                            polygon._configuration.stats[`${pixel.name}_volume_${unit}^3`] = m.sumNorm * sc * depthCal;
                            arNvol.push(`${pixel.name}_area_${unit}^2`);
                            arNvol.push(`${pixel.name}_area_${unit}^2`);
                            break;
                        case 'density':
                            polygon._configuration.stats[`${pixel.name}_density`] = m.sumNorm;
                            break;
                        case 'probability':
                            polygon._configuration.stats[`${pixel.name}_probability`] = m.meanNorm;
                            break;
                        default:
                            polygon._configuration.stats[`${pixel.name}_${pixel.role}`] = m[pixel.role] || m.sumNorm;
                    }
                    resolve();
                });
            });
            allPromises.push(promise);
        });

        Promise.all(allPromises).then(() => {
            points.map((point) => {
                arNvol.map((label) => {
                    polygon._configuration.stats[`density_${point.name}_over_${label}`] = polygon._configuration.stats[point.name] / polygon._configuration.stats[label];
                });
            });

        });
    }



}


class PointsCounting extends Task {

    constructor(polygon, points, size) {
        let name = `Points counting`;
        let details = `Counting in ${polygon._configuration.name} using ${points.name}`;
        let scale = points.size / size;
        super(name, details, gui);
        this.polygon = extractPolygonArray(polygon.getLatLngs(), scale);
        this.points = points;
    }

    run(callback) {
        super.run();
        let pol = this.polygon;
        let ch = fork(`${__dirname}/childCount.js`);
        ch.on('message', (m) => {
            switch (m.x) {
                case 'complete':
                    if (typeof callback === 'function') callback(m);
                    ch.kill();
                    this.success();
                    break;
                case 'step':
                    this.updateProgress((m.prog / m.tot) * 100);
                    break;
                case 'error':
                    this.fail(m.error + "error");
                    ch.kill();
                    break;
                default:
                    null
            }
        });
        ch.send({
            job: 'points',
            polygon: pol,
            points: this.points
        });
        this.childProcess = ch;
    }

    cancel() {
        if (super.cancel()) {
            if (this.childProcess instanceof ChildProcess) {
                this.childProcess.kill();
            }
            return true;
        }
        return false;
    }
}


class PixelsCounting extends Task {

    constructor(polygon, pixels, size) {
        let name = `Pixels counting`;
        let details = `counting ${polygon._configuration.name} using ${pixels.name}`;
        let scale = pixels.size / size;
        super(name, details, gui);
        this.polygon = extractPolygonArray(polygon.getLatLngs(), scale);;
        this.pixels = pixels;
    }

    run(callback) {
        super.run();
        let scale = this.scale;
        let pol = this.polygon;
        let ch = fork(`${__dirname}/childCount.js`);
        ch.on('message', (m) => {
            switch (m.x) {
                case 'complete':
                    if (typeof callback === 'function') callback(m);
                    ch.kill();
                    this.success();
                    break;
                case 'step':
                    this.updateProgress((m.prog / m.tot) * 100);
                    //this.gui.notify(`${(m.prog / m.tot) * 100}%`);
                    break;
                case 'error':
                    this.fail(m.error + "error");
                    //this.gui.notify(m.error + "error");
                    ch.kill();
                    break;
                default:
                    null
            }
        });
        ch.send({
            job: 'pixels',
            polygon: pol,
            pixels: this.pixels
        });
        this.childProcess = ch;
    }

    cancel() {
        if (super.cancel()) {
            if (this.childProcess instanceof ChildProcess) {
                this.childProcess.kill();
            }
            return true;
        }
        return false;
    }

}

function extractPolygonArray(polygon, scale) {
    if (!scale) {
        scale = 1;
    }
    //convert latlngs to a vector of coordinates
    var vs = polygon[0].map(function(ltlng) {
        return ([ltlng.lng * scale, -ltlng.lat * scale])
    });

    return vs;
}


module.exports = RegionAnalyzer;
