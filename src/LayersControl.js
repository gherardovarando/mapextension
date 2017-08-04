 // Copyright (c) 2017 Gherardo Varando (gherardo.varando@gmail.com), Mario Juez (mjuez@fi.upm.es)
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
   gui,
   colors
 } = require('electrongui');
 const {
   Menu,
   MenuItem,
   dialog
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
   constructor() {

     //create layers-widget
     this.layersWidget = new ToggleElement(util.div('layers-widget'));
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
     this.layersWidget.appendChild(this.content);
     this.baseLayer = null;

     //create region-widget
     this.regionsWidget = new ListGroup('regionslist');
     this.regionsWidget.addSearch({
       placeholder: 'Search regions'
     });

     //create markers widget
     this.markersWidget = new ListGroup('markerslist');
     this.markersWidget.hide();
     this.markersWidget.addSearch({
       placeholder: 'Search markers'
     });


   }

   /**
    * Sets the map manager and listens to its events.
    * @param {builder} builder The map builder.
    */
   setBuilder(builder) {
     this.builder = builder;
     this.selectedRegions = [];
     this.selectedMarkers = [];

     this.builder.on('clear', () => {
       this.baselist.clean();
       this.tileslist.clean();
       this.overlaylist.clean();
       this.datalist.clean();
       this.baseLayer = null;
     });

     this.builder.on('error', (e) => {
       gui.notify(e.error);
     });

     //when clean mapmanager clean interface
     this.builder.on('clear', () => {
       this.regionsWidget.clean();
       this.markersWidget.clean();
       this.selectedRegions = [];
       gui.viewTrick();
     });


     this.builder.on('add:drawnitems', (e) => {
       this.builder._configuration.layers.drawnItems = e.configuration;
       gui.viewTrick();
     });

   }

   addData(configuration) {

   }

   addLayer(layer, configuration, where) {
     let tools;
     let customMenuItems = [];
     let list;
     switch (configuration.type) {
       case 'tileLayerMultiSlice':
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
             where.addLayer(this.baseLayer);
             this.builder.map.setSlice(configuration.options.minSlice);
           }
         }
         customMenuItems.push(new MenuItem({
           label: 'Delete',
           click: () => {
             if (this.baseLayer === layer) {
               return;
             }
             where.removeLayer(layer);
             list.removeItem(configuration._id);
             let key = util.findKeyId(configuration._id, this.builder._configuration.layers);
             delete this.builder._configuration.layers[key];
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
             this.builder.map.removeLayer(layer);
             list.removeItem(`${configuration._id}`);
             configuration.baseLayer = menuItem.checked;
             this.builder.loadLayer(configuration);
           }
         }));
         break;
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
             where.addLayer(this.baseLayer);
           }
         }
         customMenuItems.push(new MenuItem({
           label: 'Delete',
           click: () => {
             if (this.baseLayer === layer) {
               return;
             }
             where.removeLayer(layer);
             list.removeItem(configuration._id);
             let key = util.findKeyId(configuration._id, this.builder._configuration.layers);
             delete this.builder._configuration.layers[key];
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
             this.builder.map.removeLayer(layer);
             list.removeItem(`${configuration._id}`);
             configuration.baseLayer = menuItem.checked;
             this.builder.loadLayer(configuration);
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
             let key = util.findKeyId(configuration._id, this.builder._configuration.layers);
             delete this.builder._configuration.layers[key];
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
             let key = util.findKeyId(configuration._id, this.builder._configuration.layers);
             delete this.builder._configuration.layers[key];
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
             let key = util.findKeyId(configuration._id, this.builder._configuration.layers);
             delete this.builder._configuration.layers[key];
           }
         }));
         list = this.overlaylist;
         break;
       case 'polygon':
         list = this.regionsWidget;
         this.builder._drawnItems.addLayer(layer);
         customMenuItems.push(new MenuItem({
           label: 'Color',
           submenu: colors.menu({
             color: configuration.options.color,
             defineNew: true,
             click: (col) => {
               layer.setStyle({
                 color: col,
                 fillColor: col
               });
               configuration.options.color = col;
               configuration.options.fillColor = col;
             }
           })
         }));
         customMenuItems.push(new MenuItem({
           label: 'Delete',
           click: () => {
             this._deleteRegionsCheck([{
               configuration: configuration,
               layer: layer
             }]);
           }
         }));
         break;
       case 'rectangle':
         list = this.regionsWidget;
         this.builder._drawnItems.addLayer(layer);
         customMenuItems.push(new MenuItem({
           label: 'Color',
           submenu: colors.menu({
             color: configuration.options.color,
             defineNew: true,
             click: (col) => {
               layer.setStyle({
                 color: col,
                 fillColor: col
               });
               configuration.options.color = col;
               configuration.options.fillColor = col;
             }
           })
         }));
         customMenuItems.push(new MenuItem({
           label: 'Delete',
           click: () => {
             this._deleteRegionsCheck([{
               configuration: configuration,
               layer: layer
             }]);
           }
         }));
         break;
       case 'circle':
         list = this.regionsWidget;
         this.builder._drawnItems.addLayer(layer);
         customMenuItems.push(new MenuItem({
           label: 'Color',
           submenu: colors.menu({
             color: configuration.options.color,
             defineNew: true,
             click: (col) => {
               layer.setStyle({
                 color: col,
                 fillColor: col
               });
               configuration.options.color = col;
               configuration.options.fillColor = col;
             }
           })
         }));
         customMenuItems.push(new MenuItem({
           label: 'Delete',
           click: () => {
             this._deleteRegionsCheck([{
               configuration: configuration,
               layer: layer
             }]);
           }
         }));
         break;
       case 'polyline':
         list = this.regionsWidget;
         break;
       case 'marker':
         list = this.markersWidget;
         this.builder._drawnItems.addLayer(layer);
         customMenuItems.push(new MenuItem({
           label: 'Delete',
           click: () => {
             this._deleteMarkerCheck(layer, configuration);
           }
         }));
         customMenuItems.push(new MenuItem({
           label: 'Edit',
           click: () => {
             this._editMarkerDetails(layer, configuration);
           }
         }));
         break;
       default:
         list = this.overlaylist;

     }
     this._addToList(layer, configuration, where, customMenuItems, tools, list);
     if (typeof layer.on === 'function') {
       layer.on('remove', (e) => {
         list.deactiveItem(`${e.target._id}`);
       });

       layer.on('add', (e) => {
         list.activeItem(`${e.target._id}`);
       });
     }
     gui.viewTrick();
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
   _addToList(layer, configuration, where, customMenuItems, tools, list) {
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
     txtTitle.onclick = (e) => {
       if (!txtTitle.readOnly) {
         e.stopPropagation();
       }
     }

     let titleTable = util.div('table-container');
     let txtTitleContainer = util.div('cell full-width');
     txtTitleContainer.appendChild(txtTitle);
     titleTable.appendChild(txtTitleContainer);
     let context = new Menu();
     context.append(new MenuItem({
       label: 'Rename',
       click: () => {
         txtTitle.readOnly = false;
       }
     }));
     if (tools) {
       context.append(new MenuItem({
         label: "Edit",
         click: () => {
           tools.toggle();
         }
       }));
     }
     customMenuItems.map((menuItem) => {
       context.append(menuItem);
     });
     list.addItem({
       id: configuration._id,
       title: titleTable,
       details: tools,
       active: (this.baseLayer === layer) || (list === this.datalist) || (this.builder && where === this.builder.map && this.builder.map.hasLayer(layer)),
       oncontextmenu: () => {
         context.popup();
       },
       onclick: {
         active: (item, e) => {
           if (['polygon', 'circle', 'rectangle'].indexOf(configuration.type) >= 0) {
             this.selectedRegions.push(configuration._id);
             layer.setStyle({
               fillOpacity: 0.8
             });
             gui.notify(`${configuration.name} selected, (${this.selectedRegions.length} tot)`);
           } else if (configuration.type === 'marker') {
             this.selectedMarkers.push(configuration._id);
             gui.notify(`${configuration.name} selected, (${this.selectedMarkers.length} tot)`);
           } else {
             if (configuration.baseLayer) {
               where.removeLayer(this.baseLayer);
               this.baseLayer = layer;
             }
             where.addLayer(layer);
           }
           if (tools) {
             tools.hide();
           }
         },
         deactive: (item, e) => {
           if (['polygon', 'circle', 'rectangle'].indexOf(configuration.type) >= 0) {

             this.selectedRegions.splice(this.selectedRegions.indexOf(configuration._id), 1);
             gui.notify(`${configuration.name} deselected, (${this.selectedRegions.length} tot)`);
             layer.setStyle({
               fillOpacity: configuration.options.fillOpacity || 0.3
             });
           } else if (configuration.type === 'marker') {
             this.selectedMarkers.splice(this.selectedMarkers.indexOf(configuration._id), 1);
             gui.notify(`${configuration.name} deselected, (${this.selectedMarkers.length} tot)`);
           } else {
             if (!configuration.baseLayer) {
               where.removeLayer(layer);
             } else {
               list.activeItem(item);
             }
           }
           if (tools) {
             tools.hide();
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
             this.builder.setDrawingColor(inp.value);
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


   _removeRegion(configuration, layer) {
     this.builder._drawnItems.removeLayer(layer);
     let key = util.findKeyId(configuration._id, this.builder._configuration.layers.drawnItems.layers);
     this.regionsWidget.removeItem(configuration._id);
     delete this.builder._configuration.layers.drawnItems.layers[key];
   }



   _removeMarker(layer, configuration) {
     this.builder._drawnItems.removeLayer(layer);
     let key = util.findKeyId(configuration._id, this.builder._configuration.layers.drawnItems.layers);
     this.markersWidget.removeItem(configuration._id);
     delete this.builder._configuration.layers.drawnItems.layers[key];
   }



   _editMarkerDetails(marker, configuration) {
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

   _deleteMarkerCheck(layer, configuration) {
     dialog.showMessageBox({
       title: 'Delete selected marker?',
       type: 'warning',
       buttons: ['No', 'Yes'],
       message: `Delete the selected marker? (no undo available)`,
       detail: `Marker to be deleted: ${configuration.name}.`,
       noLink: true
     }, (id) => {
       if (id > 0) {
         this._removeMarker(layer, configuration);
       }
     });
   }

   _deleteRegionsCheck(regions) {
     dialog.showMessageBox({
       title: 'Delete selected regions?',
       type: 'warning',
       buttons: ['No', "Yes"],
       message: `Delete the selected regions? (no undo available)`,
       detail: `Regions to be deleted: ${regions.map((c) => { return c.configuration.name })}`,
       noLink: true
     }, (id) => {
       if (id > 0) {
         regions.map((c) => {
           this._removeRegion(c.configuration, c.layer);
         });
       }
     });
   }


 }

 module.exports = LayersControl;
