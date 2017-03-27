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
const MapManager = require('mapmanager');
const MapIO = require('./src/MapIO.js');
const LayersWidget = require('./src/LayersWidget.js');

const leaflet = require('leaflet');
const leafletMarkerCluster = require('leaflet.markercluster');
const geometryutil = require('leaflet-geometryutil');
const leafletDraw = require('leaflet-draw');
const snap = require(`leaflet-snap`);

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


class MapExtension extends GuiExtension {

    constructor() {
        super({
            icon: icon,
            menuLabel: 'Maps',
            menuTemplate: [{
                    label: 'Show',
                    click: () => this.show
                },
                {
                    label: 'Load map'
                },
                {
                    label: 'Create map'
                }
            ]
        }); //always
        this._colors = ['blue', 'red', 'pink', 'orange', 'yellow', 'green', 'purple', 'black', 'white'];
        this.selectedRegions = [];
        this.maps = {};
        this._indx = 0;
    }

    activate() {
        this.addToggleButton({
            id: this.constructor.name,
            buttonsContainer: gui.header.actionsContainer,
            icon: icon,
            groupId: this.constructor.name
        });
        //add the sidebars
        this.sidebar = new Sidebar(this.element);
        let flexLayout = new FlexLayout(this.sidebar.element, FlexLayout.Type.VERTICAL, 60);

        this.layersContainer = new LayersWidget();
        flexLayout.appendToLastContainer(this.layersContainer.element);
        this.sidebar.show();

        let mapsListContainer = util.div();
        this.mapsList = new ListGroup(mapsListContainer);
        this.mapsList.addSearch({
            placeholder: 'Search maps'
        });

        flexLayout.appendToFirstContainer(this.mapsList.element);

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
                    MapIO.loadMap(f.path, (conf) => {
                        this.addNewMap(conf);
                    });
                }
            }
        };
        //this.sidebar.show();
        this.mapPane = new SplitPane(util.div());
        this.mapPane.top.ondragover = (ev) => {
            ev.dataTransfer.dropEffect = "none";
            for (let f of ev.dataTransfer.files) {
                let regx = /(\.((json)|(layerconfig)|(jpg)|(gif)|(csv)|(jpg)|(png)|(tif)|(tiff)))$/i;
                if (regx.test(f.name)) {
                    ev.dataTransfer.dropEffect = "link";
                    ev.preventDefault();
                }
            }
        };
        this.mapPane.top.ondrop = (ev) => {
            ev.preventDefault();
            for (let f of ev.dataTransfer.files) {
                let regx = /(\.((json)|(layerconfig)|(jpg)|(gif)|(csv)|(jpg)|(png)|(tif)|(tiff)))$/i;
                if (regx.test(f.name)) {
                    this.addLayerFile(f.path);
                }
            }
        };
        this.appendChild(this.mapPane);
        this.mapPane.show();

        this.manager = new MapManager();
        this.manager.leafletMap(this.mapPane.top);
        // globalShortcut.register('CmdOrCtrl+Up', () => {
        //     this.mapManager.tUP();
        // });
        // globalShortcut.register('CmdOrCtrl+Down', () => {
        //     this.mapManager.tDOWN();
        // });
        this.sidebarRegions = new Sidebar(this.element);
        this.sidebarRegions.show();
        this.sidebarRegionsTabGroup = new TabGroup(this.sidebarRegions);
        this.sidebarRegionsTabGroup.addItem({
            id: `regions`,
            name: `Regions`
        });

        this.sidebarRegionsTabGroup.addItem({
            id: `markers`,
            name: `Markers`
        });

        this.sidebarRegions.addList();
        this.sidebarRegions.list.addSearch({
            placeholder: 'Search regions'
        });

        this.sidebarRegions.addList(`markers`);
        this.sidebarRegions.markers.hide();
        this.sidebarRegions.markers.addSearch({
            placeholder: 'Search markers'
        });

        this.sidebarRegionsTabGroup.addClickListener(`regions`, () => {
            this.sidebarRegions.list.show();
            this.sidebarRegions.markers.hide();
        });

        this.sidebarRegionsTabGroup.addClickListener(`markers`, () => {
            this.sidebarRegions.markers.show();
            this.sidebarRegions.list.hide();
        });
        //this.regionAnalyzer = new RegionAnalyzer(this.mapManager, gui);
        //this.listenMapManager();
        //this.layersContainer.setMapManager(this.mapManager);
        //gui.workspace.addSpace(this, this.maps, false); //without overwriting
        //saving to workspace and retriving loaded worspace
        // if (gui.workspace instanceof Workspace) {
        //     gui.workspace.addSpace(this, this.maps);
        //     gui.workspace.on('load', () => {
        //         gui.notify('loading maps from workspace...');
        //         this.mapManager.clean();
        //         let maps = gui.workspace.spaces.mapPage || {};
        //         let tot = Object.keys(maps).length;
        //         Object.keys(maps).map((id, i) => {
        //             this.addNewMap(MapIO.buildConfiguration(maps[id]));
        //         });
        //         gui.workspace.addSpace(this, this.maps, true); //overwriting
        //         gui.notify(`${tot} maps from workspace loaded`);
        //     });
        // }
        //
        // //check if there is a mapPage space in the current workspace and retrive it, this is useful on deactivate/activate of mapPage
        // if (gui.workspace.spaces.mapPage) {
        //     this.mapManager.clean();
        //     let maps = gui.workspace.spaces.mapPage;
        //     Object.keys(maps).map((id) => {
        //         this.addNewMap(MapIO.buildConfiguration(maps[id]));
        //     });
        //     gui.workspace.addSpace(this, this.maps, true); //overwriting
        // }
        gui.mapManager = this.mapManager
        super.activate();

    } //end activate

    // makeMenu() {
    //     let mapMenu = new Menu();
    //     let region = new Menu();
    //     let layer = new Menu();
    //     layer.append(new MenuItem({
    //         label: 'Add layer from file',
    //         click: () => {
    //             this.openLayerFile();
    //         }
    //     }));
    //     layer.append(new MenuItem({
    //         label: 'Add guide layer',
    //         click: () => {
    //             this.addLayer({
    //                 name: 'guide layer',
    //                 type: 'guideLayer',
    //                 size: 100,
    //                 tileSize: 10
    //             });
    //             this.mapManager.reload();
    //         }
    //     }));
    //     layer.append(new MenuItem({
    //         label: 'Add tiles layer',
    //         click: () => {
    //             this.addLayer({
    //                 name: 'tiles layer',
    //                 type: 'tilesLayer',
    //                 tileSize: 256,
    //                 tilesUrlTemplate: ''
    //             });
    //             this.mapManager.reload();
    //         }
    //     }));
    //     region.append(new MenuItem({
    //         label: 'Delete selected',
    //         type: 'normal',
    //         click: () => {
    //             this.deleteRegionsCheck(this.selectedRegions);
    //             this.selectedRegions = [];
    //         }
    //     }));
    //     region.append(new MenuItem({
    //         label: 'Compute selected',
    //         type: 'normal',
    //         accelerator: 'CmdOrCtrl + Enter',
    //         click: () => {
    //             this.selectedRegions.map((reg) => {
    //                 this.regionAnalyzer.computeRegionStats(reg);
    //             });
    //         }
    //     }));
    //     region.append(new MenuItem({
    //         label: 'Export selected',
    //         type: 'normal',
    //         accelerator: 'CmdOrCtrl + E',
    //         click: () => {
    //             this.exportsRegions(this.selectedRegions);
    //         }
    //     }));
    //     region.append(new MenuItem({
    //         label: '',
    //         type: 'separator'
    //     }));
    //     region.append(new MenuItem({
    //         label: 'Compute all',
    //         type: 'normal',
    //         accelerator: 'CmdOrCtrl + Shift + Enter',
    //         click: () => {
    //             this.mapManager.getLayers('polygon').map((reg) => {
    //                 this.regionAnalyzer.computeRegionStats(reg);
    //             });
    //         }
    //     }));
    //     region.append(new MenuItem({
    //         label: 'Export all',
    //         type: 'normal',
    //         accelerator: 'CmdOrCtrl + Shift + E',
    //         click: () => {
    //             this.exportsRegions(this.mapManager.getLayers('polygon'));
    //         }
    //     }));
    //     mapMenu.append(new MenuItem({
    //         label: 'Load map',
    //         type: 'normal',
    //         click: () => {
    //             MapIO.loadMapfromFile((conf) => {
    //                 this.addNewMap(conf);
    //                 this.show();
    //             });
    //         }
    //     }));
    //     mapMenu.append(new MenuItem({
    //         label: 'Crate map',
    //         type: 'normal',
    //         click: () => {
    //             this.createMap();
    //             this.show();
    //         }
    //     }));
    //     // mapMenu.append(new MenuItem({
    //     //     label: 'Edit map',
    //     //     accelerator: 'CmdOrCtrl + L',
    //     //     click: () => {
    //     //         this.mapPane.toggleBottom();
    //     //         this.show();
    //     //     }
    //     // }));
    //     mapMenu.append(new MenuItem({
    //         label: 'Reload map',
    //         click: () => {
    //             this.mapManager.reload();
    //             this.show();
    //         }
    //     }));
    //     mapMenu.append(new MenuItem({
    //         label: '',
    //         type: 'separator'
    //     }));
    //     mapMenu.append(new MenuItem({
    //         label: 'Export current map',
    //         click: () => {
    //             MapIO.saveAs(this.mapManager._configuration, (c, p, e) => {
    //                 gui.notify(`${c.name} map saved in ${p}`);
    //             }, (err) => {
    //                 gui.notify(err);
    //             });
    //         }
    //     }));
    //     mapMenu.append(new MenuItem({
    //         label: '',
    //         type: 'separator'
    //     }));
    //     mapMenu.append(new MenuItem({
    //         label: 'Layers',
    //         submenu: layer,
    //         type: 'submenu'
    //     }));
    //     mapMenu.append(new MenuItem({
    //         label: 'Regions',
    //         submenu: region,
    //         type: 'submenu'
    //     }));
    //     mapMenu.append(new MenuItem({
    //         label: '',
    //         type: 'separator'
    //     }));
    //     mapMenu.append(new MenuItem({
    //         label: 'Show map',
    //         type: 'normal',
    //         accelerator: 'CmdOrCtrl + M',
    //         click: () => {
    //             this.show();
    //         }
    //     }));
    //     this.menu = new MenuItem({
    //         label: "Maps",
    //         type: "submenu",
    //         submenu: mapMenu
    //     });
    //     gui.addSubMenu(this.menu);
    // }

    deactivate() { /// the extension has to take care of removing all the buttons and element appended
        //this.sidebar.remove();
        //this.sidebarRegions.remove();
        this.removeToggleButton(this.constructor.name); //this is compulsory to leave the interface clean
        super.deactivate(); //we will also call the super class deactivate method
    }


    // loadMap(path, cl) {
    //     MapIO.loadMap(path, (conf) => {
    //         this.addNewMap(conf);
    //         gui.notify(`map ${conf.name} added to workspace`);
    //         this.show();
    //         if (typeof cl === 'function') {
    //             cl(conf);
    //         }
    //     });
    // }

    //
    // addNewMap(configuration) {
    //     configuration.id = this._indx++;
    //     try {
    //         this.mapbuilder.setConfiguration(configuration);
    //     } catch (e) {
    //         // otherwise means that the mapManager is unable to load the map
    //         console.log(e);
    //         return;
    //     }
    //     let body = new ToggleElement(document.createElement('DIV'));
    //
    //     let ic;
    //     switch (configuration.source) {
    //         case 'remote':
    //             ic = 'icon icon-network';
    //             break;
    //         case 'local':
    //             ic = '';
    //             break;
    //         case 'mixed':
    //             ic = '';
    //             break;
    //         default:
    //             ic = '';
    //     };
    //
    //
    //     let ctn = new Menu();
    //     ctn.append(new MenuItem({
    //         label: 'Export map',
    //         type: 'normal',
    //         click: () => {
    //             MapIO.saveAs(this.maps[configuration.id], (c, p, e) => {
    //                 gui.notify(`${c.name} map saved in ${p}`);
    //             }, (err) => {
    //                 gui.notify(err);
    //             });
    //         }
    //     }));
    //     // ctn.append(new MenuItem({
    //     //     label: 'Edit map',
    //     //     type: 'normal',
    //     //     click: () => {
    //     //         this.mapPane.toggleBottom();
    //     //     }
    //     // }));
    //     ctn.append(new MenuItem({
    //         label: 'Delete',
    //         type: 'normal',
    //         click: () => {
    //             dialog.showMessageBox({
    //                 title: 'Delete Map?',
    //                 type: 'warning',
    //                 buttons: ['No', "Yes"],
    //                 message: `Delete map ${this.maps[configuration.id].name}? (no undo available)`,
    //                 noLink: true
    //             }, (id) => {
    //                 if (id > 0) {
    //                     if (configuration == this.mapManager._configuration) {
    //                         this.mapManager.clean();
    //                     }
    //                     this.mapsList.removeItem(`${configuration.id}`);
    //                     delete this.maps[configuration.id];
    //                 }
    //             });
    //
    //         }
    //     }));
    //
    //     let activeBaseLayerConf = this.mapManager._activeBaseLayer._configuration;
    //
    //     let tools = new Grid(2, 2);
    //     tools.element.onclick = (e) => e.stopPropagation();
    //     let numMaxZoom = Input.input({
    //         type: "number",
    //         id: `numMaxZoom_${configuration.id}`,
    //         value: activeBaseLayerConf.maxZoom || 0,
    //         min: "0",
    //         onchange: () => {
    //             this.mapManager.setMaxZoom(Number(numMaxZoom.value));
    //         }
    //     });
    //     let lblMaxZoom = document.createElement("label");
    //     lblMaxZoom.htmlFor = `numMaxZoom_${configuration.id}`;
    //     lblMaxZoom.innerHTML = "Max. zoom: ";
    //     tools.addElement(lblMaxZoom, 0, 0);
    //     tools.addElement(numMaxZoom, 0, 1);
    //     let numMinZoom = Input.input({
    //         type: "number",
    //         id: `numMinZoom_${configuration.id}`,
    //         value: activeBaseLayerConf.minZoom || 0,
    //         min: "0",
    //         oninput: () => {
    //             this.mapManager.setMinZoom(Number(numMinZoom.value));
    //         }
    //     });
    //     let lblMinZoom = document.createElement("label");
    //     lblMinZoom.htmlFor = `numMinZoom_${configuration.id}`;
    //     lblMinZoom.innerHTML = "Min. zoom: ";
    //     tools.addElement(lblMinZoom, 1, 0);
    //     tools.addElement(numMinZoom, 1, 1);
    //
    //     let title = document.createElement('STRONG');
    //     title.innerHTML = configuration.name;
    //
    //     /*let title = document.createElement('STRONG');
    //     title.innerHTML = configuration.name;
    //     title.oncontextmenu = () => {
    //         ctn.popup();
    //     }*/
    //
    //     this.mapsList.addItem({
    //         id: `${configuration.id}`,
    //         title: title,
    //         key: `${configuration.name} ${configuration.date} ${configuration.authors}`,
    //         details: tools,
    //         icon: ic,
    //         toggle: true,
    //         oncontextmenu: () => {
    //             ctn.popup();
    //         },
    //         onclick: {
    //             active: () => {
    //                 this.mapsList.deactiveAll();
    //                 this.mapsList.hideAllDetails();
    //                 this.mapsList.showDetails(configuration.id);
    //                 this.mapManager.setConfiguration(configuration);
    //                 //this.mapManager.reload();
    //             },
    //             deactive: () => {
    //                 this.mapsList.hideAllDetails();
    //                 //this.mapManager.clean();
    //             }
    //         }
    //     });
    //
    //     this.maps[configuration.id] = configuration;
    //     configuration.new = false;
    //     this.mapsList.deactiveAll();
    //     this.mapsList.hideAllDetails();
    //     this.mapsList.activeItem(configuration.id);
    //     this.mapsList.showDetails(configuration.id);
    //     this.mapPane.show();
    // }


    // listenMapManager() {
    //
    //     //when clean mapmanager clean interface
    //     this.mapManager.on('clean', () => {
    //         this.sidebarRegions.list.clean();
    //         this.sidebarRegions.markers.clean();
    //         this.selectedRegions = [];
    //
    //     });
    //
    //     this.mapManager.on('reload', () => {});
    //
    //     //when a polygon is added create region element in the sidebarRegions and relative actions,
    //     this.mapManager.on('add:polygon', (e) => {
    //         let layer = e.layer;
    //         let layerConfig = e.layer._configuration;
    //         layer.on('click', () => {
    //             if (!this.sidebarRegions.list.items[layerConfig.id].element.className.includes('active')) {
    //                 this.sidebarRegions.list.items[layerConfig.id].element.className = 'list-group-item active';
    //                 this.mapManager._map.setView(layer.getLatLngs()[0][0]);
    //                 this.selectedRegions.push(layer);
    //                 layer.setStyle({
    //                     fillOpacity: 0.8
    //                 });
    //             } else {
    //                 this.sidebarRegions.list.items[layerConfig.id].element.className = 'list-group-item';
    //                 this.selectedRegions.splice(this.selectedRegions.indexOf(layer), 1);
    //                 layer.setStyle({
    //                     fillOpacity: 0.3
    //                 });
    //             }
    //         });
    //         let inpC = document.createElement('INPUT');
    //         let inp = document.createElement('INPUT');
    //
    //         inp.type = 'text';
    //         inp.className = 'list-input';
    //         inp.readOnly = true;
    //         inp.onchange = () => {
    //             this.sidebarRegions.list.setKey(layerConfig.id, inp.value);
    //             layerConfig.name = inp.value;
    //             layer.setTooltipContent(inp.value);
    //             inp.readOnly = true;
    //         }
    //         inp.onblur = () => {
    //             inp.readOnly = true;
    //         }
    //
    //         let context = new Menu();
    //         if (!layer.group) {
    //             context.append(new MenuItem({
    //                 label: 'Rename',
    //                 click: () => {
    //                     inp.readOnly = false;
    //                 }
    //             }));
    //             let color = new Menu();
    //             this._colors.map((col) => {
    //                 color.append(new MenuItem({
    //                     label: col,
    //                     click: () => {
    //                         layer.setStyle({
    //                             color: col,
    //                             fillColor: col
    //                         });
    //                         layer._configuration.options.color = col;
    //                         layer._configuration.options.fillColor = col;
    //                     }
    //                 }));
    //             });
    //             context.append(new MenuItem({
    //                 label: 'Color',
    //                 type: 'submenu',
    //                 submenu: color
    //             }));
    //             context.append(new MenuItem({
    //                 label: 'Delete',
    //                 click: () => {
    //                     if (this.selectedRegions.length === 0) {
    //                         this.selectedRegions.push(layer);
    //                     }
    //                     this.deleteRegionsCheck(this.selectedRegions);
    //                     this.selectedRegions = [];
    //                 }
    //             }));
    //         }
    //         context.append(new MenuItem({
    //             label: 'Compute',
    //             click: () => {
    //                 if (this.selectedRegions.length === 0) {
    //                     this.regionAnalyzer.computeRegionStats(layer);
    //                 } else {
    //                     this.selectedRegions.map((reg) => {
    //                         this.regionAnalyzer.computeRegionStats(reg);
    //                     });
    //                 }
    //
    //             }
    //         }));
    //         // context.append(new MenuItem({
    //         //     label: 'Create polygons layer from selected',
    //         //     click: () => {
    //         //         if (this.selectedRegions.length == 0) {
    //         //             return;
    //         //         }
    //         //         dialog.showMessageBox({
    //         //             type: 'question',
    //         //             buttons: ['Cancel', 'Create'],
    //         //             defaultId: 0,
    //         //             title: 'Create polygons layer',
    //         //             message: `Do you want to create a new polygon layers from the selected regions: ${this.selectedRegions}`,
    //         //             noLink: true
    //         //         }, (id) => {
    //         //             if (id > 0) {
    //         //                 let conf = {
    //         //                     name: `Polygons${this.mapManager.getIndex()}`,
    //         //                     type: 'polygons',
    //         //                     polygons: this.selectedRegions.map((pol) => {
    //         //                         return Object.assign({}, pol._configuration);
    //         //                     })
    //         //                 };
    //         //                 this.addLayer(conf);
    //         //                 this.selectedRegions = [];
    //         //             }
    //         //         });
    //         //     }
    //         // }));
    //         context.append(new MenuItem({
    //             label: 'Export statistics',
    //             click: () => {
    //                 if (this.selectedRegions.length === 0) {
    //                     this.exportsRegions([layer]);
    //                 } else {
    //                     this.exportsRegions(this.selectedRegions);
    //                 }
    //             }
    //         }));
    //         inp.placeholder = 'Region name';
    //         inp.value = layerConfig.name;
    //         inp.size = layerConfig.name.length + 1;
    //         let c = document.createElement('STRONG');
    //         c.appendChild(inp);
    //         c.oncontextmenu = (event) => {
    //             context.popup();
    //         }
    //         layer.on('contextmenu', () => {
    //             context.popup();
    //         })
    //         this.sidebarRegions.addItem({
    //             id: layerConfig.id,
    //             title: c,
    //             key: layerConfig.name,
    //             toggle: true,
    //             onclick: {
    //                 active: () => {
    //                     this.mapManager._map.setView(layer.getLatLngs()[0][0]);
    //                     this.selectedRegions.push(layer);
    //                     layer.setStyle({
    //                         fillOpacity: 0.8
    //                     });
    //                     gui.notify(`${layerConfig.name} selected, (${this.selectedRegions.length} tot)`);
    //                 },
    //                 deactive: () => {
    //                     this.selectedRegions.splice(this.selectedRegions.indexOf(layer), 1);
    //                     gui.notify(`${layerConfig.name} deselected, (${this.selectedRegions.length} tot)`);
    //                     layer.setStyle({
    //                         fillOpacity: 0.3
    //                     });
    //                 }
    //             }
    //         });
    //     });
    //
    //     this.mapManager.on('add:marker', (e) => {
    //         let layer = e.layer;
    //         let layerConfig = e.layer._configuration;
    //
    //         let context = new Menu();
    //
    //         context.append(new MenuItem({
    //             label: 'Edit details',
    //             click: () => {
    //                 this.editMarkerDetails(layer);
    //             }
    //         }));
    //
    //         context.append(new MenuItem({
    //             label: 'Delete',
    //             click: () => {
    //                 this.deleteMarkerCheck(layer);
    //             }
    //         }));
    //
    //         let txtTitle = Input.input({
    //             type: `text`,
    //             id: `txtmarker_${layerConfig.id}`,
    //             value: layerConfig.name,
    //             className: `list-input`,
    //             readOnly: true,
    //             onchange: () => {
    //                 this.sidebarRegions.markers.setKey(layerConfig.id, txtTitle.value);
    //                 layerConfig.name = txtTitle.value;
    //                 layer.setTooltipContent(txtTitle.value);
    //                 txtTitle.readOnly = true;
    //             },
    //             onblur: () => {
    //                 txtTitle.value = layerConfig.name;
    //                 txtTitle.readOnly = true;
    //             },
    //             ondblclick: (event) => {
    //                 event.stopPropagation();
    //                 txtTitle.readOnly = false;
    //             }
    //         });
    //         txtTitle.size = layerConfig.name.length + 1;
    //         txtTitle.oncontextmenu = () => {
    //             context.popup();
    //         };
    //
    //         let title = document.createElement('STRONG');
    //         title.appendChild(txtTitle);
    //
    //         this.sidebarRegions.markers.addItem({
    //             id: layerConfig.id,
    //             title: title,
    //             key: layerConfig.name,
    //             toggle: true,
    //             onclick: {
    //                 active: () => {
    //                     this.sidebarRegions.markers.deactiveAll();
    //                     this.mapManager._map.setView(layer.getLatLng());
    //                     layer.openPopup();
    //                 },
    //                 deactive: () => {
    //                     layer.closePopup();
    //                 }
    //             }
    //         });
    //
    //         layer.on('click', () => {
    //             this.sidebarRegions.markers.deactiveAll();
    //             this.sidebarRegions.markers.activeItem(layerConfig.id);
    //             this.mapManager._map.setView(layer.getLatLng());
    //         });
    //
    //         layer.on('dblclick', (e) => {
    //             this.editMarkerDetails(layer);
    //         });
    //     });
    //
    //     this.mapManager.on('remove:marker', (e) => {
    //         this.sidebarRegions.markers.removeItem(e.layer._configuration.id);
    //     });
    //
    //     this.mapManager.on('remove:polygon', (e) => {
    //         this.sidebarRegions.list.removeItem(e.layer._configuration.id);
    //     });
    // }
    //
    // editMarkerDetails(marker) {
    //     // OPEN A MODAL ASKING FOR DETAILS.
    //     var modal = new Modal({
    //         title: "Edit marker details",
    //         height: "auto"
    //     });
    //
    //     let grid = new Grid(2, 2);
    //
    //     let txtMarkerName = Input.input({
    //         type: "text",
    //         id: "txtmarkername",
    //         value: marker._configuration.name
    //     });
    //     let lblMarkerName = document.createElement("LABEL");
    //     lblMarkerName.htmlFor = "txtmarkername";
    //     lblMarkerName.innerHTML = "Marker name: ";
    //     grid.addElement(lblMarkerName, 0, 0);
    //     grid.addElement(txtMarkerName, 0, 1);
    //
    //     let taMarkerDetails = document.createElement("TEXTAREA");
    //     taMarkerDetails.id = "tamarkerdetails";
    //     taMarkerDetails.value = marker._configuration.details;
    //     taMarkerDetails.rows = 5
    //     taMarkerDetails.style.width = '100%';
    //     let lblMarkerDetails = document.createElement("LABEL");
    //     lblMarkerDetails.htmlFor = "tamarkerdetails";
    //     lblMarkerDetails.innerHTML = "Marker details: ";
    //     grid.addElement(lblMarkerDetails, 1, 0);
    //     grid.addElement(taMarkerDetails, 1, 1);
    //
    //     let buttonsContainer = new ButtonsContainer(document.createElement("DIV"));
    //     buttonsContainer.addButton({
    //         id: "CancelMarker00",
    //         text: "Cancel",
    //         action: () => {
    //             modal.destroy();
    //         },
    //         className: "btn-default"
    //     });
    //     buttonsContainer.addButton({
    //         id: "SaveMarker00",
    //         text: "Save",
    //         action: () => {
    //             this.sidebarRegions.markers.setKey(marker._configuration.name, txtMarkerName.value);
    //             marker._configuration.name = txtMarkerName.value;
    //             marker._configuration.details = taMarkerDetails.value;
    //             marker.setTooltipContent(txtMarkerName.value);
    //             marker.setPopupContent(`<strong>${txtMarkerName.value}</strong> <p> ${taMarkerDetails.value}</p>`);
    //             modal.destroy();
    //         },
    //         className: "btn-default"
    //     });
    //     let footer = util.div();
    //     footer.appendChild(buttonsContainer.element);
    //
    //     modal.addBody(grid.element);
    //     modal.addFooter(footer);
    //     modal.show();
    // }
    //
    // deleteMarkerCheck(marker) {
    //     dialog.showMessageBox({
    //         title: 'Delete selected marker?',
    //         type: 'warning',
    //         buttons: ['No', 'Yes'],
    //         message: `Delete the selected marker? (no undo available)`,
    //         detail: `Marker to be deleted: ${marker._configuration.name}.`,
    //         noLink: true
    //     }, (id) => {
    //         if (id > 0) {
    //             this.mapManager.removeMarker(marker, true);
    //         }
    //     });
    // }
    //
    // deleteRegionsCheck(regions) {
    //     dialog.showMessageBox({
    //         title: 'Delete selected regions?',
    //         type: 'warning',
    //         buttons: ['No', "Yes"],
    //         message: `Delete the selected regions? (no undo available)`,
    //         detail: `Regions to be deleted: ${regions.map((reg) => { return reg._configuration.name })}`,
    //         noLink: true
    //     }, (id) => {
    //         if (id > 0) {
    //             regions.map((reg) => {
    //                 this.mapManager.removePolygon(reg, true);
    //             });
    //             regions = [];
    //         }
    //     });
    // }
    //
    //
    // exportsRegions(regions) {
    //     dialog.showSaveDialog({
    //         title: 'Export regions statistics',
    //         type: 'normal',
    //         filters: [{
    //             name: 'CSV',
    //             extensions: ['csv']
    //         }]
    //     }, (filename) => {
    //         let pointName = this.mapManager.getLayers('pointsLayer').map((x) => {
    //             return (x.name)
    //         })
    //         let fields = ['name'];
    //         let cont = json2csv({
    //             data: regions.map((reg) => {
    //                 reg._configuration.stats.name = reg._configuration.name;
    //                 Object.keys(reg._configuration.stats).map((key) => {
    //                     console.log(key);
    //                     if (fields.indexOf(`${key}`) < 0) {
    //                         fields.push(`${key}`);
    //                     }
    //                 });
    //                 return (reg._configuration.stats);
    //             }),
    //             fields: fields
    //         });
    //         fs.writeFile(filename, cont);
    //     });
    // }
    //
    //
    // createMap() {
    //     MapIO.createMap((c) => {
    //         this.addNewMap(c);
    //     });
    // }
    //
    // openLayerFile() {
    //     if (Object.keys(this.maps).length <= 0) return;
    //     dialog.showOpenDialog({
    //         title: 'Add a new layer',
    //         filters: [{
    //             name: 'Configuration',
    //             extensions: ['json', 'mapconfig']
    //         }, {
    //             name: 'Images',
    //             extensions: ['jpg', 'png', 'gif', 'tiff', 'tif']
    //         }, {
    //             name: 'CSV',
    //             extensions: ['csv']
    //         }],
    //         properties: ['openFile']
    //     }, (filenames) => {
    //         if (filenames.length === 0) return;
    //         fs.stat(filenames[0], (err, stats) => {
    //             if (err) return;
    //             if (stats.isFile()) {
    //                 dialog.showMessageBox({
    //                     title: 'Add Layer?',
    //                     type: 'warning',
    //                     buttons: ['No', "Yes"],
    //                     message: `Add layer from  ${filenames[0]} to map ${this.mapManager._configuration.name} ?`,
    //                     noLink: true
    //                 }, (id) => {
    //                     if (id > 0) {
    //                         this.addLayerFile(filenames[0]);
    //                     }
    //                 });
    //             }
    //         });
    //     });
    // }
    //
    // addLayerFile(path, options) {
    //     options = options || {};
    //     if (path.endsWith('.json') || path.endsWith('.mapconfig')) {
    //         let conf = util.readJSONsync(path);
    //         if (!conf) return;
    //         let key = conf.name || conf.alias || path;
    //         conf.basePath = MapIO.basePath(conf, path);
    //         this.mapManager._configuration.layers[key] = MapIO.parseLayerConfig(conf);
    //         this.mapManager.addLayer(this.mapManager._configuration.layers[key], key);
    //     } else if (path.endsWith('.jpg') || path.endsWith('.JPG') || path.endsWith('.png') || path.endsWith('.gif')) {
    //         var dim = sizeOf(path);
    //         let siz = Math.max(dim.height, dim.width);
    //         this.addLayer({
    //             name: `tilesLayer from ${path}`,
    //             tilesUrlTemplate: `${path}`,
    //             basePath: '',
    //             source: 'local',
    //             original_size: siz,
    //             maxZoom: 8,
    //             baseLayer: !this.mapManager._state.baseLayerOn,
    //             author: 'unknown',
    //             type: 'tilesLayer',
    //             opacity: 0.8,
    //             tileSize: [dim.width / siz * 256, dim.height / siz * 256],
    //             bounds: [
    //                 [-Math.floor(dim.height * 256 / siz), 0],
    //                 [0, Math.floor(dim.width * 256 / siz)]
    //             ],
    //             size: 256
    //         });
    //
    //
    //     } else if (path.endsWith('.csv')) {
    //         this.addLayer({
    //             name: path,
    //             alias: `pointsLayer from ${path}`,
    //             author: 'unknow',
    //             type: 'pointsLayer',
    //             tiles_format: 'csv',
    //             pointsUrlTemplate: path,
    //             tileSize: this.mapManager._configuration.size || 256,
    //             size: this.mapManager._configuration.size || 256,
    //             maxNativeZoom: 0,
    //             maxZoom: 8
    //         });
    //
    //
    //     } else if (path.endsWith('.tiff') || path.endsWith('.tif')) { //convert it to png and use it
    //         var converter = new ConvertTiff({
    //             prefix: 'slice'
    //         });
    //
    //         converter.progress = (converted, total) => {
    //             var dim = sizeOf(`${converted[0].target}\/slice1.png`);
    //             let siz = Math.max(dim.height, dim.width);
    //             this.addLayer({
    //                 type: `tilesLayer`,
    //                 tilesUrlTemplate: `${converted[0].target}\/slice{t}.png`,
    //                 customKeys: {
    //                     "t": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    //                 },
    //                 name: path,
    //                 baseLayer: true,
    //                 alias: `tilesLayer from ${path}`,
    //                 author: 'unknow',
    //                 tileSize: [dim.width / siz * 256, dim.height / siz * 256],
    //                 maxNativeZoom: 0,
    //                 maxZoom: 8
    //             });
    //             gui.notify(`${path} added`);
    //             util.notifyOS(`"${path} added"`);
    //         }
    //         gui.notify(`${path} started conversion`);
    //         converter.convertArray([path], MapIO.basePath(null, path));
    //     }
    // }
    //
    //
    // addLayer(conf) {
    //     conf = MapIO.parseLayerConfig(conf);
    //     let key = conf.name || conf.alias || conf.id || conf.type;
    //     this.mapManager.getConfiguration().layers[key] = conf;
    //     this.mapManager.reload();
    // }



}


module.exports = MapExtension;
