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
  ButtonsContainer,
  input
} = require('electrongui');

const {
  Menu,
  MenuItem,
} = require('electron').remote;


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

/**
 * Shows a modal to add a new csvTile layer
 */
function modalcsvlayer(cl) {
  let body = util.div('cell-container');
  let name = input.input({
    id: 'namenewlayer',
    type: 'text',
    label: '',
    className: 'cell form-control',
    placeholder: 'name',
    parent: body,
    value: ''
  });
  let url = input.input({
    id: 'urlnewlayer',
    type: 'text',
    label: '',
    className: 'cell form-control',
    placeholder: 'tiles url template',
    parent: body,
    value: '',
    oncontextmenu: (inp, e) => {
      let menu = Menu.buildFromTemplate([{
        label: 'Local file/directory',
        click: () => {
          dialog.showOpenDialog({
            properties: [
              'openFile',
              'openDirectories'
            ]
          }, (filepaths) => {
            inp.value = filepaths[0];
          });
        }
      }]);
      menu.popup();
    }
  });
  let tileSize = input.input({
    id: 'tilesizenewlayer',
    type: 'text',
    label: '',
    className: 'cell form-control',
    placeholder: 'tile size',
    parent: body,
    value: ''
  });
  let size = input.input({
    id: 'sizenewlayer',
    type: 'text',
    label: '',
    className: 'cell form-control',
    placeholder: 'size',
    parent: body,
    value: ''
  });
  let bounds = input.input({
    id: 'boundsnewlayer',
    type: 'text',
    label: '',
    className: 'cell form-control',
    placeholder: 'bounds [[lat,lng],[lat,lng]]',
    parent: body,
    value: ''
  });
  let minz = input.input({
    id: 'minzoomnewlayer',
    type: 'number',
    label: '',
    className: 'cell form-control',
    placeholder: 'minZoom',
    parent: body,
    value: 0
  });
  let maxz = input.input({
    id: 'maxzoomnewlayer',
    type: 'number',
    label: '',
    className: 'cell form-control',
    placeholder: 'maxZoom',
    parent: body,
    value: 10
  });
  let localRS = true;
  input.checkButton({
    id: 'localRSnewlayer',
    parent: body,
    text: 'localRS',
    className: 'cell',
    active: true,
    ondeactivate: (btn) => {
      localRS = false;
    },
    onactivate: (btn) => {
      localRS = true;
    }
  });

  let grid = true;
  input.checkButton({
    id: 'gridnewlayer',
    parent: body,
    text: 'grid',
    className: 'cell',
    active: true,
    ondeactivate: (btn) => {
      grid = false;
    },
    onactivate: (btn) => {
      grid = true;
    }
  });

  (new Modal({
    title: 'Add a csvTiles',
    body: body,
    width: '200px',
    onsubmit: () => {
      cl({
        name: name.value,
        type: 'csvTiles',
        urlTemplate: url.value,
        options: {
          tileSize: JSON.parse(tileSize.value || 256) || 256,
          size: JSON.parse(size.value || 256) || 256,
          bounds: JSON.parse(size.bounds || "[[-256,0],[0,256]]"),
          minZoom: minz.value,
          maxZoom: maxz.value,
          localRS: localRS
        }
      });
    }
  })).show();
}


/**
 * Shows a modal to add a new TileLayer
 */
function modaltilelayer(cl) {
  let body = util.div('cell-container');
  let attribution = null;
  let name = input.input({
    id: 'namenewlayer',
    type: 'text',
    label: '',
    className: 'cell form-control',
    placeholder: 'name',
    parent: body,
    value: ''
  });
  let url = input.input({
    id: 'urlnewlayer',
    type: 'text',
    label: '',
    className: 'cell form-control',
    placeholder: 'tiles url template (right click for help)',
    parent: body,
    oninput: (inp) => {
      if (inp.value.includes('{level}')) {
        lC.show()
      } else {
        lC.hide()
      }
    },
    oncontextmenu: (inp, e) => {
      let menu = Menu.buildFromTemplate([{
        label: 'Local file/directory',
        click: () => {
          dialog.showOpenDialog({
            properties: [
              'openFile',
              'openDirectories'
            ]
          }, (filepaths) => {
            inp.value = filepaths[0];
          });
        }
      }, {
        label: 'Base layers',
        submenu: [{
          label: 'Wikimedia Maps',
          click: () => {
            inp.value = 'https://maps.wikimedia.org/osm-intl/{z}/{x}/{y}.png'
            tileSize.value = 256;
            name.value = name.value || 'Wikimedia Maps',
              attribution = 'Wikimedia maps | &copy;<a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>';
          }
        }, {
          label: 'OpenStreetMap Standard',
          click: () => {
            inp.value = 'http://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
            tileSize.value = 256;
            name.value = name.value || 'OpenStreetMap Standard';
            attribution = '&copy;<a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>';
          }
        }]
      }, {
        label: 'Overlay',
        submenu: [{
          label: 'OpenSkyMap',
          click: () => {
            inp.value = 'http://tiles.skimap.org/openskimap/{z}/{x}/{y}.png'
            tileSize.value = 256;
            name.value = name.value || ' OpenSkyMap';
            b.classList.remove('active');
            b.innerHTML = 'overlay';
            base = false;
          }
        }]
      }]);
      menu.popup();
    },
    value: ''
  });
  let tileSize = input.input({
    id: 'tilesizenewlayer',
    type: 'text',
    label: '',
    className: 'cell form-control',
    placeholder: 'tileSize',
    parent: body,
    value: ''
  });
  let minz = input.input({
    id: 'minzoomnewlayer',
    type: 'number',
    label: '',
    className: 'cell form-control',
    placeholder: 'minZoom',
    parent: body,
    value: 0
  });
  let maxz = input.input({
    id: 'maxzoomnewlayer',
    type: 'number',
    label: '',
    className: 'cell form-control',
    placeholder: 'maxZoom',
    parent: body,
    value: 10
  });
  let base = true;
  let b = input.checkButton({
    id: 'basenewlayer',
    parent: body,
    text: 'base layer',
    className: 'cell form-control',
    active: true,
    ondeactivate: (btn) => {
      base = false;
      btn.innerHTML = 'overlay';
    },
    onactivate: (btn) => {
      base = true;
      btn.innerHTML = 'base layer';
    }
  })
  let lC = new ToggleElement(util.div('cell-container'))
  let minl = input.input({
    id: 'minzoomnewlayer',
    type: 'number',
    label: '',
    className: 'cell form-control',
    placeholder: 'minLevel',
    parent: lC,
    value: 0
  })
  let maxl = input.input({
    id: 'maxzoomnewlayer',
    type: 'number',
    label: '',
    className: 'cell form-control',
    placeholder: 'maxLevel',
    parent: lC,
    value: 0
  })
  lC.hide().appendTo(body)
    (new Modal({
      title: 'Add a tileLayer',
      body: body,
      width: '200px',
      onsubmit: () => {
        cl({
          name: name.value,
          type: 'tileLayer',
          tilesUrlTemplate: url.value,
          baseLayer: base,
          mulitLevel: url.includes('{level}'),
          options: {
            tileSize: JSON.parse(tileSize.value || 256) || 256,
            minNativeZoom: minz.value,
            maxNativeZoom: maxz.value,
            minZoom: minz.value,
            maxZoom: maxz.value,
            minLevel: 0,
            maxLevel: 10
            attribution: attribution
          }
        })
      }
    })).show()
}

/**
 * Show a modal to add a new guide layer
 */
function modalGuideLayer(cl) {
  let body = util.div('cell-container');
  let name = input.input({
    id: 'namenewlayer',
    type: 'text',
    label: '',
    className: 'cell form-control',
    placeholder: 'name',
    parent: body,
    value: ''
  });
  let size = input.input({
    id: 'sizenewlayer',
    type: 'number',
    label: '',
    className: 'cell form-control',
    placeholder: 'size',
    parent: body,
    value: ''
  });
  let tilesize = input.input({
    id: 'tilesizenewlayer',
    type: 'number',
    label: '',
    className: 'cell form-control',
    placeholder: 'tilesize',
    parent: body,
    value: ''
  });

  (new Modal({
    title: 'Add a tileLayer',
    body: body,
    width: '200px',
    onsubmit: () => {
      cl({
        name: name.value || 'guide',
        type: 'guideLayer',
        size: JSON.parse(size.value) || 256,
        tileSize: JSON.parse(tilesize.value) || 256
      });
    }
  })).show();
}



/**
 * Create new empty map, it shows a modal to select the name
 */
function createMap(cl) {
  let body = util.div();
  let name = input.input({
    id: 'newmapname-modal',
    parent: body,
    value: '',
    autofocus: true,
    label: '',
    className: 'form-control',
    width: '100%',
    placeholder: 'new map name',
    title: 'new map name',
    type: 'text'
  });
  let modal = new Modal({
    title: 'choose a name for the new map',
    width: 'auto',
    height: 'auto',
    parent: gui.extensions.MapExtension,
    onsubmit: () => {
      let conf = baseConfiguration();
      conf.name = name.value;
      cl(conf);
    },
    oncancel: () => {}
  });

  modal.addBody(body);
  modal.show();

}





exports.exportConfiguration = exportConfiguration;
exports.saveAs = saveAs;
exports.parseLayer = parseLayer;
exports.parseMap = parseMap;
exports.loadMap = loadMap;
exports.loadMapFile = loadMapfromFile;
exports.baseConfiguration = baseConfiguration;
exports.basePath = basePath;
exports.modal = {
  guideLayer: modalGuideLayer,
  tileLayer: modaltilelayer,
  csvTiles: modalcsvlayer,
  createMap: createMap
}
