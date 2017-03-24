/**
 * @author : Mario Juez (mjuez@fi.upm.es)
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
'use strict'

const Util = require('Util');
const ListGroup = require('ListGroup');
const TabGroup = require('TabGroup');
const Grid = require('Grid');
const {
    Menu,
    MenuItem
} = require('electron').remote;
const Input = require('Input');
const ToggleElement = require('ToggleElement');
const Modal = require('Modal');
const ButtonsContainer = require('ButtonsContainer');

/**
 * Creates a widget containing a list of map layers
 * and provides custom tools to modify their properties
 * (opacity, color, radius...)
 */
class LayersWidget {

    /**
     * Class constructor.
     */
    constructor() {
        this.element = Util.div(null, 'layers-widget');
        this.content = Util.div(null, 'content');
        this.tabs = new TabGroup(this.content);
        this.baselist = new ListGroup(this.content);
        this.tileslist = new ListGroup(this.content);
        this.tileslist.element.classList.add('tiles-list');
        this.overlaylist = new ListGroup(this.content);
        this.datalist = new ListGroup(this.content);
        this.overlaylist.hide();
        this.datalist.hide();
        this.tabs.addItem({
            name: '<span class="fa fa-map" title="base layers"></span>',
            id: 'base'
        });
        this.tabs.addItem({
            name: '<i class="fa fa-map-marker"></i><i class="fa fa-map-o"></i>',
            id: 'overlay'
        });
        this.tabs.addItem({
            name: '<span class="fa fa-database" title="data"></span>',
            id: 'data'
        });
        this.tabs.addClickListener('base', () => {
            this.baselist.show();
            this.tileslist.show();
            this.overlaylist.hide();
            this.datalist.hide();
        });
        this.tabs.addClickListener('overlay', () => {
            this.baselist.hide();
            this.tileslist.hide();
            this.overlaylist.show();
            this.datalist.hide();
        });
        this.tabs.addClickListener('data', () => {
            this.baselist.hide();
            this.tileslist.hide();
            this.datalist.show();
            this.overlaylist.hide();
        });
        this.element.appendChild(this.content);
        this.baseLayer = null;

        // Temporal patch
        this.pointsMarkers = {};
    }

    /**
     * Sets the map manager and listens to its events.
     * @param {MapManager} mapManager The map manager.
     */
    setMapManager(mapManager) {
        this.mapManager = mapManager;

        this.mapManager.on('clean', () => {
            this.baselist.clean();
            this.tileslist.clean();
            this.overlaylist.clean();
            this.datalist.clean();
            this.baseLayer = null;
            this.pointsMarkers = {};
        });

        this.mapManager.on('add:tileslayer', (e) => {
            let configuration = e.configuration;
            let layer = e.layer;
            let list;
            if (configuration.baseLayer) {
                list = this.baselist;
            } else {
                list = this.tileslist;
            }

            let tools = this.createToolbox(layer, true, false, false);

            if (configuration.baseLayer) {
                if (!this.baseLayer) {
                    this.baseLayer = layer;
                    this.mapManager._map.addLayer(this.baseLayer);
                }
            }
            let customMenuItems = [];

            let deleteMenuItem = new MenuItem({
                label: 'Delete',
                click: () => {
                    if (this.baseLayer === layer) {
                        return;
                    }
                    this.mapManager.removeLayer(layer);
                }
            });
            customMenuItems.push(deleteMenuItem);
            customMenuItems.push(new MenuItem({ type: 'separator' }));

            let calibrationSettingsMenuItem = new MenuItem({
                label: 'Calibration settings',
                click: () => {
                    var modal = new Modal({
                        title: "Calibration settings",
                        height: "auto"
                    });

                    let grid = new Grid(3, 2);

                    let numCalibratedSize = Input.input({
                        type: "number",
                        id: "numCalibratedSize",
                        value: configuration.sizeCal || 0,
                        min: "0"
                    });
                    let lblCalibratedSize = document.createElement("LABEL");
                    lblCalibratedSize.htmlFor = "numCalibratedSize";
                    lblCalibratedSize.innerHTML = "Calibrated size: ";
                    grid.addElement(lblCalibratedSize, 0, 0);
                    grid.addElement(numCalibratedSize, 0, 1);

                    let numCalibratedDepth = Input.input({
                        type: "number",
                        id: "numCalibratedDepth",
                        value: configuration.depthCal || 0,
                        min: "0"
                    });
                    let lblCalibratedDepth = document.createElement("LABEL");
                    lblCalibratedDepth.htmlFor = "numCalibratedDepth";
                    lblCalibratedDepth.innerHTML = "Calibrated depth: ";
                    grid.addElement(lblCalibratedDepth, 1, 0);
                    grid.addElement(numCalibratedDepth, 1, 1);

                    let txtCalibrationUnit = Input.input({
                        type: "text",
                        id: "txtCalibrationUnit",
                        value: configuration.unitCal || "u"
                    });
                    let lblCalibrationUnit = document.createElement("LABEL");
                    lblCalibrationUnit.htmlFor = "txtCalibrationUnit";
                    lblCalibrationUnit.innerHTML = "Calibration unit: ";
                    grid.addElement(lblCalibrationUnit, 2, 0);
                    grid.addElement(txtCalibrationUnit, 2, 1);

                    let buttonsContainer = new ButtonsContainer(document.createElement("DIV"));
                    buttonsContainer.addButton({
                        id: "CancelSettings00",
                        text: "Cancel",
                        action: () => {
                            modal.destroy();
                        },
                        className: "btn-default"
                    });
                    buttonsContainer.addButton({
                        id: "SaveSettings00",
                        text: "Save",
                        action: () => {
                            configuration.sizeCal = Number(numCalibratedSize.value);
                            configuration.depthCal = Number(numCalibratedDepth.value);
                            configuration.unitCal = txtCalibrationUnit.value;
                            modal.destroy();
                        },
                        className: "btn-default"
                    });
                    let footer = document.createElement('DIV');
                    footer.appendChild(buttonsContainer.element);

                    modal.addBody(grid.element);
                    modal.addFooter(footer);
                    modal.show();
                }
            });
            customMenuItems.push(calibrationSettingsMenuItem);
            let baseLayerMenuItem = new MenuItem({
                label: 'Base layer',
                type: 'checkbox',
                checked: configuration.baseLayer,
                click: () => {
                    if (this.baseLayer === layer) return;
                    this.mapManager.removeLayer(layer);
                    configuration.baseLayer = baseLayerMenuItem.checked;
                    this.mapManager.addLayer(configuration);
                }
            });
            customMenuItems.push(baseLayerMenuItem);

            this._addToList(layer, customMenuItems, tools, configuration, list);
        });

        this.mapManager.on('add:pointslayermarkers', (e) => {
            let configuration = e.configuration;
            let layer = e.layer;
            layer._configuration = configuration;

            let tools = this.createToolbox(layer, false, true, true);
            let customMenuItems = [];
            let deleteMenuItem = new MenuItem({
                label: 'Delete',
                click: () => {
                    configuration.easyToDraw = false;
                    this.mapManager.reloadLayer(configuration);
                }
            });
            customMenuItems.push(deleteMenuItem);
            this.pointsMarkers[configuration.id] = layer;

            this._addToList(layer, customMenuItems, tools, configuration, this.overlaylist);
        });

        this.mapManager.on('add:pointslayer', (e) => {
            let layer = e.layer;
            let configuration = e.configuration;

            let customMenuItems = [];
            let deleteMenuItem = new MenuItem({
                label: 'Delete',
                click: () => {
                    this.mapManager.removeLayer(configuration);
                }
            });
            customMenuItems.push(deleteMenuItem);
            customMenuItems.push(new MenuItem({ type: 'separator' }));

            let easyToDrawMenuItem = new MenuItem({
                label: 'Easy to draw',
                type: 'checkbox',
                checked: configuration.easyToDraw,
                click: () => {
                    configuration.easyToDraw = easyToDrawMenuItem.checked;
                    this.mapManager.reloadLayer(configuration);
                }
            });
            customMenuItems.push(easyToDrawMenuItem);

            this._addToList(layer, customMenuItems, null, configuration, this.datalist);
        });

        this.mapManager.on('add:pixelslayer', (e) => {
            let layer = e.layer;
            let configuration = e.configuration;

            let customMenuItems = [];
            let deleteMenuItem = new MenuItem({
                label: 'Delete',
                click: () => {
                    this.mapManager.removeLayer(configuration);
                }
            });
            customMenuItems.push(deleteMenuItem);

            this._addToList(configuration, customMenuItems, null, configuration, this.datalist);
        });

        this.mapManager.on('remove:layer', (e) => {
            if (e.configuration.baseLayer) {
                this.baselist.removeItem(e.configuration.id);
            } else if (e.configuration.type === 'pointsLayer' || e.configuration.type === 'pixelsLayer') {
                this._removePointsLayerMarkers(e.configuration.id);
                this.datalist.removeItem(e.configuration.id);
            } else if (e.configuration.type === 'tilesLayer') {
                this.tileslist.removeItem(e.configuration.id);
            } else {
                this.overlaylist.removeItem(e.configuration.id);
            }
        });
    }

    /**
     * This method is a temporal patch for removing drawn points layers.
     * @param {number} id 
     */
    _removePointsLayerMarkers(id) {
        if (this.pointsMarkers[id]) {
            this.mapManager._map.removeLayer(this.pointsMarkers[id]);
            delete this.pointsMarkers[id];
            this.overlaylist.removeItem(id);
        }
    }

    /**
     * Adds a layer/configuration into a ListGroup
     * A custom list item is created and inserted to the list. 
     * @param {Object} layer leaflet layer.
     * @param {Array<MenuItem>} customMenuItems a list of menu items.
     * @param {ToggleElement} tools specific tools for that layer.
     * @param {Object} configuration json layer configuration.
     * @param {ListGroup} list target ListGroup.
     */
    _addToList(layer, customMenuItems, tools, configuration, list) {
        let txtTitle = Input.input({
            value: configuration.name,
            className: 'list-input',
            readOnly: true,
            onblur: () => {
                txtTitle.readOnly = true;
            },
            onchange: () => {
                configuration.name = txtTitle.value;
            }
        });

        let titleTable = Util.div(null, 'table-container');
        let txtTitleContainer = Util.div(null, 'cell full-width');
        txtTitleContainer.appendChild(txtTitle);
        titleTable.appendChild(txtTitleContainer);
        if (tools) {
            let btnToolsContainer = Util.div(null, 'cell');
            let btnTools = document.createElement('button');
            btnTools.className = 'btn btn-default';
            btnTools.onclick = (e) => {
                e.stopPropagation();
                tools.toggle();
            }
            let iconTools = document.createElement('span');
            iconTools.className = 'icon icon-tools';
            btnTools.appendChild(iconTools);
            btnToolsContainer.appendChild(btnTools);
            titleTable.appendChild(btnToolsContainer);
        }

        let context = new Menu();
        context.append(new MenuItem({
            label: 'Rename',
            click: () => {
                txtTitle.readOnly = false;
            }
        }));

        customMenuItems.map((menuItem) => {
            context.append(menuItem);
        });
        list.addItem({
            id: configuration.id,
            title: titleTable,
            details: tools,
            active: (this.baseLayer === layer) || (list === this.datalist) || (this.mapManager._map.hasLayer(layer)),
            oncontextmenu: () => {
                context.popup()
            },
            onclick: {
                active: (item, e) => {
                    if (configuration.baseLayer) {
                        this.mapManager._map.removeLayer(this.baseLayer);
                        this.baseLayer = layer;
                    }
                    this.mapManager._map.addLayer(layer);
                },
                deactive: (item, e) => {
                    if (!configuration.baseLayer) {
                        this.mapManager._map.removeLayer(layer);
                    } else {
                        item.element.classList.add('active'); //no deactive if baselayer
                    }
                }
            },
            key: configuration.name,
            toggle: list != this.datalist
        });


        if (typeof layer.on === 'function') {
            layer.on('remove', () => {
                list.deactiveItem(configuration.id);
            });
        }
    }

    /**
     * 
     * @param {Object} layer 
     * @param {boolean} hasOpacityControl 
     * @param {boolean} hasColorControl 
     * @param {boolean} hasRadiusControl 
     */
    createToolbox(layer, hasOpacityControl, hasColorControl, hasRadiusControl) {
        let toolbox = new ToggleElement(Util.div(null, 'table-container toolbox'));
        toolbox.hide();
        toolbox.element.onclick = (e) => e.stopPropagation();
        let configuration = layer._configuration;

        if (hasColorControl) {
            let colorCell = Util.div(null, 'cell');

            let colorPickerContainer = Util.div(null, 'color-picker-wrapper');
            colorPickerContainer.style.backgroundColor = configuration.color || '#ed8414';

            let input = Input.input({
                label: '',
                className: '',
                value: configuration.color || '#ed8414',
                parent: colorPickerContainer,
                type: 'color',
                placeholder: 'color',
                oninput: (inp) => {

                },
                onchange: (inp) => {
                    colorPickerContainer.style.backgroundColor = inp.value;
                    configuration.color = inp.value;
                    configuration.fillColor = inp.value;
                    layer.eachLayer((l) => {
                        l.setStyle({
                            fillColor: inp.value,
                            color: inp.value
                        });
                    });
                }
            });

            colorCell.appendChild(colorPickerContainer);

            toolbox.appendChild(colorCell);
        }

        if (hasRadiusControl) {
            let radiusCell = Util.div(null, 'cell full-width');

            let input = Input.selectInput({
                label: 'Radius: ',
                className: '',
                parent: radiusCell,
                placeholder: 'Radius',
                choices: [
                    1, 2, 3, 4, 5, 6, 7, 8, 9, 10
                ],
                value: configuration.weight || 3,
                oninput: (inp) => {
                    configuration.weight = inp.value;
                    layer.eachLayer((l) => {
                        l.setStyle({
                            weight: inp.value
                        });
                    });
                }
            });

            toolbox.appendChild(radiusCell);
        }

        if (hasOpacityControl) {
            let opacityCell = Util.div(null, 'cell');

            let input = Input.input({
                label: '',
                className: 'form-control',
                parent: opacityCell,
                type: 'range',
                max: 1,
                min: 0,
                step: 0.1,
                value: configuration.opacity,
                placeholder: 'opacity',
                oninput: (inp) => {
                    configuration.opacity = Number(inp.value);
                    layer.setOpacity(configuration.opacity);
                }
            });

            toolbox.appendChild(opacityCell);
        }

        return toolbox;
    }


}

module.exports = LayersWidget;
