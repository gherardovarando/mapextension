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
   colors
 } = module.parent.parent.require('electrongui');
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
   constructor(gui) {
     this.gui = gui;

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
       this.gui.alerts.add(e.error,'error');
     });

     this.builder.on('load:control', (e) => {
       if (e.controlType === 'draw' && this.builder.map) {
         this.builder.map.addLayer(this.builder._drawnItems);
       }
     });

     //when clean mapmanager clean interface
     this.builder.on('clear', () => {
       this.regionsWidget.clean();
       this.markersWidget.clean();
       this.selectedRegions = [];
     });

     this.builder.on('load:layer', (e) => {
       this.addLayer(e.layer, e.configuration, e.where);
     });


     this.builder.on('add:drawnitems', (e) => {
       if (this.builder._configuration && this.builder._configuration.layers){
         this.builder._configuration.layers.drawnItems = e.configuration;
       }
       this.gui.viewTrick();
     });

     this.builder.on('set:map',()=>{
       this._drawEvents()
     })


   }

   addData(configuration) {

   }

   addLayer(layer, configuration, where) {
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
            // if (this.baseLayer === layer) return;
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
             if (configuration.role && configuration.role.includes('drawnItems')) {
               this.gui.alerts.add('Better not to remove drawnItems layer...','warning');
               return;
             }
             this.overlaylist.removeItem(`${configuration._id}`);
             let key = util.findKeyId(configuration._id, this.builder._configuration.layers);
             delete this.builder._configuration.layers[key];
           }
         }));
         customMenuItems.push(new MenuItem({
           label: 'Roles',
           submenu: Menu.buildFromTemplate([{
             label: 'Guide',
             type: 'checkbox',
             checked: typeof configuration.role === 'string' && configuration.role.includes('guide'),
             click: () => {
               if ((typeof configuration.role === 'string') && configuration.role.includes('guide')) {
                 configuration.role = configuration.role.replace(/guide/g, '');
               } else if (typeof configuration.role === 'string') {
                 configuration.role = configuration.role + 'guide';
               } else {
                 configuration.role = 'guide';
               }
               this.builder.reload();
             }
           }])
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
         where.addLayer(layer);
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
             if (this.selectedRegions.length > 0) {
               this._deleteRegionsCheck(this.selectedRegions);
               this.selectedRegions = [];
             } else {
               this._deleteRegionsCheck([{
                 configuration: configuration,
                 layer: layer,
                 where: where
               }]);
             }
           }
         }));
         break;
       case 'rectangle':
         list = this.regionsWidget;
         where.addLayer(layer);
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
             if (this.selectedRegions.length > 0) {
               this._deleteRegionsCheck(this.selectedRegions);
               this.selectedRegions = [];
             } else {
               this._deleteRegionsCheck([{
                 configuration: configuration,
                 layer: layer,
                 where: where
               }]);
             }
           }
         }));
         break;
       case 'circle':
         list = this.regionsWidget;
         where.addLayer(layer);
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
             if (this.selectedRegions.length > 0) {
               this._deleteRegionsCheck(this.selectedRegions);
             } else {
               this._deleteRegionsCheck([{
                 configuration: configuration,
                 layer: layer,
                 where: where
               }]);
             }
           }
         }));
         break;
       case 'polyline':
         list = this.regionsWidget;
         break;
       case 'marker':
         list = this.markersWidget;
         where.addLayer(layer);
         customMenuItems.push(new MenuItem({
           label: 'Delete',
           click: () => {
             this._deleteMarkerCheck(this.selectedMarkers);
           }
         }));
         customMenuItems.push(new MenuItem({
           label: 'Edit',
           click: () => {
             this._editMarkerDetails(layer, configuration);
           }
         }));
         break;
       case 'circlemarker':
         list = this.markersWidget;
         where.addLayer(layer);
         customMenuItems.push(new MenuItem({
           label: 'Delete',
           click: () => {
             this._deleteMarkerCheck(this.selectedMarkers);
           }
         }));
         customMenuItems.push(new MenuItem({
           label: 'Edit',
           click: () => {
             this._editMarkerDetails(layer, configuration);
           }
         }));
         break;
       case 'circlemarker':
         list = this.markersWidget;
         where.addLayer(layer);
         customMenuItems.push(new MenuItem({
           label: 'Delete',
           click: () => {
             this._deleteMarkerCheck(this.selectedMarkers);
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
         if (['polygon', 'circle', 'rectangle', 'marker', 'circlemarker', 'circlemarker'].indexOf(configuration.type) >= 0) {
           return;
         }
         list.deactiveItem(`${e.target._id}`);
       });

       layer.on('add', (e) => {
         if (['polygon', 'circle', 'rectangle', 'marker', 'circlemarker', 'circlemarker'].indexOf(configuration.type) >= 0) {
           return;
         }
         list.activeItem(`${e.target._id}`);
       });
     }
     this.gui.viewTrick();
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

     let context = new Menu();
     context.append(new MenuItem({
       label: 'Search',
       click: () => {
         list.search.show();
       }
     }));
     context.append(new MenuItem({
       label: 'Rename',
       click: () => {
         this._rename(layer, configuration, list);
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
     layer.on('contextmenu', (e) => {
       context.popup();
     });
     list.addItem({
       id: configuration._id,
       title: txtTitle,
       details: tools,
       active: (this.baseLayer === layer) || (list === this.datalist) || (this.builder && where === this.builder.map && this.builder.map.hasLayer(layer)),
       oncontextmenu: () => {
         context.popup();
       },
       onclick: {
         active: (item, e) => {
           if (['polygon', 'circle', 'rectangle'].indexOf(configuration.type) >= 0) {
             this.selectedRegions.push({
               configuration: configuration,
               layer: layer,
               where: where
             });
             layer.setStyle({
               fillOpacity: 1
             });
             this.gui.footer.notify(`${configuration.name} selected, (${this.selectedRegions.length} tot)`);
           } else if (configuration.type === 'marker' || configuration.type.toLowerCase() === 'circlemarker') {
             this.selectedMarkers.push({
               configuration: configuration,
               layer: layer,
               where: where
             });
             if (configuration.type.toLowerCase() === 'circlemarker') {
               layer.setStyle({
                 fillOpacity: 1
               });
             }
             this.gui.footer.notify(`${configuration.name} selected, (${this.selectedMarkers.length} tot)`);
           } else {
             if (configuration.baseLayer) {
               if (this.baseLayer) where.removeLayer(this.baseLayer);
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
             this.selectedRegions.splice(this.selectedRegions.indexOf({
               configuration: configuration,
               layer: layer,
               where: where
             }), 1);
             this.gui.footer.notify(`${configuration.name} deselected, (${this.selectedRegions.length} tot)`);
             layer.setStyle({
               fillOpacity: configuration.options.fillOpacity || 0.3
             });
           } else if (configuration.type === 'marker' || configuration.type.toLowerCase() === 'circlemarker') {
             this.selectedMarkers.splice(this.selectedMarkers.indexOf({
               configuration: configuration,
               layer: layer,
               where: where
             }), 1);
             if (configuration.type.toLowerCase() === 'circlemarker') {
               layer.setStyle({
                 fillOpacity: configuration.options.fillOpacity || 0.3
               });
             }
             this.gui.footer.notify(`${configuration.name} deselected, (${this.selectedMarkers.length} tot)`);
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
             configuration.options.opacity = inp.value;
           }
           if (layer.setStyle) {
             configuration.options.opacity = inp.value;
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


   _removeRegion(configuration, layer, where) {
     if (where === this.builder._drawnItems) {
       this.builder._drawnItems.removeLayer(layer);
       let key = util.findKeyId(configuration._id, this.builder._configuration.layers.drawnItems.layers);
       this.regionsWidget.removeItem(configuration._id);
       delete this.builder._configuration.layers.drawnItems.layers[key];
       this.selectedRegions.splice(this.selectedRegions.indexOf({
         configuration: configuration,
         layer: layer,
         where: where
       }), 1);
     }
   }



   _removeMarker(configuration, layer, where) {
     if (where === this.builder._drawnItems) {
       this.builder._drawnItems.removeLayer(layer);
       let key = util.findKeyId(configuration._id, this.builder._configuration.layers.drawnItems.layers);
       this.markersWidget.removeItem(configuration._id);
       delete this.builder._configuration.layers.drawnItems.layers[key];
       this.selectedMarkers.splice(this.selectedMarkers.indexOf({
         configuration: configuration,
         layer: layer,
         where: where
       }), 1);
     }
   }

   _rename(layer, configuration, list) {
     let txtLayerName = input.input({
       autofocus: true,
       type: "text",
       id: `txtLayerName_${configuration._id}_modal`,
       value: configuration.name,
       className: 'form-control',
       label: ''
     });
     let modal = new Modal({
       title: `rename ${configuration.type}`,
       height: 'auto',
       body: txtLayerName,
       parent: this.gui.extensions.MapExtension,
       onsubmit: () => {
         configuration.name = txtLayerName.value;
         list.setTitle(configuration._id, configuration.name);
         layer.setTooltipContent(txtLayerName.value);
         layer.setPopupContent(`<strong>${txtLayerName.value}</strong> <p> ${configuration.details}</p>`);
       }
     });
     modal.show();
   }

   _editMarkerDetails(marker, configuration) {
     // OPEN A MODAL ASKING FOR DETAILS.
     var modal = new Modal({
       title: "Edit marker details",
       height: "auto",
       onsubmit: () => {
         configuration.name = txtMarkerName.value;
         configuration.details = taMarkerDetails.value;
         this.markersWidget.setTitle(configuration._id, configuration.name);
         marker.setTooltipContent(txtMarkerName.value);
         marker.setPopupContent(`<strong>${txtMarkerName.value}</strong> <p> ${taMarkerDetails.value}</p>`);
       },
       oncancel: () => {
         configuration.name = txtMarkerName.value;
         configuration.details = taMarkerDetails.value;
         this.markersWidget.setTitle(configuration._id, configuration.name);
         marker.setTooltipContent(txtMarkerName.value);
         marker.setPopupContent(`<strong>${txtMarkerName.value}</strong> <p> ${taMarkerDetails.value}</p>`);
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
           this._removeMarker(c.configuration, c.layer, c.where);
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
           this._removeRegion(c.configuration, c.layer, c.where);
         });
       }
     });
   }



   /**
    * Register the events related to leaflet draw
    */
   _drawEvents() {
     this.builder.map.on(L.Draw.Event.CREATED, (e) => {
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
         config.options.radius = layer.getRadius();
       }
       this.builder.loadLayer(config, this.builder._drawnItems);

       let key = util.nextKey(this.builder._configuration.layers.drawnItems.layers);
       this.builder._configuration.layers.drawnItems.layers[key] = config;
     });

     // when items are removed
     this.builder.map.on(L.Draw.Event.DELETED, (e) => {
       var layers = e.layers;
       layers.eachLayer((layer) => {
         this.builder._drawnItems.removeLayer(layer);
         if (layer instanceof L.Marker) {
           this._removeMarker(layer._configuration, layer, this.builder._drawnItems);
         } else if (layer instanceof L.Rectangle) {
           this._removeRegion(layer._configuration, layer, this.builder._drawnItems);
         } else if (layer instanceof L.Polygon) {
           this._removeRegion(layer._configuration, layer, this.builder._drawnItems);
         } else if (layer instanceof L.Circle) {
           this._removeRegion(layer._configuration, layer, this.builder._drawnItems);
         } else if (layer instanceof L.Polyline) {}
       });
     });

     //whne items are edited
     this.builder.map.on(L.Draw.Event.EDITED, (e) => {
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
           tooltip: layer._configuration.tooltip,
           popup: layer._configuration.popup,
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
         let key = util.findKeyId(layer._configuration._id, this.builder._configuration.layers.drawnItems.layers);
         //we have to change the configuration object, the layer in the map is already modified
         this.builder._configuration.layers.drawnItems.layers[key] = config;
       });
     });
   }


 }

 module.exports = LayersControl;
