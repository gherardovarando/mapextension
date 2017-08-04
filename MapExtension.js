// Copyright (c) 2017 Gherardo Varando
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

"use strict";

const {
  SplitPane,
  Modal,
  Grid,
  Workspace,
  Sidebar,
  ListGroup,
  TabGroup,
  ToggleElement,
  GuiExtension,
  ButtonsContainer,
  util,
  input,
  FlexLayout,
  gui
} = require('electrongui');
const sizeOf = require('image-size');
const RegionAnalyzer = require('./src/RegionAnalyzer.js');
const ConvertTiff = require('tiff-to-png');
const json2csv = require('json2csv');
const fs = require('fs');
const mapio = require('./src/mapio.js');
const LayersControl = require('./src/LayersControl.js');

const JSONEditor = require('jsoneditor');
const leaflet = require('leaflet');
const leafletMarkerCluster = require('leaflet.markercluster');
window.Papa = require('papaparse'); //we have to define Papa as a global object
const leafletcsvtiles = require('leaflet-csvtiles');
const geometryutil = require('leaflet-geometryutil');
const leafletDraw = require('leaflet-draw');
require('leaflet-multislice');
const snap = require(`leaflet-snap`);
const mapBuilder = require('leaflet-map-builder');
const isDev = require('electron-is-dev');
const {
  ipcRenderer
} = require('electron');
const {
  dialog,
  Menu,
  MenuItem,
  globalShortcut,
  app
} = require('electron').remote;
const icon = 'fa fa-map';
const CRSs = {
  simple: L.CRS.Simple,
  EPSG3395: L.CRS.EPSG3395,
  EPSG3857: L.CRS.EPSG3857,
  EPSG4326: L.CRS.EPSG4326
};
const layerTypes = ['tileLayer', 'tileLayerWMS', 'imageOverlay', 'guideLayer', 'csvTiles', 'featureGroup', 'layerGroup'];
const drawObjects = ['marker', 'polygon', 'rectangle', 'polyline', 'circle'];



class MapExtension extends GuiExtension {

  constructor() {
    super({
      icon: icon,
      author: 'gherardo varando (gherardo.varando@gmail.com)',
      menuLabel: 'Maps',
      menuTemplate: [{
        label: 'Show',
        click: () => this.toggle(),
        accelerator: 'Alt + M '
      }, {
        label: 'Show configuration',
        click: () => {
          if (!this._settings.expert) {
            dialog.showErrorBox('You are no expert', 'You should enable expert mode in Maps->settings');
          } else {
            this.mapPane.toggleBottom();
          }
        },
        accelerator: 'CommandOrControl + P'
      }, {
        label: 'Reload map',
        click: () => {
          if (this.mapBuilder instanceof L.MapBuilder) {
            this.mapBuilder.reload();
          }
        }
      }, {
        type: 'separator'
      }, {
        label: 'Load map',
        click: () => {
          mapio.loadMapFile((conf) => {
            this.addNewMap(conf);
          });
        }
      }, {
        label: 'Create map',
        click: () => {
          this.createMap();
        }
      }, {
        label: 'Export map',
        click: () => {
          mapio.saveAs(this.mapBuilder.getConfiguration(), (c, p, e) => {
            gui.notify(`${c.name} map saved in ${p}`);
          }, (err) => {
            gui.notify(err);
          });
        },
      }, {
        type: 'separator'
      }, {
        label: 'Add layer',
        type: 'submenu',
        submenu: [{
          label: 'File',
          click: () => {
            if (!this._isLoaded) {
              gui.notify('First load or create a map');
              return;
            }
            this.openLayerFile();
          }
        }, {
          label: 'Tiles Url',
          click: () => {
            if (!this._isLoaded) {
              gui.notify('First load or create a map');
              return;
            }
            this._modaltilelayer();
          }
        }, {
          label: 'Guide',
          click: () => {
            if (!this._isLoaded) {
              gui.notify('First load or create a map');
              return;
            }
            this._modalGuideLayer();
          }
        }]
      }, {
        label: "Settings",
        click: () => {
          this._setSettings();
        }
      }]
    });
    this._settings = {
      multiRegionSelect: true,
      multiMarkerSelect: false,
      crs: 'simple',
      zoomControl: false,
      tooltip: true,
      popup: true,
      multislice: true,
      sliceControl: true,
      zoomSnap: 1,
      zoomDelta: 1,
      expert: isDev
    }
    this.maps = {};
    this.activeConfiguration = null;
    this._indx = 0;
  }

  show() {
    super.show();
    gui.viewTrick();
  }

  activate() {
    this.appendMenu();
    this.addToggleButton({
      id: this.constructor.name,
      buttonsContainer: gui.header.actionsContainer,
      icon: icon,
      groupId: this.constructor.name
    });
    //add the sidebars
    this.sidebar = new Sidebar(this.element, {
      className: 'pane-sm scrollable'
    });
    this.sidebar.flexLayout = new FlexLayout(this.sidebar.element, FlexLayout.Type.VERTICAL, 60);
    this.layersControl = new LayersControl(this.mapBuilder);
    let zc;
    if (this._settings.zoomControl) {
      zc = {
        position: 'topright'
      };
    } else {
      zc = false;
    }

    let options = {
      map: {
        zoomSnap: this._settings.zoomSnap,
        zoomDelta: this._settings.zoomDelta,
        crs: CRSs[this._settings.crs],
        zoomControl: false,
        multislice: this._settings.multislice,
        sliceControl: this._settings.sliceControl
      },
      builder: {
        dev: true,
        controls: {
          draw: {
            position: 'bottomleft',
            draw: {
              polyline: false,
              marker: true,
              polygon: {
                allowIntersection: false,
                shapeOptions: {
                  stroke: true,
                  color: "#ed8414",
                  weight: 4,
                  opacity: 1,
                  fill: true,
                  fillColor: null, //same as color by default
                  fillOpacity: 0.5,
                  clickable: true
                }
              },
              rectangle: {
                shapeOptions: {
                  stroke: true,
                  color: "#ed8414",
                  weight: 4,
                  opacity: 1,
                  fill: true,
                  fillColor: null, //same as color by default
                  fillOpacity: 0.5,
                  clickable: true
                }
              },
              circle: false
            },
            edit: {
              allowIntersection: false
            }
          },
          zoom: zc,
          layers: (layer, configuration, where) => {
            this.layersControl.addLayer(layer, configuration, where);
          }
        },
        tooltip: {
          polygon: this._settings.tooltip,
          rectangle: this._settings.tooltip,
          marker: this._settings.tooltip
        },
        popup: {
          marker: this._settings.popup,
          polygon: this._settings.popup,
          rectangle: this._settings.popup
        }
      }
    }
    this.sidebar.show();
    this.sidebar.flexLayout.appendToLastContainer(this.layersControl.layersWidget.element);

    this.mapsList = new ListGroup('mapslist');
    this.mapsList.addSearch({
      placeholder: 'Search maps'
    });

    this.sidebar.flexLayout.appendToFirstContainer(this.mapsList.element);

    this.sidebar.element.ondragover = (ev) => {
      ev.dataTransfer.dropEffect = "none";
      for (let f of ev.dataTransfer.files) {
        let regx = /(\.((json)|(mapconfig)))$/i;
        if (regx.test(f.name)) {
          ev.dataTransfer.dropEffect = "link";
          ev.preventDefault();
        }
      }
    };
    this.sidebar.element.ondrop = (ev) => {
      ev.preventDefault();
      for (let f of ev.dataTransfer.files) {
        let regx = /(\.((json)|(mapconfig)))$/i;
        if (regx.test(f.name)) {
          mapio.loadMap(f.path, (conf) => {
            this.addNewMap(conf);
          });
        }
      }
    };

    this.mapPane = new SplitPane(util.div());

    this.mapPane.top.ondragover = (ev) => {
      ev.dataTransfer.dropEffect = "none";
      for (let f of ev.dataTransfer.files) {
        let regx = /(\.((json)|(layerconfig)|(jpg)|(gif)|(csv)|(jpg)|(png)|(tif)|(tiff)))$/i;
        if (regx.test(f.name) && (this._isLoaded)) {
          ev.dataTransfer.dropEffect = "link";
          ev.preventDefault();
        }
      }
    };
    this.mapPane.top.ondrop = (ev) => {
      ev.preventDefault();
      for (let f of ev.dataTransfer.files) {
        let regx = /(\.((json)|(layerconfig)|(jpg)|(gif)|(csv)|(jpg)|(png)|(tif)|(tiff)))$/i;
        if (regx.test(f.name) && (this._isLoaded)) {
          this.addLayerFile(f.path);
        }
      }
    };
    this.appendChild(this.mapPane);
    this.mapPane.show();
    let mapCont = document.createElement('DIV');
    mapCont.style.width = '100%';
    mapCont.style.height = '100%';
    mapCont.style['z-index'] = 0;
    mapCont.id = options.id || 'map';
    this.mapPane.top.appendChild(mapCont);
    let map = L.map(options.id || 'map', options.map); //define map object
    this.map = map;

    let configDisplay = util.div('');
    configDisplay.style.width = '100%';
    configDisplay.style.height = '100%';
    let bar = util.div('top-bar');
    bar.innerHTML = "DANGER!! You can now edit directly the configuration of the selected map, you should do it just if you really knows what you are doing otherwise you could break the map and be unable to use it. To save the configuration press Ctrl + Enter";
    bar.oncontextmenu = () => {
      (Menu.buildFromTemplate(
        [{
          label: 'I am an expert...trust me',
          click: () => bar.style.display = 'none'
        }]
      )).popup();
    }
    configDisplay.appendChild(bar);
    this.configEditor = new JSONEditor(configDisplay, {
      modes: ['tree', 'code'],
      templates: [{
        text: 'Layer',
        title: 'Insert a Layer',
        field: 'NewLayer',
        value: {
          'type': 'layerType',
          'name': 'Layer Name',
          'options': {}
        }
      }],
      onEditable: (node) => {
        if (!node.field) return true;
        if (node.field.startsWith('_') || node.field == 'id') return false;
        return true;
      }
    });
    configDisplay.addEventListener('keyup', (e) => {
      if (e.key == 'Enter' && e.ctrlKey) {
        let conf = this.configEditor.get();
        Object.assign(this.maps[this.activeConfiguration._id], conf);
        this.mapBuilder.setConfiguration(this.maps[this.activeConfiguration._id]);
      }
    });
    this.mapPane.bottom.appendChild(configDisplay);

    this.mapBuilder = new L.MapBuilder(map, options.builder); //initialize the map builder
    this.mapBuilder.on('set:configuration', (e) => {
      this.activeConfiguration = e.configuration;
    });
    this.mapBuilder.on('clear', () => {
      this._isLoaded = false;
    });
    this.mapBuilder.on('reload', () => {
      this._isLoaded = true;
      this.configEditor.set(this.activeConfiguration);

    });
    this._drawEvents();
    this.layersControl.setBuilder(this.mapBuilder); //link the layerscontrol to the mapBuilder

    this.sidebarOverlay = new Sidebar(this.element, {
      className: 'pane-sm scrollable'
    });
    this.sidebarOverlay.show();

    this.sidebarOverlayTabGroup = new TabGroup(this.sidebarOverlay);
    this.sidebarOverlayTabGroup.addItem({
      id: `regions`,
      name: `Regions`
    });
    this.sidebarOverlayTabGroup.addItem({
      id: `markers`,
      name: `Markers`
    });

    this.sidebarOverlayTabGroup.addClickListener(`regions`, () => {
      this.layersControl.regionsWidget.show();
      this.layersControl.markersWidget.hide();
    });
    this.sidebarOverlayTabGroup.addClickListener(`markers`, () => {
      this.layersControl.markersWidget.show();
      this.layersControl.regionsWidget.hide();
    });
    this.sidebarOverlay.addList(this.layersControl.regionsWidget);
    this.sidebarOverlay.addList(this.layersControl.markersWidget);

    //this.regionAnalyzer = new RegionAnalyzer();


    if (gui.workspace instanceof Workspace) {
      gui.workspace.addSpace(this, this.maps);
      gui.workspace.on('load', () => {
        gui.notify('loading maps from workspace...');
        this.mapBuilder.clear();
        this.mapsList.clean();
        this.maps = {};
        let maps = gui.workspace.getSpace(this) || {};
        let tot = 0;
        Object.keys(maps).map((id, i) => {
          this.addNewMap(mapio.parseMap(maps[id]));
          tot++;
        });
        gui.workspace.addSpace(this, this.maps, true); //overwriting
        gui.notify(`${tot} maps from workspace loaded`);
      });
      //check if there is a mapPage space in the current workspace and retrive it, this is useful on deactivate/activate of mapPage
      if (gui.workspace.spaces.MapExtension) {
        this.mapBuilder.clear();
        this.mapsList.clean();
        this.maps = {};
        let maps = gui.workspace.getSpace(this);
        Object.keys(maps).map((id) => {
          this.addNewMap(mapio.parseMap(maps[id]));
        });
        gui.workspace.addSpace(this, this.maps, true); //overwriting
      }

    }
    super.activate();

  } //end activate


  deactivate() { /// the extension has to take care of removing all the buttons and element appended outside of the main extension pane
    this.mapBuilder.map.off(); //unbind all events
    this.removeToggleButton(this.constructor.name); //this is compulsory to leave the interface clean
    super.deactivate(); //we will also call the super class deactivate method
  }

  _setSettings() {
    let newSet = util.clone(this._settings);
    let needExtRel = false;
    let modal = new Modal({
      title: ``,
      width: '600px',
      height: 'auto',
      noCloseIcon: true,
      parent: this,
      onsubmit: () => {
        if (needExtRel) {
          this.deactivate();
          this.activate();
          this.show();
        }
      },
      oncancel: () => {
        if (needExtRel) {
          this.deactivate();
          this.activate();
          this.show();
        }
      }
    });
    let body = document.createElement('DIV');
    body.className = 'cellconteiner';


    let Kinterface = util.div('cell');
    Kinterface.style.width = '45%';
    body.appendChild(Kinterface);
    let tinterface = document.createElement('H4');
    tinterface.innerHTML = 'Interface';
    Kinterface.appendChild(tinterface);
    let cinterface = util.div('cellconteiner');
    Kinterface.appendChild(cinterface);

    let Kmap = util.div('cell');
    Kmap.style.width = '45%';
    body.appendChild(Kmap);
    let tmap = document.createElement('H4');
    tmap.innerHTML = 'Map';
    Kmap.appendChild(tmap);
    let cmap = util.div('cellconteiner');
    Kmap.appendChild(cmap);


    input.checkButton({
      parent: cinterface,
      autofocus: true, //needed to use esc and enter modal commands
      className: 'cell',
      active: this._settings.expert,
      text: "Expert mode",
      onactivate: () => {
        dialog.showErrorBox('You are an expert now', 'Alert mode enabled, press Ctrl + P to modify configuration');
        this._settings.expert = true;
      },
      ondeactivate: () => {
        this._settings.expert = false;
      }
    });
    input.checkButton({
      parent: cinterface,
      autofocus: true, //needed to use esc and enter modal commands
      className: 'cell',
      active: this._settings.multiRegionSelect,
      text: "Region multi select",
      onactivate: () => {
        this._settings.multiRegionSelect = true;
      },
      ondeactivate: () => {
        this._settings.multiRegionSelect = false;
      }
    });
    input.checkButton({
      parent: cinterface,
      className: 'cell',
      active: this._settings.multiMarkerSelect,
      text: "Marker multi select",
      onactivate: () => {
        this._settings.multiMarkerSelect = true;
      },
      ondeactivate: () => {
        this._settings.multiMarkerSelect = false;
      }
    });
    input.selectInput({
      parent: cmap,
      className: 'form-control cell',
      label: 'CRS',
      choices: Object.keys(CRSs),
      value: this._settings.crs,
      oninput: (inp) => {
        this._settings.crs = inp.value;
        needExtRel = true;
      }
    });
    input.checkButton({
      parent: cmap,
      className: 'cell',
      active: this._settings.zoomControl,
      text: "Zoom control",
      onactivate: () => {
        this._settings.zoomControl = true;
        needExtRel = true;
      },
      ondeactivate: () => {
        this._settings.zoomControl = false;
        needExtRel = true;
      }
    });
    input.checkButton({
      parent: cmap,
      className: 'cell',
      active: this._settings.multislice,
      text: "Multi slice",
      onactivate: () => {
        this._settings.multislice = true;
        needExtRel = true;
      },
      ondeactivate: () => {
        this._settings.multislice = false;
        needExtRel = true;
      }
    });
    input.checkButton({
      parent: cmap,
      className: 'cell',
      active: this._settings.tooltip,
      text: "Tooltip",
      onactivate: () => {
        this._settings.tooltip = true;
        needExtRel = true;
      },
      ondeactivate: () => {
        this._settings.tooltip = false;
        needExtRel = true;
      }
    });
    input.checkButton({
      parent: cmap,
      className: 'cell',
      active: this._settings.popup,
      text: "Popup",
      onactivate: () => {
        this._settings.popup = true;
        needExtRel = true;
      },
      ondeactivate: () => {
        this._settings.popup = false;
        needExtRel = true;
      }
    });

    modal.addBody(body);
    modal.show();
  }


  //
  addNewMap(configuration) {
    configuration._id = this._indx++;
    try {
      this.mapBuilder.setConfiguration(configuration);
    } catch (e) {
      // otherwise means that the builder is unable to load the map
      console.log(e);
      return;
    }
    let body = new ToggleElement(document.createElement('DIV'));

    let ic;
    switch (configuration.source) {
      case 'remote':
        ic = 'icon icon-network';
        break;
      case 'local':
        ic = '';
        break;
      case 'mixed':
        ic = '';
        break;
      default:
        ic = '';
    };

    let ctn = new Menu();
    ctn.append(new MenuItem({
      label: 'Export map',
      type: 'normal',
      click: () => {
        mapio.saveAs(this.maps[configuration._id], (c, p, e) => {
          gui.notify(`${c.name} map saved in ${p}`);
        }, (err) => {
          gui.notify(err);
        });
      }
    }));
    ctn.append(new MenuItem({
      label: 'Delete',
      type: 'normal',
      click: () => {
        dialog.showMessageBox({
          title: 'Delete Map?',
          type: 'warning',
          buttons: ['No', "Yes"],
          message: `Delete map ${this.maps[configuration._id].name}? (no undo available)`,
          noLink: true
        }, (id) => {
          if (id > 0) {
            if (this.activeConfiguration._id == configuration._id) {
              this.mapBuilder.clear();
              this.mapBuilder.setConfiguration({
                type: 'map'
              });
            }
            this.mapsList.removeItem(configuration._id);
            delete this.maps[configuration._id];
          }
        });

      }
    }));


    let title = document.createElement('STRONG');
    title.innerHTML = configuration.name;

    this.mapsList.addItem({
      id: configuration._id,
      title: title,
      key: `${configuration.name} ${configuration.date} ${configuration.authors}`,
      icon: ic,
      toggle: true,
      oncontextmenu: () => {
        ctn.popup();
      },
      onclick: {
        active: () => {
          this.mapsList.deactiveAll();
          this.mapsList.hideAllDetails();
          //this.mapsList.showDetails(configuration._id);
          this.mapBuilder.setConfiguration(configuration);
        },
        deactive: () => {
          this.mapsList.hideAllDetails();
          this.mapBuilder.clear();
        }
      }
    });

    this.maps[configuration._id] = configuration;
    this.mapsList.deactiveAll();
    this.mapsList.hideAllDetails();
    this.mapsList.activeItem(configuration._id);
    //this.mapsList.showDetails(configuration._id);
    this.show();
  }






  exportsRegions(regions) {
    dialog.showSaveDialog({
      title: 'Export regions statistics',
      type: 'normal',
      filters: [{
        name: 'CSV',
        extensions: ['csv']
      }]
    }, (filename) => {
      let fields = ['name'];
      let cont = json2csv({
        data: regions.map((reg) => {

        }),
        fields: fields
      });
      fs.writeFile(filename, cont);
    });
  }


  createMap() {
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
      width: '600px',
      height: 'auto',
      noCloseIcon: true,
      parent: this,
      onsubmit: () => {
        let conf = mapio.baseConfiguration();
        conf.name = name.value;
        this.addNewMap(conf);
      },
      oncancel: () => {}
    });

    modal.addBody(body);
    modal.show();

  }


  openLayerFile(filters) {
    if (Object.keys(this.maps).length <= 0) return;
    dialog.showOpenDialog({
      title: 'Add a new layer',
      filters: filters || [{
        name: 'Configuration',
        extensions: ['json']
      }, {
        name: 'Images',
        extensions: ['jpg', 'png', 'gif', 'tiff', 'tif']
      }],
      properties: ['openFile']
    }, (filenames) => {
      if (!filenames) return;
      if (filenames.length === 0) return;
      fs.stat(filenames[0], (err, stats) => {
        if (err) return;
        if (stats.isFile()) {
          dialog.showMessageBox({
            title: 'Add Layer?',
            type: 'warning',
            buttons: ['No', "Yes"],
            message: `Add layer from  ${filenames[0]} to map ${this.mapBuilder._configuration.name} ?`,
            noLink: true
          }, (id) => {
            if (id > 0) {
              this.addLayerFile(filenames[0]);
            }
          });
        }
      });
    });
  }

  addLayerFile(path, options) {
    options = options || {};
    if (path.endsWith('.json')) {
      let conf = util.readJSONsync(path);
      if (!conf) return;
      conf.basePath = mapio.basePath(conf, path);
      conf = mapio.parseLayer(conf);
      this.addLayer(conf);
    } else if (path.endsWith('.jpg') || path.endsWith('.JPG') || path.endsWith('.png') || path.endsWith('.gif')) {
      var dim = sizeOf(path);
      let siz = Math.max(dim.height, dim.width);
      this.addLayer({
        name: path,
        imageUrl: path,
        tilesUrlTemplate: path,
        maxZoom: 8,
        maxNativeZoom: 0,
        author: 'unknown',
        type: options.type || 'imageOverlay',
        opacity: 1,
        //tileSize: 256,
        tileSize: [dim.width / siz * 256, dim.height / siz * 256],
        bounds: [
          [-Math.floor(dim.height * 256 / siz), 0],
          [0, Math.floor(dim.width * 256 / siz)]
        ]
      });
    } else if (path.endsWith('.csv')) {
      // this.addLayer({
      //     name: path,
      //     author: 'unknow',
      //     type: 'pointsLayer',
      //     tiles_format: 'csv',
      //     pointsUrlTemplate: path,
      //     tileSize: this.mapBuilder.getSize() || 256,
      //     size: this.mapBuilder.getSize() || 256,
      //     maxNativeZoom: 0,
      //     maxZoom: 8
      // });
    } else if (path.endsWith('.tiff') || path.endsWith('.tif')) { //convert it to png and use it
      var converter = new ConvertTiff({
        prefix: 'slice'
      });

      converter.progress = (converted, total) => {
        var dim = sizeOf(`${converted[0].target}\/slice1.png`);
        let siz = Math.max(dim.height, dim.width);
        this.addLayer({
          type: `tileLayer`,
          tilesUrlTemplate: `${converted[0].target}\/slice{t}.png`,
          options: {
            customKeys: {
              "t": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
            },
            t: 1,
            tileSize: [dim.width / siz * 256, dim.height / siz * 256],
            bounds: [
              [-Math.floor(dim.height * 256 / siz), 0],
              [0, Math.floor(dim.width * 256 / siz)]
            ],
            maxNativeZoom: 0,
            maxZoom: 8
          },
          name: path,
          baseLayer: true,
          author: 'unknow'
        });
        gui.notify(`${path} added`);
        util.notifyOS(`"${path} added"`);
      }
      gui.notify(`${path} started conversion`);
      converter.convertArray([path], mapio.basePath(null, path));
    }
  }

  //add the given laye to the current map
  addLayer(conf) {
    conf = mapio.parseLayer(conf);
    this.mapBuilder.loadLayer(conf);
    this.activeConfiguration.layers[`layer_${conf._id}`] = conf;
  }


  _modaltilelayer() {
    let body = util.div('cellconteiner');
    let name = input.input({
      id: 'namenewlayer',
      type: 'text',
      label: '',
      className: 'cell',
      placeholder: 'name',
      parent: body,
      value: ''
    });
    let url = input.input({
      id: 'urlnewlayer',
      type: 'text',
      label: '',
      className: 'cell',
      placeholder: 'tiles url template',
      parent: body,
      value: ''
    });
    let tileSize = input.input({
      id: 'tilesizenewlayer',
      type: 'text',
      label: '',
      className: 'cell',
      placeholder: 'size',
      parent: body,
      value: ''
    });
    let minz = input.input({
      id: 'minzoomnewlayer',
      type: 'number',
      label: '',
      className: 'cell',
      placeholder: 'minZoom',
      parent: body,
      value: 0
    });
    let maxz = input.input({
      id: 'maxzoomnewlayer',
      type: 'number',
      label: '',
      className: 'cell',
      placeholder: 'maxZoom',
      parent: body,
      value: 10
    });
    let base = true;
    input.checkButton({
      id: 'basenewlayer',
      parent: body,
      text: 'base layer',
      className: 'cell',
      active: true,
      ondeactivate: () => {
        base = false;
      },
      onactivate: () => {
        base = true;
      }
    });
    (new Modal({
      title: 'Add a tileLayer',
      body: body,
      width: '200px',
      onsubmit: () => {
        this.addLayer({
          name: name.value,
          type: 'tileLayer',
          tilesUrlTemplate: url.value,
          tileSize: JSON.parse(tileSize.value || 256) || 256,
          minNativeZoom: minz.value,
          maxNativeZoom: maxz.value,
          minZoom: minz.value,
          maxZoom: maxz.value,
          baseLayer: base
        });
      }
    })).show();
  }


  _modalGuideLayer() {
    let body = util.div('cellconteiner');
    let name = input.input({
      id: 'namenewlayer',
      type: 'text',
      label: '',
      className: 'cell',
      placeholder: 'name',
      parent: body,
      value: ''
    });
    let size = input.input({
      id: 'sizenewlayer',
      type: 'number',
      label: '',
      className: 'cell',
      placeholder: 'size',
      parent: body,
      value: ''
    });
    let tilesize = input.input({
      id: 'tilesizenewlayer',
      type: 'number',
      label: '',
      className: 'cell',
      placeholder: 'tilesize',
      parent: body,
      value: ''
    });

    (new Modal({
      title: 'Add a tileLayer',
      body: body,
      width: '200px',
      onsubmit: () => {
        this.addLayer({
          name: name.value || 'guide',
          type: 'guideLayer',
          size: JSON.parse(size.value) || 256,
          tileSize: JSON.parse(tilesize.value) || 256
        });
      }
    })).show();
  }


  _drawEvents() {
    this.mapBuilder.map.on(L.Draw.Event.CREATED, (e) => {
      let type = e.layerType,
        layer = e.layer;
      let config = {
        type: type,
        options: layer.options
      }
      if (layer.getLatLngs) {
        config.latlngs = layer.getLatLngs();
      }
      if (layer.getLatLng) {
        config.latlng = layer.getLatLng();
      }
      if (layer.getRadius) {
        config.radius = layer.getRadius();
      }
      this.mapBuilder.loadLayer(config, this.mapBuilder._drawnItems);

      let key = util.nextKey(this.mapBuilder._configuration.layers.drawnItems.layers);
      this.mapBuilder._configuration.layers.drawnItems.layers[key] = config;
    });

    // when items are removed
    this.mapBuilder.map.on(L.Draw.Event.DELETED, (e) => {
      var layers = e.layers;
      layers.eachLayer((layer) => {
        this.mapBuilder._drawnItems.removeLayer(layer);
        if (layer instanceof L.Marker) {
          this._removeMarker(layer._id);
        } else if (layer instanceof L.Rectangle) {
          this._removeRegion(layer._id);
        } else if (layer instanceof L.Polygon) {
          this._removeRegion(layer._id);
        } else if (layer instanceof L.Circle) {
          this._removeRegion(layer._id);
        } else if (layer instanceof L.Polyline) {}
      });
    });

    this.mapBuilder.map.on(L.Draw.Event.EDITED, (e) => {
      let layers = e.layers;
      layers.eachLayer((layer) => {
        let type = null;
        if (layer instanceof L.Marker) {
          type = 'marker';
        } else if (layer instanceof L.Rectangle) {
          type = 'rectangle';
        } else if (layer instanceof L.Polygon) {
          type = 'polygon';
        } else if (layer instanceof L.Circle) {
          type = 'circle';
        } else if (layer instanceof L.Polyline) {
          type = 'polyline';
        }
        let config = {
          type: type,
          options: layer.options
        }
        if (layer.getLatLngs) {
          config.latlngs = layer.getLatLngs();
        }
        if (layer.getLatLng) {
          config.latlng = layer.getLatLng();
        }
        if (layer.getRadius) {
          config.radius = layer.getRadius();
        }
        this.mapBuilder._configuration.layers.drawnItems.layers[layer._id] = config;
      });
    });
  }


  loadMap(path) {
    mapio.loadMap(path, (conf) => {
      this.addNewMap(conf);
    });
  }



}


module.exports = MapExtension;
