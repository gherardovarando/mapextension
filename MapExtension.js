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
const mapio = require('./src/mapio.js');
const LayersControl = require('./src/LayersControl.js');

const leaflet = require('leaflet');
const leafletMarkerCluster = require('leaflet.markercluster');
const geometryutil = require('leaflet-geometryutil');
const leafletDraw = require('leaflet-draw');
const snap = require(`leaflet-snap`);
const mapBuilder = require('leaflet-map-builder');
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
                click: () => this.show()
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
                }
            }, {
                type: 'separator'
            }, {
                label: 'Add layer',
                type: 'submenu',
                submenu: [{
                    label: 'File'
                }, {
                    label: 'Tiles Url'
                }, {
                    label: 'Image'
                }, {
                    label: 'Guide'
                }]
            }, {
                label: 'Regions',
                type: 'submenu',
                submenu: [{
                    label: 'Delete selected',
                    click: () => {
                        this._deleteRegionsCheck(this.selectedRegions);
                        this.selectedRegions = [];
                    }
                }, {
                    label: 'Delete all',
                    click: () => {
                      Object.keys(this.regions).map((k)=>{
                        this._removeRegion(k);
                      });
                      this.selectedRegions = [];
                                            }
                }, {
                    label: 'Export',
                    click: () => {

                    }
                }, {
                    label: 'Compute',
                    click: () => {

                    }
                }]
            }]
        });
        this._colors = ['blue', 'red', 'pink', 'orange', 'yellow', 'green', 'purple', 'black', 'white'];
        this.selectedRegions = [];
        this.maps = {};
        this.regions = {};
        this.markers = {};
        this.activeMap = null;
        this._indx = 0;
        this._indx2 = 0;
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
        let flexLayout = new FlexLayout(this.sidebar.element, FlexLayout.Type.VERTICAL, 60);

        this.layersControl = new LayersControl();
        let options = {
            map: {
                minZoom: 0,
                zoomSnap: 1,
                zoomDelta: 1,
                crs: L.CRS.Simple,
                zoomControl: false
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
                    zoom: {
                        position: 'topright'
                    },
                    layers: (layer, configuration, map) => {
                        this.layersControl.addLayer(layer, configuration, map);
                    }
                },
                tooltip: {
                    polygon: true,
                    rectangle: true,
                    marker: true
                },
                popup: {
                    marker: true
                }
            }
        }
        flexLayout.appendToLastContainer(this.layersControl.element);
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
                    mapio.loadMap(f.path, (conf) => {
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
        let mapCont = document.createElement('DIV');
        mapCont.style.width = '100%';
        mapCont.style.height = '100%';
        mapCont.style['z-index'] = 0;
        mapCont.id = options.id || 'map';
        this.mapPane.top.appendChild(mapCont);
        let map = L.map(options.id || 'map', options.map);
        this.map = map;
        this.mapBuilder = new L.MapBuilder(map, options.builder);
        this.layersControl.setMapManager(this.mapBuilder);
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
        this.sidebarOverlay.addList('regions');
        this.sidebarOverlay.regions.addSearch({
            placeholder: 'Search regions'
        });

        this.sidebarOverlay.addList(`markers`);
        this.sidebarOverlay.markers.hide();
        this.sidebarOverlay.markers.addSearch({
            placeholder: 'Search markers'
        });
        this.sidebarOverlayTabGroup.addClickListener(`regions`, () => {
            this.sidebarOverlay.regions.show();
            this.sidebarOverlay.markers.hide();
        });
        this.sidebarOverlayTabGroup.addClickListener(`markers`, () => {
            this.sidebarOverlay.markers.show();
            this.sidebarOverlay.regions.hide();
        });
        //this.regionAnalyzer = new RegionAnalyzer();
        this._addListeners();
        gui.workspace.addSpace(this, this.maps, false); //without overwriting
        //saving to workspace and retriving loaded worspace
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


    deactivate() { /// the extension has to take care of removing all the buttons and element appended
        //this.sidebar.remove();
        //this.sidebarOverlay.remove();
        this.removeToggleButton(this.constructor.name); //this is compulsory to leave the interface clean
        super.deactivate(); //we will also call the super class deactivate method
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
                        if (configuration == this.mapBuilder.getConfiguration()) {
                            this.mapBuilder.clear();
                        }
                        this.mapsList.removeItem(`${configuration._id}`);
                        delete this.maps[configuration._id];
                    }
                });

            }
        }));
        ctn.append(new MenuItem({
            label: 'Edit zoom',
            type: 'normal',
            click: () => {
                this.mapsList.showDetails(configuration._id);
            }
        }));
        let tools = util.div('table-container toolbox');
        let first = util.div();
        let second = util.div();
        tools.onclick = (e) => e.stopPropagation();
        tools.appendChild(first);
        tools.appendChild(second);
        input.input({
            label: 'Max. zoom: ',
            parent: first,
            type: "range",
            className: 'form-control vmiddle',
            id: `numMaxZoom_${configuration._id}`,
            value: 0,
            min: 0,
            max: 20,
            by: 1,
            width: '5px',
            onchange: (inp) => {
                this.mapBuilder.setMaxZoom(Number(inp.value));
            }
        });
        input.input({
            type: "range",
            parent: second,
            label: 'Min. zoom: ',
            className: 'form-control vmiddle',
            id: `numMinZoom_${configuration._id}`,
            value: 0,
            max: 0,
            min: -10,
            oninput: (inp) => {
                this.mapBuilder.setMinZoom(Number(inp.value));
            }
        });

        let title = document.createElement('STRONG');
        title.innerHTML = configuration.name;

        this.mapsList.addItem({
            id: configuration._id,
            title: title,
            key: `${configuration.name} ${configuration.date} ${configuration.authors}`,
            details: tools,
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
        this.mapPane.show();
    }

    _removeRegion(id) {
        this.regions[`${id}`].where.removeLayer(this.regions[`${id}`].layer);
        this.sidebarOverlay.regions.removeItem(`${id}`);
        delete this.regions[`${id}`];
        delete this.activeConfiguration.layers.drawnItems.layers[`${id}`]
    }

    _addRegion(e) {
        let layer = e.layer;
        let layerConfig = e.configuration;
        let where = e.where;
        this.regions[layerConfig._id] = {
            layer: layer,
            configuration: layerConfig,
            where: where
        }
        layer.on('click', () => {
            if (!this.sidebarOverlay.regions.items[layerConfig._id].element.className.includes('active')) {
                this.sidebarOverlay.regions.activeItem(layerConfig._id);
                this.map.setView(layer.getLatLngs()[0][0]);
                this.selectedRegions.push(layerConfig._id);
                layer.setStyle({
                    fillOpacity: 0.8
                });
            } else {
                this.sidebarOverlay.regions.deactiveItem(layerConfig._id);
                this.selectedRegions.splice(this.selectedRegions.indexOf(e), 1);
                layer.setStyle({
                    fillOpacity: layerConfig.options.fillOpacity || 0.3
                });
            }
        });
        let inpC = document.createElement('INPUT');
        let inp = document.createElement('INPUT');

        inp.type = 'text';
        inp.className = 'list-input';
        inp.readOnly = true;
        inp.onchange = () => {
            this.sidebarOverlay.regions.setKey(layerConfig._id, inp.value);
            layerConfig.name = inp.value;
            layer.setTooltipContent(inp.value);
            inp.readOnly = true;
        }
        inp.onblur = () => {
            inp.readOnly = true;
        }

        let rename = new MenuItem({
            label: 'Rename',
            click: () => {
                inp.readOnly = false;
            }
        });

        let del = new MenuItem({
            label: 'Delete',
            click: () => {
                if (this.selectedRegions.length === 0) {
                    this.selectedRegions.push(layerConfig._id);
                }
                this._deleteRegionsCheck(this.selectedRegions);
                this.selectedRegions = [];
            }
        });

        let comp = new MenuItem({
            label: 'Compute',
            click: () => {
                if (this.selectedRegions.length === 0) {
                    this.regionAnalyzer.computeRegionStats(layer);
                } else {
                    this.selectedRegions.map((id) => {
                        this.regionAnalyzer.computeRegionStats(id);
                    });
                }

            }
        });
        let exp = new MenuItem({
            label: 'Export statistics',
            click: () => {
                if (this.selectedRegions.length === 0) {
                    this.exportsRegions([layer]);
                } else {
                    this.exportsRegions(this.selectedRegions);
                }
            }
        });
        let context = () => {
            let color = new Menu();
            this._colors.map((col) => {
                color.append(new MenuItem({
                    label: col,
                    type: 'radio',
                    checked: col === layerConfig.options.color && col === layerConfig.options.color,
                    click: () => {
                        layer.setStyle({
                            color: col,
                            fillColor: col
                        });
                        layerConfig.options.color = col;
                        layerConfig.options.fillColor = col;
                    }
                }));
            });
            color.append(new MenuItem({
                label: 'Define new',
                click: () => {
                    this._defineNewColor();
                }
            }));
            let contx = new Menu();
            contx.append(rename);
            contx.append(del);
            contx.append(exp);
            contx.append(comp);
            contx.append(new MenuItem({
                label: 'Color',
                type: 'submenu',
                submenu: color
            }));
            contx.popup();
        }
        inp.placeholder = 'Region name';
        inp.value = layerConfig.name;
        inp.size = layerConfig.name.length + 1;
        layer.on('contextmenu', () => {
            context();
        })
        this.sidebarOverlay.regions.addItem({
            id: layerConfig._id,
            title: inp,
            key: layerConfig.name,
            toggle: true,
            oncontextmenu: () => {
                context();
            },
            onclick: {
                active: () => {
                    this.map.setView(layer.getLatLngs()[0][0]);
                    this.selectedRegions.push(layerConfig._id);
                    layer.setStyle({
                        fillOpacity: 0.8
                    });
                    gui.notify(`${layerConfig.name} selected, (${this.selectedRegions.length} tot)`);
                },
                deactive: () => {
                    this.selectedRegions.splice(this.selectedRegions.indexOf(layerConfig._id), 1);
                    gui.notify(`${layerConfig.name} deselected, (${this.selectedRegions.length} tot)`);
                    layer.setStyle({
                        fillOpacity: layerConfig.options.fillOpacity || 0.3
                    });
                }
            }
        });
    }

    _removeMarker(id) {
        this.markers[`${id}`].where.removeLayer(this.markers[`${id}`].layer);
        this.sidebarOverlay.markers.removeItem(`${id}`);
        delete this.markers[`${id}`];
        delete this.activeConfiguration.layers.drawnItems.layers[`${id}`]
    }

    _addMarker(e) {
        let layer = e.layer;
        let layerConfig = e.configuration;
        let where = e.where;

        let context = new Menu();
        this.markers[layerConfig._id] = {
            configuration: layerConfig,
            layer: layer,
            where: where
        };
        this.activeConfiguration.layers.drawnItems.layers[layerConfig._id] = layerConfig;

        let title = input.input({
            type: `text`,
            id: `txtmarker_${layerConfig._id}`,
            value: layerConfig.name,
            className: `list-input`,
            readOnly: true,
            onchange: (inp) => {
                this.sidebarOverlay.markers.setKey(layerConfig._id, inp.value);
                layer.setTooltipContent(title.value);
                layerConfig.name = inp.value;
                inp.readOnly = true;
            },
            onblur: (inp) => {
                inp.readOnly = true;
            }
        });
        title.size = layerConfig.name.length + 1;

        context.append(new MenuItem({
            label: 'Rename',
            click: () => {
                title.readOnly = false;
            }
        }));

        context.append(new MenuItem({
            label: 'Edit details',
            click: () => {
                this._editMarkerDetails(e);
            }
        }));

        context.append(new MenuItem({
            label: 'Delete',
            click: () => {
                this._deleteMarkerCheck(e);
            }
        }));


        this.sidebarOverlay.markers.addItem({
            id: layerConfig._id,
            title: title,
            key: layerConfig.name,
            toggle: true,
            oncontextmenu: () => {
                context.popup();
            },
            onclick: {
                active: () => {
                    this.sidebarOverlay.markers.deactiveAll();
                    this.map.setView(layer.getLatLng());
                    layer.openPopup();
                },
                deactive: () => {
                    layer.closePopup();
                }
            }
        });

        layer.on('click', () => {
            this.sidebarOverlay.markers.deactiveAll();
            this.sidebarOverlay.markers.activeItem(layerConfig._id);
            this.map.setView(layer.getLatLng());
        });

        layer.on('dblclick', () => {
            this._editMarkerDetails(e);
        });
    }

    _addListeners() {
        this.map.on(L.Draw.Event.CREATED, (e) => {
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
            this.activeConfiguration.layers.drawnItems.layers[config._id] = config;

        });

        // when items are removed
        this.map.on(L.Draw.Event.DELETED, (e) => {
            var layers = e.layers;
            layers.eachLayer((layer) => {
                this.mapBuilder._drawnItems.removeLayer(layer);
                if (layer instanceof L.Marker) {
                    this._removeMarker();
                } else if (layer instanceof L.Rectangle) {
                    this._removeRegion(layer._id);
                } else if (layer instanceof L.Polygon) {
                    this._removeRegion(layer._id);
                } else if (layer instanceof L.Circle) {
                    this._removeRegion(layer._id);
                } else if (layer instanceof L.Polyline) {}
            });
        });

        this.map.on(L.Draw.Event.EDITED, (e) => {
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

            });
        });


        this.mapBuilder.on('error', (e) => {
            gui.notify(e.error);
        });

        //when clean mapmanager clean interface
        this.mapBuilder.on('clear', () => {
            this.sidebarOverlay.regions.clean();
            this.sidebarOverlay.markers.clean();
            this.selectedRegions = [];
            this.regions = {};
            this.markers = {};
        });

        this.mapBuilder.on('set:configuration', (e) => {
            this.activeConfiguration = e.configuration;
        });

        this.mapBuilder.on('add:drawnitems', (e) => {
            this.activeConfiguration.layers.drawnItems = e.configuration;
        });


        this.mapBuilder.on('set:configuration', (e) => {
            this.activeMap = e.configuration
        });

        //when a polygon is added create region element in the sidebarOverlay and relative actions,
        this.mapBuilder.on('load:polygon', (e) => {
            this._addRegion(e);
        });

        this.mapBuilder.on('load:rectangle', (e) => {
            this._addRegion(e);
        });

        this.mapBuilder.on('load:marker', (e) => {
            this._addMarker(e);
        });

    }

    _defineNewColor() {
        let modal = new Modal({
            title: "Define color",
            height: "auto"
        });
        let body = util.div();
        let color = '#000000';
        let colorPickerContainer = util.div('color-picker-wrapper');
        colorPickerContainer.style.backgroundColor = color;
        body.appendChild(colorPickerContainer);
        input.input({
            parent: colorPickerContainer,
            id: 'cP0',
            className: '',
            value: color,
            label: '',
            type: 'color',
            oninput: (inp) => {
                color = inp.value;
                document.getElementById('cP1').value = inp.value;
                colorPickerContainer.style.backgroundColor = inp.value;
            }
        });
        input.input({
            parent: body,
            id: 'cP1',
            className: '',
            label: '',
            value: color,
            type: 'text',
            placeholder: 'color',
            oninput: (inp) => {
                color = inp.value;
                document.getElementById('cP0').value = inp.value;
                colorPickerContainer.style.backgroundColor = inp.value;
            }
        });
        let buttonsContainer = new ButtonsContainer(document.createElement("DIV"));
        buttonsContainer.addButton({
            id: "CancelColor0",
            text: "Cancel",
            action: () => {
                modal.destroy();
            },
            className: "btn-default"
        });
        buttonsContainer.addButton({
            id: "SaveColor0",
            text: "Add",
            action: () => {
                this._colors.push(color);
                modal.destroy();
            },
            className: "btn-default"
        });
        let footer = util.div();
        footer.appendChild(buttonsContainer.element);
        modal.addBody(body);
        modal.addFooter(footer);
        modal.show();


    }

    _editMarkerDetails(e) {
        let marker = e.layer;
        let configuration = e.configuration;
        // OPEN A MODAL ASKING FOR DETAILS.
        var modal = new Modal({
            title: "Edit marker details",
            height: "auto"
        });
        let grid = new Grid(2, 2);
        let txtMarkerName = input.input({
            type: "text",
            id: `txtMarkerName_${configuration._id}_modal`,
            value: configuration.name,
            label: 'Marker name'
        });
        grid.addElement(txtMarkerName, 0, 1);
        let taMarkerDetails = document.createElement("TEXTAREA");
        taMarkerDetails.id = "tamarkerdetails";
        taMarkerDetails.value = configuration.details;
        taMarkerDetails.rows = 5
        taMarkerDetails.style.width = '100%';
        let lblMarkerDetails = document.createElement("LABEL");
        lblMarkerDetails.htmlFor = "tamarkerdetails";
        lblMarkerDetails.innerHTML = "Marker details: ";
        grid.addElement(lblMarkerDetails, 1, 0);
        grid.addElement(taMarkerDetails, 1, 1);
        let buttonsContainer = new ButtonsContainer(document.createElement("DIV"));
        buttonsContainer.addButton({
            id: "CancelMarker00",
            text: "Cancel",
            action: () => {
                modal.destroy();
            },
            className: "btn-default"
        });
        buttonsContainer.addButton({
            id: "SaveMarker00",
            text: "Save",
            action: () => {
                this.sidebarOverlay.markers.setTitle(configuration._id, txtMarkerName.value);
                configuration.name = txtMarkerName.value;
                configuration.details = taMarkerDetails.value;
                marker.setTooltipContent(txtMarkerName.value);
                marker.setPopupContent(`<strong>${txtMarkerName.value}</strong> <p> ${taMarkerDetails.value}</p>`);
                modal.destroy();
            },
            className: "btn-default"
        });
        let footer = util.div();
        footer.appendChild(buttonsContainer.element);

        modal.addBody(grid.element);
        modal.addFooter(footer);
        modal.show();
    }

    _deleteMarkerCheck(e) {
        dialog.showMessageBox({
            title: 'Delete selected marker?',
            type: 'warning',
            buttons: ['No', 'Yes'],
            message: `Delete the selected marker? (no undo available)`,
            detail: `Marker to be deleted: ${e.configuration.name}.`,
            noLink: true
        }, (id) => {
            if (id > 0) {
                this._removeMarker(e.layer._id);
            }
        });
    }

    _deleteRegionsCheck(regions) {
        dialog.showMessageBox({
            title: 'Delete selected regions?',
            type: 'warning',
            buttons: ['No', "Yes"],
            message: `Delete the selected regions? (no undo available)`,
            detail: `Regions to be deleted: ${regions.map((id) => { return this.regions[id].name })}`,
            noLink: true
        }, (id) => {
            if (id > 0) {
                regions.map((id) => {
                    this._removeRegion(id);
                });
                regions = [];
            }
        });
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
            let pointName = this.mapBuilder.getLayers('pointsLayer').map((x) => {
                return (x.name)
            })
            let fields = ['name'];
            let cont = json2csv({
                data: regions.map((reg) => {
                    reg._configuration.stats.name = reg._configuration.name;
                    Object.keys(reg._configuration.stats).map((key) => {
                        console.log(key);
                        if (fields.indexOf(`${key}`) < 0) {
                            fields.push(`${key}`);
                        }
                    });
                    return (reg._configuration.stats);
                }),
                fields: fields
            });
            fs.writeFile(filename, cont);
        });
    }


    createMap() {
        this.addNewMap(mapio.baseConfiguration());
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
                author: 'unknown',
                type: 'imageLayer',
                opacity: 1,
                //tileSize: 256,
                tileSize: [dim.width / siz * 256, dim.height / siz * 256],
                bounds: [
                    [-Math.floor(dim.height * 256 / siz), 0],
                    [0, Math.floor(dim.width * 256 / siz)]
                ],
                size: 256
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


    addLayer(conf) {
        conf = mapio.parseLayer(conf);
        this.mapBuilder.loadLayer(conf);
        this.activeConfiguration.layers[`layer_${conf._id}`] = conf;
    }



}


module.exports = MapExtension;
