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
const {
    util,
    ListGroup,
    TabGroup,
    Grid,
    input,
    ToggleElement,
    ButtonsContainer,
    Modal,
    gui
} = require('electrongui');
const {
    Menu,
    MenuItem
} = require('electron').remote;

/**
 * Creates a widget containing a list of map layers
 * and provides custom tools to modify their properties
 * (opacity, color, radius...)
 */
class LayersControl {

    /**
     * Class constructor.
     */
    constructor(mapManager) {

        this.element = util.div('layers-widget');
        this.content = util.div('content');
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
        if (mapManager) {
            this.setMapManager(mapManager);
        }

    }

    addData(configuration) {

    }

    addLayer(layer, configuration, map) {
        let tools;
        let customMenuItems = [];
        let list;
        switch (configuration.type) {
            case 'tileLayer':
                if (configuration.baseLayer) {
                    list = this.baselist;
                } else {
                    list = this.tileslist;
                }
                tools = this.createToolbox(layer, configuration, {
                    opacity: true
                });

                if (configuration.baseLayer) {
                    if (!this.baseLayer) {
                        this.baseLayer = layer;
                        this.mapManager.map.addLayer(this.baseLayer);
                    }
                }
                customMenuItems.push(new MenuItem({
                    label: 'Delete',
                    click: () => {
                        if (this.baseLayer === layer) {
                            return;
                        }
                        this.mapManager.map.removeLayer(layer);
                        list.removeItem(`${configuration._id}`);
                        delete this.mapManager._configuration.layers[`${configuration._key}`];
                    }
                }));
                customMenuItems.push(new MenuItem({
                    type: 'separator'
                }));
                customMenuItems.push(new MenuItem({
                    label: 'Base layer',
                    type: 'checkbox',
                    checked: configuration.baseLayer,
                    click: (menuItem) => {
                        if (this.baseLayer === layer) return;
                        this.mapManager.map.removeLayer(layer);
                        list.removeItem(`${configuration._id}`);
                        configuration.baseLayer = menuItem.checked;
                        this.mapManager.loadLayer(configuration);
                    }
                }));
                break;
            case 'imageOverlay':
                tools = this.createToolbox(layer, configuration, {
                    opacity: true
                });
                customMenuItems.push(new MenuItem({
                    label: 'Delete',
                    click: () => {
                        this.tileslist.removeItem(`${configuration._id}`);
                        delete this.mapManager._configuration.layers[`${configuration._key}`];
                    }
                }));
                list = this.tileslist;
                break;
            case 'featureGroup':
                tools = this.createToolbox(layer, configuration, {
                    opacity: true,
                    color: true,
                    weight: true
                });
                customMenuItems.push(new MenuItem({
                    label: 'Delete',
                    click: () => {
                        if (configuration.role = 'drawnItems') {
                            gui.notify('You dont want to remove the drawnItems layer...');
                            return;
                        }
                        this.overlaylist.removeItem(`${configuration._id}`);
                        delete this.mapManager._configuration.layers[`${configuration._key}`];
                    }
                }));
                list = this.overlaylist;
                break;
            case 'layerGroup':
            tools = this.createToolbox(layer, configuration, {
                opacity: true,
                color: true,
                weight: true
            });
            customMenuItems.push(new MenuItem({
                label: 'Delete',
                click: () => {
                    this.overlaylist.removeItem(`${configuration._id}`);
                    delete this.mapManager._configuration.layers[`${configuration._key}`];
                }
            }));
            list = this.overlaylist;
                break;
            default:
            list = this.overlaylist;

        }
        this._addToList(layer, customMenuItems, tools, configuration, list);
        if (typeof layer.on === 'function') {
            layer.on('remove', (e) => {
                list.deactiveItem(`${e.target._id}`);
            });

            layer.on('add', (e) => {
                list.activeItem(`${e.target._id}`);
            });
        }
    }

    /**
     * Sets the map manager and listens to its events.
     * @param {MapManager} mapManager The map manager.
     */
    setMapManager(mapManager) {
        this.mapManager = mapManager;

        this.mapManager.on('clear', () => {
            this.baselist.clean();
            this.tileslist.clean();
            this.overlaylist.clean();
            this.datalist.clean();
            this.baseLayer = null;
        });
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
        let txtTitle = input.input({
            value: configuration.name,
            className: 'list-input',
            readOnly: true,
            onblur: () => {
                txtTitle.readOnly = true;
            },
            onchange: () => {
                configuration.name = txtTitle.value;
                txtTitle.readOnly = true;
            }
        });

        let titleTable = util.div('table-container');
        let txtTitleContainer = util.div('cell full-width');
        txtTitleContainer.appendChild(txtTitle);
        titleTable.appendChild(txtTitleContainer);
        if (tools) {
            let btnToolsContainer = util.div('cell');
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
            id: configuration._id,
            title: titleTable,
            details: tools,
            active: (this.baseLayer === layer) || (list === this.datalist) || (this.mapManager && this.mapManager.map.hasLayer(layer)),
            oncontextmenu: () => {
                context.popup()
            },
            onclick: {
                active: (item, e) => {
                     if (configuration.baseLayer) {
                         this.mapManager.map.removeLayer(this.baseLayer);
                         this.baseLayer = layer;
                     }
                    this.mapManager.map.addLayer(layer);
                },
                deactive: (item, e) => {
                     if (!configuration.baseLayer) {
                         this.mapManager.map.removeLayer(layer);
                     } else {
                         list.activeItem(item);
                     }
                }
            },
            toggle: true,
            key: configuration.name
        });

    }

    /**
     *
     * @param {Object} layer
     * @param {boolean} hasOpacityControl
     * @param {boolean} hasColorControl
     * @param {boolean} hasRadiusControl
     */
    createToolbox(layer, configuration, options) {
        let hasOpacityControl = options.opacity;
        let hasColorControl = options.color;
        let hasRadiusControl = options.radius;
        let hasWeightControl = options.weight;
        let toolbox = new ToggleElement(util.div('table-container toolbox'));
        toolbox.hide();
        toolbox.element.onclick = (e) => e.stopPropagation();
        let first = util.div();
        let second = util.div();
        let third = util.div();
        toolbox.appendChild(first);
        toolbox.appendChild(second);
        toolbox.appendChild(third);
        if (hasColorControl) {
            let colorCell = util.div('cell');

            let colorPickerContainer = util.div('color-picker-wrapper');
            colorPickerContainer.style.backgroundColor = configuration.color || '#ed8414';

            input.input({
                label: '',
                className: '',
                value: configuration.color || '#ed8414',
                parent: colorPickerContainer,
                type: 'color',
                placeholder: 'color',
                oninput: (inp) => {
                    colorPickerContainer.style.backgroundColor = inp.value;
                    if (typeof layer.setStyle === 'function') {
                        layer.setStyle({
                            fillColor: inp.value,
                            color: inp.value
                        });
                        this.mapManager.setDrawingColor(inp.value);
                    }
                },
                onchange: (inp) => {

                }
            });

            colorCell.appendChild(colorPickerContainer);

            first.appendChild(colorCell);
        }

        if (hasRadiusControl) {
            let radiusCell = util.div('cell full-width');

            input.selectInput({
                label: 'Radius: ',
                className: '',
                parent: radiusCell,
                placeholder: 'Radius',
                choices: [
                    1, 2, 3, 4, 5, 6, 7, 8, 9, 10
                ],
                value: configuration.weight || 3,
                oninput: (inp) => {
                    if (typeof layer.setRadius === 'function') {
                        layer.setRadius(inp.value);
                    }
                }
            });
            second.appendChild(radiusCell);
        }

        if (hasWeightControl) {
            let weightCell = util.div('cell full-width');

            input.input({
                label: 'Stroke:',
                className: 'form-control vmiddle',
                parent: weightCell,
                placeholder: 'stroke',
                type: 'range',
                min: 0,
                max: 50,
                step: 2,
                value: configuration.options.weight || configuration.weight || 3,
                oninput: (inp) => {
                    configuration.weight = inp.value;
                    if (typeof layer.setStyle === 'function') {
                        layer.setStyle({
                            weight: inp.value
                        });
                    }
                }
            });
            third.appendChild(weightCell);
        }

        if (hasOpacityControl) {
            let opacityCell = util.div('cell');
            input.input({
                label: '',
                className: 'form-control',
                parent: opacityCell,
                type: 'range',
                max: 1,
                min: 0,
                step: 0.1,
                value: configuration.options.opacity || configuration.opacity,
                placeholder: 'opacity',
                oninput: (inp) => {
                    if (layer.setOpacity) {
                        layer.setOpacity(inp.value);
                    }
                    if (layer.setStyle) {
                        layer.setStyle({
                            opacity: inp.value,
                            fillOpacity: inp.value / 3
                        });
                    }
                }
            });
            first.appendChild(opacityCell);
        }
        return toolbox;
    }


}

module.exports = LayersControl;
