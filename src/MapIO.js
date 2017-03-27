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

const url = require('url');
const {
    app,
    dialog
} = require('electron').remote;
const path = require('path');
const os = require('os');
const fs = require('fs');
const {
  util,
  Modal,
  ButtonsContainer
} = require('electrongui');

class MapIO {
    constructor() {
        console.log('MapIO is just a container of static methods');
    }

    static loadMap(filename, next) {
        if (filename === undefined) return;
        fs.readFile(filename, 'utf-8', (err, data) => {
            if (err) {
                dialog.showErrorBox("Error", err.message);
                return;
            }
            let configuration = JSON.parse(data);
            configuration.type = configuration.type || 'undefined';
            let id = 2;
            if (!configuration.type.includes('map')) {
                id = dialog.showMessageBox({
                    title: 'Type "map" not specified in configuration file',
                    type: 'warning',
                    buttons: ['Cancel', 'Add anyway'],
                    message: `The type specified in the configuration is: ${configuration.type}`,
                    detail: `trying to add this map could result in an error`,
                    noLink: true
                });
            }
            if (id === 1) {
                configuration.type = 'map';
            }
            if (id >= 1) {
                configuration.basePath = MapIO.basePath(configuration, filename);
                configuration = MapIO.buildConfiguration(configuration);
                configuration.new = true;
                configuration = Object.assign(MapIO.baseConfiguration(), configuration);
                if (typeof next === 'function') {
                    next(configuration);
                }
            }
        });
    }

    static loadMapfromUrl() {
        let modal = new Modal();

    }

    static loadMapfromFile(cl) {
        dialog.showOpenDialog({
            title: "Select a configuration file",
            properties: ['openFile'],
            filters: [{
                name: 'Configuration file',
                extensions: ['mapconfig', 'json']
            }]
        }, (filename) => {
            if (filename) {
                MapIO.loadMap(filename[0], cl);
            }
        });
    }

    static baseConfiguration(options) {
        options = options || {};
        return {
            type: 'map',
            name: 'new map',
            authors: os.userInfo().username,
            date: (new Date()).toDateString(),
            layers: {},
            basePath: '',
            new: options.new
        };
    }

    static basePath(configuration, filename) {
        if (configuration) {
            if (configuration.basePath) {
                let ch = dialog.showMessageBox({
                    type: "question",
                    buttons: ['yes', 'no'],
                    title: 'Base path',
                    message: 'redefine the basePath ? ',
                    detail: `current basePath: ${configuration.basePath}, if redefined it will point to local directory`
                });
                if (ch === 1) {
                    return configuration.basePath;
                } else {
                    return filename.substr(0, filename.lastIndexOf(path.sep) + 1);
                }
            } else {
                if (filename) {
                    return filename.substr(0, filename.lastIndexOf(path.sep) + 1);
                } else {
                    return "";
                }
            }
        } else {
            if (filename) {
                return filename.substr(0, filename.lastIndexOf(path.sep) + 1);
            } else {
                return "";
            }
        }
    }

    static findConfigurationSync(dir, name) {
        let options = [];
        let files = fs.readdirSync(dir);
        if (files) {
            for (var f in files) {
                if (files[f].endsWith(".layerconfig")) {
                    if (files[f].includes(name)) return util.readJSONsync(dir + files[f]);
                    options.push(files[f]);
                }
                if (files[f].endsWith(".json")) {
                    if (files[f].includes(name)) return util.readJSONsync(dir + files[f]);
                    options.push(files[f]);
                }
                if (files[f].endsWith(".mapconfig")) {
                    if (files[f].includes(name)) return util.readJSONsync(dir + files[f]);
                    options.push(files[f]);
                }
            }
        }
        if (options.length == 1) {
            return util.readJSONsync(dir + options[0]);
        } else {
            if (options.length == 0) {
                return;
            } else {
                return util.readJSONsync(dir + options[0]);
            }
        }
    }


    static buildConfiguration(configuration) {


        if (configuration.basePath) {
            if (configuration.basePath.startsWith('http')) {
                configuration.source = 'remote';
            }
            if (configuration.basePath.startsWith('/home')) {
                configuration.source = 'local';
            }
            if (configuration.basePath.startsWith('file://')) {
                configuration.source = 'local';
            }
            if (configuration.basePath.startsWith('C:')) {
                configuration.source = 'local';
            }
        }
        configuration.source = configuration.source || 'local';
        let layers = configuration.layers;
        let tiles = configuration.tilesLayers;
        let points = configuration.pointsLayers;
        let pixels = configuration.pixelsLayers;
        let guide = configuration.guideLayers;
        let grid = configuration.gridLayers;
        let polygons = configuration.polygons;
        let regions = configuration.regions;

        let alls = {
            layers,
            tiles,
            points,
            pixels,
            guide,
            grid,
            polygons,
            regions
        }

        //configuration._name = 'map';
        //util.setOne(configuration, 'name', 'NAME', 'Name', 'title', 'TITLE', 'Title', '_name');
        //configuration._auth = 'Unknown';
        //util.setOne(configuration, 'authors', 'AUTHORS', 'auth', 'AUTH', 'Authors', 'AUTHS', 'auth', 'author', 'AUTHOR', 'Author', '_auth');

        configuration.layers = {};
        let id = 0; //use a unique id for every layer
        for (var a in alls) {
            for (var lay in alls[a]) {
                if (typeof alls[a][lay] === 'string' || alls[a][lay] instanceof String) {
                    // if lay is just a string we look at the corresponding folder to find the config file
                    try {
                        let c = MapIO.findConfigurationSync(configuration.basePath + alls[a][lay] + path.sep, alls[a][lay]);
                        c.id = id;
                        id++;
                        c.basePath = c.basePath || (configuration.basePath + alls[a][lay] + path.sep);
                        configuration.layers[c.name || id] = MapIO.parseLayerConfig(c);
                    } catch (e) {
                        throw e;
                    }
                } else {
                    // otherwise we assume lay is a configuration object
                    let c = alls[a][lay];
                    c.id = id;
                    id++;
                    c.basePath = c.basePath || configuration.basePath;
                    configuration.layers[c.name || id] = MapIO.parseLayerConfig(c);
                }
            }
        }
        //now the layers configurations are stored in configuration.layers so we delete all the rest
        delete configuration.tilesLayers;
        delete configuration.pointsLayers;
        delete configuration.pixelsLayers;
        delete configuration.author;
        delete configuration.guideLayers;
        delete configuration.gridLayers;
        delete configuration.polygons;
        delete configuration.regions

        //return the clean configuration
        return configuration;
    }


    static parseLayerConfig(config) {
        config._type = 'tilesLayer';
        config._name = `new ${config.type}`;
        // util.setOne(config, 'authors', ['author', 'AUTHORS', 'AUTHOR', 'auth', 'AUTH']);
        // util.setOne(config, 'name', ['NAME', 'title', 'TITLE', '_name']);
        // util.setOne(config, 'type', ['TYPE', 'layerType', 'layertype', '_type']);
        // util.setOne(config, 'source', ['SOURCE', 'Source']);
        // util.setOne(config, 'size', ['SIZE', 'Size', 'dim', 'DIM', 'Dim']);
        config.alias = config.alias || config.name;
        config.attribution = config.attribution || '@gherardo.varando';
        config.basePath = config.basePath || '';


        if (config.type.includes('tilesLayer')) {
            config.type = 'tileLayer';
            config.tilesUrlTemplate = config.tilesUrlTemplate || '';
            if (config.tilesUrlTemplate.startsWith("http:") ||
                config.tilesUrlTemplate.startsWith("file:") ||
                config.tilesUrlTemplate.startsWith("https:") ||
                path.isAbsolute(config.tilesUrlTemplate)) {
                config.basePath = '';
            }
            if (config.tilesUrlTemplate.includes(config.basePath)) {
                config.basePath = '';
            }
            config.tilesUrlTemplate = path.join(config.basePath, config.tilesUrlTemplate); //join basepath and tilesUrltemplate

            config.maxZoom = Number(config.maxZoom) || 0;
            config.minZoom = Number(config.minZoom) || 0;
            config.maxNativeZoom = Number(config.maxNativeZoom) || 0;
            config.minNativeZoom = Number(config.minNativeZoom) || 0;
            config.errorTileUrl = config.errorTileUrl || '';
            config.noWrap = config.noWrap || true;
            config.zoomOffset = Number(config.zoomOffset) || 0;
            config.zoomReverse = config.zoomReverse || false;
            config.opacity = Math.min(1, Math.max(0, Number(config.opacity || 1)));
            config.tileSize = config.tileSize || 256;
            config.size = Math.max(1, Number(config.size || config.tileSize || 256));
            config.sizeCal = config.sizeCal || config.size || 256;
            config.depthCal = config.depthCal || 1;
            config.unitCal = config.unitCal || 'u';

            if (Array.isArray(config.tileSize)) {
                config.bounds = config.bounds || [
                    [-Math.floor(Number(config.tileSize[1])), 0],
                    [0, Math.floor(Number(config.tileSize[0]))]
                ];
            } else if (typeof config.tileSize === 'number' || typeof config.tileSize === 'string') {
                config.bounds = config.bounds || [
                    [-Math.floor(config.tileSize) || -256, 0],
                    [0, Math.floor(config.tileSize) || 256]
                ];
            } else { // it is an object
                config.bounds = config.bounds || [
                    [-Math.floor(config.tileSize.x) || -256, 0],
                    [0, Math.floor(config.tileSize.y) || 256]
                ]
            }

            config.previewImageUrl = (config.tilesUrlTemplate).replace('{x}', '0').replace('{y}', '0').replace('{z}', '0').replace('{s}', 'a');

            if (config.customKeys) {
                for (let k in config.customKeys) {
                    config.previewImageUrl = config.previewImageUrl.replace(`{${k}}`, `${config.customKeys[k][0]}`);
                    config[k] = `${config.customKeys[k][0]}`;
                }
            }

        }
        if (config.type.includes('pointsLayer')) {
            config.previewImageUrl = `${app.getAppPath()}${path.sep}images${path.sep}points.png`;
            config.pointsUrlTemplate = config.pointsUrlTemplate || '';
            config.excludeCF = config.excludeCF || false;
            if (config.pointsUrlTemplate.startsWith("http:") ||
                config.pointsUrlTemplate.startsWith("file:") ||
                config.pointsUrlTemplate.startsWith("https:") ||
                path.isAbsolute(config.pointsUrlTemplate)) {
                config.basePath = '';
            }
            if (config.pointsUrlTemplate.startsWith(config.basePath)) {
                config.basePath = '';
            }
            config.pointsUrlTemplate = config.basePath + config.pointsUrlTemplate;
            config.__color = 'red';
            //util.setOne(config, 'color', ['COLOR', 'Color', '__color']);

        }
        if (config.type.includes('pixelsLayer')) {
            config.previewImageUrl = path.join(app.getAppPath(), 'images', 'points.png');
            config.pixelsUrlTemplate = config.pixelsUrlTemplate || '';
            if (config.pixelsUrlTemplate.startsWith("http:") ||
                config.pixelsUrlTemplate.startsWith("file:") ||
                config.pixelsUrlTemplate.startsWith("https:") ||
                path.isAbsolute(config.pixelsUrlTemplate)) {
                config.basePath = '';
            }
            if (config.pixelsUrlTemplate.startsWith(config.basePath)) {
                config.basePath = '';
            }
            config.norm = config.norm || 1;
            config.role = config.role || 'area';
            config.pixelsUrlTemplate = config.basePath + config.pixelsUrlTemplate;
        }
        if (config.type.includes('guideLayer')) {
            config.previewImageUrl = path.join(app.getAppPath(), 'images', 'grid.png');
            config.__color = 'blue';
            //util.setOne(config, 'color', ['COLOR', 'Color', '__color']);
        }
        if (config.type.includes('gridLayer')) {
            config.previewImageUrl = path.join(app.getAppPath(), 'images', 'grid.png');
            config.__color = 'blue';
            //util.setOne(config, 'color', ['COLOR', 'Color', '__color']);
        }
        if (config.type.includes('imageLayer')) {
            config.imageUrl = config.imageUrl || '';
            if (config.imageUrl.startsWith("http:") ||
                config.imageUrl.startsWith("file:") ||
                config.imageUrl.startsWith("https:") ||
                path.isAbsolute(config.imageUrl)) {
                config.basePath = '';
            }
            if (config.imageUrl.includes(config.basePath)) {
                config.basePath = '';
            }
            config.imageUrl = path.join(config.basePath, config.imageUrl);
            config.previewImageUrl = config.imageUrl;

        }
        if (config.type.includes('drawnPolygons')) {
            config.previewImageUrl = path.join(app.getAppPath(), 'images', 'regions.png');
        }
        if (config.type.includes('polygons')) {
            config.previewImageUrl = path.join(app.getAppPath(), 'images', 'regions.png');
        }
        //delete config.basePath; //because we joined all in the path
        return config;
    }



    static createMap(cl) {
        cl(MapIO.baseConfiguration({
            new: true
        }));
    }


    static saveAs(configuration, cl, errcl) {
        dialog.showSaveDialog({
            title: `Save ${configuration.name} map`,
            filters: [{
                name: 'JSON',
                extensions: ['json']
            }, {
                name: 'mapconfig',
                extensions: ['mapconfig']
            }]
        }, (fileName) => {
            if (fileName === undefined) {
                if (typeof 'errcl' === 'function') {
                    errcl(configuration);
                }
                return;
            }
            MapIO.exportConfiguration(configuration, fileName, cl);
        });
    }




    static exportConfiguration(configuration, dir, cl) {
        try {
            if (typeof dir === 'string') {
                let basePath = dir.replace(path.basename(dir), "");
                let conf = JSON.parse(JSON.stringify(configuration)); //clone configuration object
                Object.keys(conf.layers).map((key) => {
                    let l = conf.layers[key];
                    switch (l.type) { //remove the base path from the url of the layers
                        case "tilesLayer":
                            l.tilesUrlTemplate = l.tilesUrlTemplate.replace(basePath, "");
                            break;
                        case "pointsLayer":
                            l.pointsUrlTemplate = l.pointsUrlTemplate.replace(basePath, "");
                            break;
                        case "pixelsLayer":
                            l.pixelsUrlTemplate = l.pixelsUrlTemplate.replace(basePath, "");
                            break;
                        case "imageLayer":
                            l.imageUrl = l.imageUrl.replace(basePath, "");
                            break;
                        default:
                    }
                    delete l.basePath; //delete the base path from layer configuration if present (should not be)
                    delete l.previewImageUrl //delete the previewImageUrl it will be created again from the tiles url
                    return l;
                });
                if (conf.source === 'local') {
                    delete conf.basePath; //delete the base path from the map configuration (in this way it will be created again when the map will be loaded)
                }
                let content = JSON.stringify(conf);
                fs.writeFile(dir, content, (error) => {
                    if (error) {
                        util.notifyOS(error);
                    } else {
                        util.notifyOS(`Map ${configuration.map} saved in ${dir}`);
                    }
                    if (typeof cl === 'function') {
                        cl(configuration, dir, error);
                    }
                });
            }
        } catch (e) {
            util.notifyOS(e);
        }
    }





}


module.exports = MapIO;
