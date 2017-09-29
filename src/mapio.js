// Copyright (c) 2016 Gherardo Varando
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.

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


function loadMap(filename, next) {
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
      configuration.basePath = basePath(configuration, filename);
      configuration = parseMap(configuration);
      configuration.new = true;
      configuration = Object.assign(baseConfiguration(), configuration);
      if (typeof next === 'function') {
        next(configuration);
      }
    }
  });
}

function loadMapfromUrl() {
  let modal = new Modal();

}

function loadMapfromFile(cl) {
  dialog.showOpenDialog({
    title: "Select a configuration file",
    properties: ['openFile'],
    filters: [{
      name: 'Configuration file',
      extensions: ['mapconfig', 'json']
    }]
  }, (filename) => {
    if (filename) {
      loadMap(filename[0], cl);
    }
  });
}

function baseConfiguration() {
  return {
    type: 'map',
    name: 'new map',
    authors: os.userInfo().username,
    date: (new Date()).toDateString(),
    layers: {},
    basePath: ''
  };
}

function basePath(configuration, filename) {
  if (configuration) {
    if (configuration.basePath) {
      let ch = dialog.showMessageBox({
        type: "question",
        buttons: ['yes', 'no'],
        title: 'Base path',
        message: 'redefine the basePath ? ',
        detail: `current basePath: ${configuration.basePath}, if redefined it will point to local directory ${filename.substr(0, filename.lastIndexOf(path.sep) + 1)}`
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

function findConfigurationSync(dir, name) {
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
      if (files[f].endsWith(".config")) {
        if (files[f].includes(name)) return util.readJSONsync(dir + files[f]);
        options.push(files[f]);
      }
    }
  }
  if (options.length >= 1) {
    return util.readJSONsync(dir + options[0]);
  } else {
    return {};
  }
}


function parseMap(configuration) {
  let indx = 0;
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
  let tile = configuration.tielLayers;
  let points = configuration.pointsLayers;
  let pixels = configuration.pixelsLayers;
  let guide = configuration.guideLayers;
  let grid = configuration.gridLayers;
  let polygons = configuration.polygons;
  let regions = configuration.regions;
  let alls = {
    layers,
    tiles,
    tile,
    points,
    pixels,
    guide,
    grid,
    polygons,
    regions
  }

  configuration.layers = {};
  for (var a in alls) {
    for (var lay in alls[a]) {
      if (typeof alls[a][lay] === 'string' || alls[a][lay] instanceof String) {
        // if lay is just a string we look at the corresponding folder to find the config file
        try {
          let c = findConfigurationSync(configuration.basePath + alls[a][lay] + path.sep, alls[a][lay]);
          c.name = c.name || `${c.type}_${indx++}`;
          configuration.layers[lay] = parseLayer(c);
        } catch (e) {
          throw e;
        }
      } else {
        // otherwise we assume lay is a configuration object
        let c = alls[a][lay];
        c.name = c.name || `${c.type}_${indx++}`;
        configuration.layers[lay] = parseLayer(c);
      }
    }
  }
  //now the layers configurations are stored in configuration.layers so we delete all the rest
  delete configuration.tilesLayers;
  delete configuration.tileLayers;
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


function parseLayer(config, basePath) {
  if (config.type == 'tilesLayer' || config.type == 'tileLayer') {
    config.type = 'tileLayer';
    config.tileUrlTemplate = config.tileUrlTemplate || config.tilesUrlTemplate || '';
    //config.tileUrlTemplate = basePath + config.tileUrlTemplate;
  }
  if (config.type.includes('pointsLayer')) {

  }
  if (config.type.includes('csvTiles')) {
    config.url = basePath + config.url;
  }
  if (config.type.includes('pixelsLayer')) {

  }
  if (config.type.includes('guideLayer')) {

  }
  if (config.type.includes('gridLayer')) {

  }
  if (config.type.includes('imageLayer')) {
    //config.url = basePath + config.url;
  }
  if (config.type.includes('drawnPolygons')) {
    config.type = 'featureGroup';
    if (config.polygons) {
      config.layers = config.polygons;
    } else {
      config.layers = {};
    }
  }
  if (config.type.includes('polygons')) {
    config.type = 'featureGroup';
    if (config.polygons) {
      config.layers = config.polygons;
    } else {
      config.layers = {};
    }
    Object.keys(config.layers).map((key) => {
      config.layers[key].type = config.layers[key].type || 'polygon';
    });
  }
  if (config.type.includes('drawnMarkers')) {
    config.type = 'featureGroup';
    config.layers = config.markers;
    Object.keys(config.layers).map((key) => {
      config.layers[key].type = config.layers[key].type || 'marker';
    });
  }
  //delete config.basePath; //because we joined all in the path
  return config;
}



function saveAs(configuration, cl, errcl) {
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
    exportConfiguration(configuration, fileName, cl);
  });
}




function exportConfiguration(configuration, dir, cl) {
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







exports.exportConfiguration = exportConfiguration;
exports.saveAs = saveAs;
exports.parseLayer = parseLayer;
exports.parseMap = parseMap;
exports.loadMap = loadMap;
exports.loadMapFile = loadMapfromFile;
exports.baseConfiguration = baseConfiguration;
exports.basePath = basePath;
