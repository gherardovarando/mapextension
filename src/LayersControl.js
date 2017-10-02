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
     this.baselist.addSearch({
       hide: true,
       toggle: true
     });
     this.tileslist = new ListGroup(this.content);
     this.tileslist.addSearch({
       hide: true,
       toggle: true
     });
     this.tileslist.element.classList.add('tiles-list');
     this.overlaylist = new ListGroup(this.content);
     this.overlaylist.addSearch({
       hide: true,
       toggle: true
     });
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
   setViewer(viewer) {
     this.viewer = viewer;
     this.selectedRegions = [];
     this.selectedMarkers = [];

     this.viewer.addEventListener('ipc-message', (e) => {
       this._parseViewerMsg(e);
     });

   }


   _parseViewerMsg(e) {
     let ch = e.channel;
     let msg = e.args[0];

     switch (ch) {
       case 'loading':
         gui.setProgress(100 * (msg.i+1) / msg.tot);
         break;
       case 'clear':
         this.baselist.clean();
         this.tileslist.clean();
         this.overlaylist.clean();
         this.datalist.clean();
         this.baseLayer = null;
         this.regionsWidget.clean();
         this.markersWidget.clean();
         this.selectedRegions = [];
         gui.viewTrick();
         break;
       case 'reload':

         break;
       case 'set:configuration':
         break;
       case 'set:options':

         break;
       case 'load:layer':
         this.addLayer(msg.configuration);
         break;
       case 'load:control':
         break;
       case 'set:map':
         break;
       case 'add:drawnitems':
         this.builder._configuration.layers.drawnItems = msg.configuration;
         gui.viewTrick();
         break;
       default:
     }

   }

   addData(configuration) {

   }

   addLayer(configuration) {
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
         tools = this.createToolbox(configuration, {
           opacity: true
         });

         if (configuration.baseLayer) {
           if (!this.baseLayer) {
             this.baseLayer = configuration;
           }
         }
         customMenuItems.push(new MenuItem({
           label: 'Delete',
           click: () => {
             if (this.baseLayer === configuration) {
               return;
             }
             list.removeItem(configuration._id);
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
             if (this.baseLayer === configuration) return;
             list.removeItem(`${configuration._id}`);
             configuration.baseLayer = menuItem.checked;
           }
         }));
         break;
       case 'tileLayer':
         if (configuration.baseLayer) {
           list = this.baselist;
         } else {
           list = this.tileslist;
         }
         tools = this.createToolbox(configuration, {
           opacity: true
         });

         if (configuration.baseLayer) {
           if (!this.baseLayer) {
             this.baseLayer = configuration;
           }
         }
         customMenuItems.push(new MenuItem({
           label: 'Delete',
           click: () => {
             if (this.baseLayer === configuration) {
               return;
             }
             list.removeItem(configuration._id);
             let key = util.findKeyId(configuration._id, this.builder._configuration.layers);
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
             if (this.baseLayer === configuration) return;
             list.removeItem(`${configuration._id}`);
             configuration.baseLayer = menuItem.checked;
           }
         }));
         break;
       case 'imageOverlay':
         tools = this.createToolbox(configuration, {
           opacity: true
         });
         customMenuItems.push(new MenuItem({
           label: 'Delete',
           click: () => {
             this.tileslist.removeItem(`${configuration._id}`);
           }
         }));
         list = this.tileslist;
         break;
       case 'featureGroup':
         tools = this.createToolbox(configuration, {
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
           }
         }));
         list = this.overlaylist;
         break;
       case 'layerGroup':
         tools = this.createToolbox(configuration, {
           opacity: true,
           color: true,
           weight: true
         });
         customMenuItems.push(new MenuItem({
           label: 'Delete',
           click: () => {
             this.overlaylist.removeItem(`${configuration._id}`);
           }
         }));
         list = this.overlaylist;
         break;
       case 'polygon':
         list = this.regionsWidget;
         customMenuItems.push(new MenuItem({
           label: 'Color',
           submenu: colors.menu({
             color: configuration.options.color,
             defineNew: true,
             click: (col) => {
               configuration.options.color = col;
               configuration.options.fillColor = col;
             }
           })
         }));
         customMenuItems.push(new MenuItem({
           label: 'Delete',
           click: () => {
             if (this.selectedRegions.length > 0) {
               this._deleteRegionsCheck(this.selectedRegions);
               this.selectedRegions = [];
             } else {
               this._deleteRegionsCheck([configuration]);
             }
           }
         }));
         break;
       case 'rectangle':
         list = this.regionsWidget;
         customMenuItems.push(new MenuItem({
           label: 'Color',
           submenu: colors.menu({
             color: configuration.options.color,
             defineNew: true,
             click: (col) => {
               configuration.options.color = col;
               configuration.options.fillColor = col;
             }
           })
         }));
         customMenuItems.push(new MenuItem({
           label: 'Delete',
           click: () => {
             if (this.selectedRegions.length > 0) {
               this._deleteRegionsCheck(this.selectedRegions);
               this.selectedRegions = [];
             } else {
               this._deleteRegionsCheck([configuration]);
             }
           }
         }));
         break;
       case 'circle':
         list = this.regionsWidget;
         customMenuItems.push(new MenuItem({
           label: 'Color',
           submenu: colors.menu({
             color: configuration.options.color,
             defineNew: true,
             click: (col) => {
               configuration.options.color = col;
               configuration.options.fillColor = col;
             }
           })
         }));
         customMenuItems.push(new MenuItem({
           label: 'Delete',
           click: () => {
             if (this.selectedRegions.length > 0) {
               this._deleteRegionsCheck(this.selectedRegions);
             } else {
               this._deleteRegionsCheck([configuration]);
             }
           }
         }));
         break;
       case 'polyline':
         list = this.regionsWidget;
         break;
       case 'marker':
         list = this.markersWidget;
         customMenuItems.push(new MenuItem({
           label: 'Delete',
           click: () => {
             this._deleteMarkerCheck(this.selectedMarkers);
           }
         }));
         customMenuItems.push(new MenuItem({
           label: 'Edit',
           click: () => {
             this._editMarkerDetails(configuration);
           }
         }));
         break;
       default:
         list = this.overlaylist;

     }
     this._addToList(configuration, customMenuItems, tools, list);
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
   _addToList(configuration, customMenuItems, tools, list) {
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

     //  let titleTable = util.div('table-container');
     //  let txtTitleContainer = util.div('cell full-width');
     //  txtTitleContainer.appendChild(txtTitle);
     //  titleTable.appendChild(txtTitleContainer);
     let context = new Menu();
     context.append(new MenuItem({
       label: 'Search',
       click: () => {
         list.search.toggle();
       }
     }));
     context.append(new MenuItem({
       label: 'Rename',
       click: () => {
         this._rename(configuration, list);
         //txtTitle.readOnly = false;
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
       title: txtTitle,
       details: tools,
       active: false,
       oncontextmenu: () => {
         context.popup();
       },
       onclick: {
         active: (item, e) => {
           if (['polygon', 'circle', 'rectangle'].indexOf(configuration.type) >= 0) {
             this.selectedRegions.push(configuration);
             gui.notify(`${configuration.name} selected, (${this.selectedRegions.length} tot)`);
           } else if (configuration.type === 'marker') {
             this.selectedMarkers.push(configuration);
             gui.notify(`${configuration.name} selected, (${this.selectedMarkers.length} tot)`);
           }
           if (tools) {
             tools.hide();
           }
         },
         deactive: (item, e) => {
           if (['polygon', 'circle', 'rectangle'].indexOf(configuration.type) >= 0) {
             this.selectedRegions.splice(this.selectedRegions.indexOf(configuration), 1);
             gui.notify(`${configuration.name} deselected, (${this.selectedRegions.length} tot)`);
           } else if (configuration.type === 'marker') {
             this.selectedMarkers.splice(this.selectedMarkers.indexOf(configuration), 1);
             gui.notify(`${configuration.name} deselected, (${this.selectedMarkers.length} tot)`);
           } else {
             if (!configuration.baseLayer) {} else {
               list.activeItem(item);
             }
           }
           if (tools) {
             tools.hide();
           }
         }
       },
       toggle: true,
       key: configuration.name + configuration.type
     });

   }

   /**
    *
    * @param {Object} layer
    * @param {boolean} hasOpacityControl
    * @param {boolean} hasColorControl
    * @param {boolean} hasRadiusControl
    */
   createToolbox(configuration, options) {
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

         }
       });
       first.appendChild(opacityCell);
     }
     return toolbox;
   }


   _removeRegion(configuration) {
     this.regionsWidget.removeItem(configuration._id);
     this.selectedRegions.splice(this.selectedRegions.indexOf(configuration), 1);
   }



   _removeMarker(configuration) {
     this.markersWidget.removeItem(configuration._id);
     this.selectedMarkers.splice(this.selectedMarkers.indexOf(configuration), 1);
   }

   _rename(configuration, list) {
     let txtLayerName = input.input({
       type: "text",
       id: `txtLayerName_${configuration._id}_modal`,
       value: configuration.name,
       label: ''
     });
     let modal = new Modal({
       title: `rename ${configuration.type}`,
       height: 'auto',
       body: txtLayerName,
       onsubmit: () => {
         configuration.name = txtLayerName.value;
         list.setTitle(configuration._id, configuration.name);
       }
     });
     modal.show();
   }

   _editMarkerDetails(configuration) {
     // OPEN A MODAL ASKING FOR DETAILS.
     var modal = new Modal({
       title: "Edit marker details",
       height: "auto",
       onsubmit: () => {
         configuration.name = txtMarkerName.value;
         configuration.details = taMarkerDetails.value;
         this.markersWidget.setTitle(configuration._id, configuration.name);
       },
       oncancel: () => {
         configuration.name = txtMarkerName.value;
         configuration.details = taMarkerDetails.value;
         this.markersWidget.setTitle(configuration._id, configuration.name);
       }
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
     modal.addBody(grid.element);
     modal.show();
   }

   _deleteMarkerCheck(markers) {
     dialog.showMessageBox({
       title: 'Delete selected marker?',
       type: 'warning',
       buttons: ['No', 'Yes'],
       message: `Delete the selected marker? (no undo available)`,
       detail: `Marker to be deleted: ${markers.map((c) => { return c.configuration.name })}.`,
       noLink: true
     }, (id) => {
       if (id > 0) {
         markers.map((c) => {
           this._removeMarker(c.configuration);
         });
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
           this._removeRegion(c.configuration);
         });
       }
     });
   }





 }

 module.exports = LayersControl;
