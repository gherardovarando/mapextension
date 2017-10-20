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

"use strict"

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
  input
} = require('electrongui') // use module.parent so it can be imported
const path = require('path')
const sizeOf = require('image-size')
const ConvertTiff = require('tiff-to-png')
const json2csv = require('json2csv')
const fs = require('fs')
const mapio = require('./src/mapio.js')
const LayersControl = require('./src/LayersControl.js')

const JSONEditor = require('jsoneditor')
const leaflet = require('leaflet')
const leafletMarkerCluster = require('leaflet.markercluster')
window.Papa = require('papaparse') //we have to define Papa as a global object
const leafletcsvtiles = require('leaflet-csvtiles')
const geometryutil = require('leaflet-geometryutil')
const leafletDraw = require('leaflet-draw')
require('leaflet-multilevel')
const snap = require(`leaflet-snap`)
const builder = require('leaflet-map-builder')
const isDev = require('electron-is-dev')
const {
  ipcRenderer
} = require('electron')
const {
  dialog,
  Menu,
  MenuItem,
  globalShortcut,
  app
} = require('electron').remote
const icon = 'fa fa-map'
const CRSs = {
  simple: L.CRS.Simple,
  EPSG3395: L.CRS.EPSG3395,
  EPSG3857: L.CRS.EPSG3857,
  EPSG4326: L.CRS.EPSG4326
}
const layerTypes = ['tileLayer', 'tileLayerWMS', 'imageOverlay', 'guideLayer', 'csvTiles', 'featureGroup', 'layerGroup']
const drawObjects = ['marker', 'polygon', 'rectangle', 'polyline', 'circle', 'circlemarker']
const drawIcons = {
  marker: 'fa fa-map-pin',
  circle: 'fa fa-circle-o',
  rectangle: 'fa fa-square-o',
  polyline: '',
  polygon: '',
  circleMarker: ''
}


/**
Map extension
 */
class MapExtension extends GuiExtension {

  /**
   * Creates an instance of the extension.
   * A menu with all capabilities is defined.
   */
  constructor(gui) {
    super(gui, {
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
            this.gui.alerts.add('You should enable expert mode in Maps->settings to see raw configuration', 'warning')
          } else {
            this.configEditor.set(this.activeConfiguration)
            this.mapPane.toggleSecondPane()
          }
        },
        accelerator: 'CommandOrControl + P'
      }, {
        label: 'Reload map',
        click: () => {
          if (this.builder instanceof L.MapBuilder) {
            this.builder.reload()
          }
        }
      }, {
        type: 'separator'
      }, {
        label: 'Load map',
        click: () => {
          mapio.loadMapFile((conf) => {
            this.addNewMap(conf)
            this.gui.alerts.add(`${conf.name} map loaded`, 'success')
          })
        }
      }, {
        label: 'Create map',
        click: () => {
          mapio.modal.createMap((conf) => {
            this.addNewMap(conf)
            //this.gui.alerts.add(`map created`,'success')
          })
        }
      }, {
        label: 'Export map',
        click: () => {
          mapio.saveAs(this.activeConfiguration, (c, p) => {
            this.gui.alerts.add(`${c.name} map saved in ${p}`, 'success')
          }, (c, p, err) => {
            this.gui.alerts.add(`Error saving ${c.name} map in ${p} ${err}`, 'error')
          })
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
              this.gui.alerts.add('First load or create a map', 'warning')
              return
            }
            this.openLayerFile()
          }
        }, {
          label: 'Tiles Url',
          click: () => {
            if (!this._isLoaded) {
              this.gui.alerts.add('First load or create a map', 'warning')
              return
            }
            mapio.modal.tileLayer((conf) => {
              this.addLayer(conf)
            })
          }
        }, {
          label: 'CsvTiles ',
          click: () => {
            if (!this._isLoaded) {
              this.gui.alerts.add('First load or create a map', 'warning')
              return
            }
            mapio.modal.csvTiles((conf) => {
              this.addLayer(conf)
            })
          }
        }, {
          label: 'Guide',
          click: () => {
            if (!this._isLoaded) {
              this.gui.alerts.add('First load or create a map', 'warning')
              return
            }
            mapio.modal.guideLayer((conf) => {
              this.addLayer(conf)
            })
          }
        }]
      }, {
        label: "Settings",
        click: () => {
          this._settingsModal()
        }
      }]
    })
    this._settings = {
      multiRegionSelect: true,
      multiMarkerSelect: false,
      crs: 'simple',
      zoomControl: false,
      tooltip: true,
      popup: true,
      expert: isDev,
    }
    this._options = {
      toolbar: true,
      map: {
        zoomSnap: 1,
        zoomDelta: 1,
        crs: 'simple',
        zoomControl: false,
        multilevel: true,
        levelControl: true
      },
      builder: {
        dev: true,
        controls: {
          draw: {
            position: 'bottomleft',
            draw: {
              polyline: false,
              marker: {},
              circlemarker: false,
              polygon: {
                allowIntersection: false
              },
              rectangle: true,
              circle: {}
            },
            edit: {
              allowIntersection: false
            }
          },
          zoom: false,
          layers: () => {}
        },
        tooltip: {
          polygon: true,
          rectangle: true,
          marker: true,
          circle: true,
          circlemarker: true
        },
        popup: {
          marker: false,
          polygon: false,
          rectangle: false,
          circle: true,
          circlemarker: true
        }
      }
    }
    this.maps = {}
    this.activeConfiguration = null
    this._indx = 0
  }

  /**
   * Redefine the show method so to apply the viewTrick, sometimes the leaflet map get stucked and we need to resize the window (probably to force the computation of the styles and html elements).
   */
  show() {
    super.show()
    this.gui.viewTrick()
  }

  /**
   * Activates the extension.
   */
  activate() {
    super.activate()
    this.appendMenu()
    this.addToggleButton({
      id: this.constructor.name,
      buttonsContainer: this.gui.header.actionsContainer,
      icon: icon,
      groupId: this.constructor.name,
      title: 'Maps'
    })
    //if (this._options.toolbar || true) this._addToolbar()
    //add the sidebars
    this.sidebar = new Sidebar(this.element, {
      className: 'pane-sm scrollable'
    })
    this.sidebar.split = new SplitPane(util.div(), SplitPane.Type.VERTICAL, 60)
    this.sidebar.split.appendTo(this.sidebar)
    this.sidebar.split.showSecondPane()
    this.sidebar.show()

    this.mapsList = new ListGroup('mapslist')
    this.mapsList.addSearch({
      placeholder: 'Search maps'
    })

    this.sidebar.split.one.appendChild(this.mapsList.element)

    this.sidebar.element.ondragover = (ev) => {
      ev.dataTransfer.dropEffect = "none"
      for (let f of ev.dataTransfer.files) {
        let regx = /(\.((json)|(mapconfig)))$/i
        if (regx.test(f.name)) {
          ev.dataTransfer.dropEffect = "link"
          ev.preventDefault()
        }
      }
    }
    this.sidebar.element.ondrop = (ev) => {
      ev.preventDefault()
      for (let f of ev.dataTransfer.files) {
        let regx = /(\.((json)|(mapconfig)))$/i
        if (regx.test(f.name)) {
          mapio.loadMap(f.path, (conf) => {
            this.addNewMap(conf)
            this.gui.alerts.add(`${conf.name} map loaded`, 'success')
          })
        }
      }
    }

    this.mapPane = new SplitPane(util.div())

    this.mapPane.one.ondragover = (ev) => {
      ev.dataTransfer.dropEffect = "none"
      for (let f of ev.dataTransfer.files) {
        let regx = /(\.((json)|(layerconfig)|(jpg)|(gif)|(csv)|(jpg)|(png)|(tif)|(tiff)))$/i
        if (regx.test(f.name) && (this._isLoaded)) {
          ev.dataTransfer.dropEffect = "link"
          ev.preventDefault()
        }
      }
    }
    this.mapPane.one.ondrop = (ev) => {
      ev.preventDefault()
      for (let f of ev.dataTransfer.files) {
        let regx = /(\.((json)|(layerconfig)|(jpg)|(gif)|(csv)|(jpg)|(png)|(tif)|(tiff)))$/i
        if (regx.test(f.name) && (this._isLoaded)) {
          this.addLayerFile(f.path)
        }
      }
    }
    this.appendChild(this.mapPane)
    this.mapPane.show()
    this.builder = new L.MapBuilder() //initialize the map builder

    this.builder.on('set:configuration', (e) => {
      this.activeConfiguration = e.configuration
    })
    this.builder.on('clear', () => {
      this._isLoaded = false
      this.configEditor.set({})
    })
    this.builder.on('reload', () => {
      this._isLoaded = true
      this.configEditor.set(this.activeConfiguration)
      this.gui.viewTrick()
    })

    this.layersControl = new LayersControl(this.gui)
    this.layersControl.setBuilder(this.builder) //link the layerscontrol to the builder


    let configDisplay = util.div('')
    configDisplay.style.width = '100%'
    configDisplay.style.height = '100%'
    let bar = util.div('top-bar')
    bar.innerHTML = "DANGER!! You can now edit directly the configuration of the selected map, you should do it just if you really knows what you are doing otherwise you could break the map and be unable to use it. To save the configuration press Ctrl + Enter"
    bar.oncontextmenu = () => {
      (Menu.buildFromTemplate(
        [{
          label: 'I am an expert...trust me',
          click: () => bar.style.display = 'none'
        }]
      )).popup()
    }
    configDisplay.appendChild(bar)
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
        if (!node.field) return true
        if (node.field.startsWith('_') || node.field == 'id') return false
        return true
      }
    })
    configDisplay.addEventListener('keyup', (e) => {
      if (e.key == 'Enter' && e.ctrlKey) {
        let conf = this.configEditor.get()
        Object.assign(this.maps[this.activeConfiguration._id], conf)
        this.builder.setConfiguration(this.maps[this.activeConfiguration._id])
      }
    })
    this.mapPane.two.appendChild(configDisplay)

    this.sidebarOverlay = new Sidebar(this.element, {
      className: 'pane-sm scrollable'
    })
    this.sidebarOverlay.show()

    let sidebarOverlayTabGroup = new TabGroup(this.sidebarOverlay)
    sidebarOverlayTabGroup.addItem({
      id: `regions`,
      name: `Regions`
    })
    sidebarOverlayTabGroup.addItem({
      id: `markers`,
      name: `Markers`
    })

    sidebarOverlayTabGroup.addClickListener(`regions`, () => {
      this.layersControl.regionsWidget.show()
      this.layersControl.markersWidget.hide()
    })
    sidebarOverlayTabGroup.addClickListener(`markers`, () => {
      this.layersControl.markersWidget.show()
      this.layersControl.regionsWidget.hide()
    })

    this.sidebarOverlay.addList(this.layersControl.regionsWidget)
    this.sidebarOverlay.addList(this.layersControl.markersWidget)
    this.sidebar.split.two.appendChild(this.layersControl.layersWidget.element)

    /**
     * check if there is the workspace, and add the space of this application, moreover check if there are some maps and load them.
     */
    if (this.gui.workspace) {

      this.gui.workspace.addSpace('mapextension', {
        options: this._options,
        maps: this.maps
      })

      let loadWorkspace = () => {
        this.gui.alerts.add('loading maps from workspace...', 'default')
        if (this.builder) this.builder.clear(true)
        if (this.mapsList) this.mapsList.clean()
        this.maps = {}
        let wk = this.gui.workspace.getSpace('mapextension')
        let maps = {}
        if (wk && wk.maps) maps = wk.maps
        if (wk && wk.options) {
          this._options = wk.options
        } else {
          this._settingsModal()
        }
        let tot = 0
        Object.keys(maps).map((id, i) => {
          this.addNewMap(mapio.parseMap(maps[id]))
          tot++
        })
        this.gui.workspace.addSpace('mapextension', {
          maps: this.maps,
          options: this._options
        }, true) //overwriting
        this._setMap()
        this.gui.alerts.add(`${tot} maps from workspace loaded`, 'default')
      }

      this.gui.workspace.on('load', loadWorkspace)
      this.on('deactivate', () => {
        this.gui.workspace.removeListener('load', loadWorkspace)
      })

      //check if there is a mapPage space in the current workspace and retrive it, this is useful on deactivate/activate of MapExtension
      loadWorkspace()

    } else {
      this._setMap()
    }

  } //end activate

  /**
   * deactivate the extension
   */
  deactivate() { /// the extension has to take care of removing all the buttons and element appended outside of the main extension pane
    this.builder.map.off() //unbind all events
    this.removeToggleButton(this.constructor.name) //this is compulsory to leave the interface clean
    this._removeToolbar()
    super.deactivate() //we will also call the super class deactivate method
  }




  _addToolbar() {
    this._removeToolbar()
    this.gui.header.actionsContainer.addButton({
      id: `${this.constructor.name}newmap`,
      groupId: this.constructor.name,
      icon: 'fa fa-plus',
      title: 'Add..',
      className: 'btn-default btn-dropdown',
      action: (btn) => {
        let ctn = Menu.buildFromTemplate([{
            label: 'Create map',
            click: () => {
              mapio.modal.createMap((conf) => {
                this.addNewMap(conf)
              })
            }
          },
          {
            label: 'Load map',
            click: () => {
              mapio.loadMapFile((conf) => {
                this.addNewMap(conf)
                this.gui.alerts.add(`${conf.name} map loaded`, 'success')
              })
            }
          },
          {
            label: 'Add layer',
            type: 'submenu',
            submenu: [{
              label: 'File',
              click: () => {
                if (!this._isLoaded) {
                  this.gui.alerts.add('First load or create a map', 'warning')
                  return
                }
                this.openLayerFile()
              }
            }, {
              label: 'Tiles Url',
              click: () => {
                if (!this._isLoaded) {
                  this.gui.alerts.add('First load or create a map', 'warning')
                  return
                }
                mapio.modal.tileLayer((conf) => {
                  this.addLayer(conf)
                })
              }
            }, {
              label: 'CsvTiles ',
              click: () => {
                if (!this._isLoaded) {
                  this.gui.alerts.add('First load or create a map', 'warning')
                  return
                }
                mapio.modal.csvTiles((conf) => {
                  this.addLayer(conf)
                })
              }
            }, {
              label: 'Guide',
              click: () => {
                if (!this._isLoaded) {
                  this.gui.alerts.add('First load or create a map', 'warning')
                  return
                }
                mapio.modal.guideLayer((conf) => {
                  this.addLayer(conf)
                })
              }
            }]
          }
        ])
        ctn.popup()
      }
    })
    let expBtn = this.gui.header.actionsContainer.addButton({
      id: `${this.constructor.name}savemap`,
      groupId: this.constructor.name,
      icon: 'icon icon-down-bold icon-warning',
      title: 'export current map',
      action: () => {
        if (this._isLoaded) {
          mapio.saveAs(this.activeConfiguration, (c, p) => {
            this.gui.alerts.add(`${c.name} map saved in ${p}`, 'success')
          }, (c, p, err) => {
            this.gui.alerts.add(`Error saving ${c.name} map in ${p} ${err}`, 'error')
          })
        }
      }
    })
    if (this._isLoaded) {
      expBtn.children[0].classList.remove('icon-warning')
      expBtn.children[0].classList.add('icon-primary')
    }
    this.builder.on('clear', () => {
      expBtn.children[0].classList.add('icon-warning')
      expBtn.children[0].classList.remove('icon-primary')
    })
    this.builder.on('reload', () => {
      expBtn.children[0].classList.remove('icon-warning')
      expBtn.children[0].classList.add('icon-primary')
    })
    this.gui.header.actionsContainer.addButton({
      id: `${this.constructor.name}setting`,
      groupId: this.constructor.name,
      icon: 'fa fa-cog',
      title: 'settings',
      action: () => {
        this._settingsModal()
      }
    })

  }

  _removeToolbar() {
    this.gui.header.actionsContainer.removeButton(`${this.constructor.name}newmap`)
    this.gui.header.actionsContainer.removeButton(`${this.constructor.name}savemap`)
    this.gui.header.actionsContainer.removeButton(`${this.constructor.name}setting`)
  }

  show() {
    super.show()
    this._addToolbar()
  }

  hide() {
    super.hide()
    this._removeToolbar()
  }


  _setMap() {
    this.mapPane.one.clear()
    if (this.map) this.map.off()
    let mapCont = util.div()
    mapCont.style.width = '100%'
    mapCont.style.height = '100%'
    mapCont.style['z-index'] = 0
    let mapOpt = util.clone(this._options.map)
    mapOpt.crs = CRSs[mapOpt.crs || 'simple']
    mapCont.id = this._options.map.id || 'map'
    this.mapPane.one.appendChild(mapCont)
    let map = L.map(this._options.map.id || 'map', mapOpt) //define map object
    this.map = map
    this.builder.clear()
    this.builder.setMap(this.map)
    this._options.builder.controls.layers = () => {}
    this.builder.setOptions(this._options.builder)
  }


  /**
   * Show a modal with the setting relatives to the extension
   */
  _settingsModal() {
    let mR = false
    let bR = false
    let modal = new Modal({
      title: ``,
      width: '400px',
      height: 'auto',
      noCloseIcon: true,
      parent: this,
      onsubmit: () => {
        if (mR) {
          this._setMap()
        } else if (bR) {
          this.builder.setOptions(this._options.builder)
        }
      },
      oncancel: () => {
        if (mR) {
          this._setMap()
        } else if (bR) {
          this.builder.setOptions(this._options.builder)
        }
      }
    })
    let body = util.div('pane-group pane')
    let sid = new Sidebar(body, {
      className: 'pane-sm'
    })
    sid.addList()
    sid.addItem({
      id: 'map',
      title: 'Map ',
      icon: 'fa fa-map-o',
      toggle: true,
      active: true,
      onclick: {
        deactive: () => {
          sid.list.activeItem('map')
        },
        active: () => {
          hideA()
          sid.list.deactiveAll()
          cmap.show()
        }
      }
    })
    sid.addItem({
      id: 'interface',
      title: 'Interface',
      icon: 'fa fa-hand-pointer-o',
      toggle: true,
      onclick: {
        deactive: () => {
          sid.list.activeItem('interface')
        },
        active:
          () => {
            hideA()
            sid.list.deactiveAll()
            cinterface.show()
          }
      }
    })
    sid.addItem({
      id: 'popup',
      title: 'popup',
      icon: 'fa fa-comment-o',
      toggle: true,
      onclick: {
        deactive: () => {
          sid.list.activeItem('popup')
        },
        active:
          () => {
            hideA()
            sid.list.deactiveAll()
            cpopup.show()
          }
      }
    })
    sid.addItem({
      id: 'tooltip',
      title: 'tooltip',
      icon: 'fa fa-tag',
      toggle: true,
      onclick: {
        deactive: () => {
          sid.list.activeItem('tooltip')
        },
        active:
          () => {
            hideA()
            sid.list.deactiveAll()
            ctooltip.show()
          }
      }
    })
    sid.addItem({
      id: 'draw',
      title: 'draw',
      icon: 'fa fa-pencil',
      toggle: true,
      onclick: {
        deactive: () => {
          sid.list.activeItem('draw')
        },
        active: () => {
          hideA()
          sid.list.deactiveAll()
          cdraw.show()
        }
      }
    })
    sid.show()

    let cpopup = new ToggleElement(util.div('pane padded'))
    let ctooltip = new ToggleElement(util.div('pane padded'))
    let cinterface = new ToggleElement(util.div('pane padded'))
    let cmap = new ToggleElement(util.div('pane padded'))
    let cdraw = new ToggleElement(util.div('pane padded'))
    let hideA = () => {
      cinterface.hide()
      cpopup.hide()
      ctooltip.hide()
      cinterface.appendTo(body)
      cmap.hide()
      cdraw.hide()
    }

    hideA()
    cpopup.appendTo(body)
    ctooltip.appendTo(body)
    cinterface.appendTo(body)
    cmap.appendTo(body)
    cdraw.appendTo(body)
    cmap.show()

    input.checkButton({
      makeContainer: true,
      parent: cinterface,
      autofocus: true, //needed to use esc and enter modal commands
      className: 'cell',
      active: this._settings.expert,
      text: "Expert mode",
      onactivate: () => {
        this.gui.alerts.add('Expert mode enabled, press Ctrl + P to modify configuration', 'warning')
        this._settings.expert = true
      },
      ondeactivate: () => {
        this.gui.alerts.add('Expert mode disables', 'default')
        this._settings.expert = false
      }
    })
    input.checkButton({
      makeContainer: true,
      parent: cinterface,
      autofocus: true, //needed to use esc and enter modal commands
      className: '',
      active: this._settings.multiRegionSelect,
      text: "Region multi select",
      onactivate: () => {
        this._settings.multiRegionSelect = true
      },
      ondeactivate: () => {
        this._settings.multiRegionSelect = false
      }
    })
    input.checkButton({
      makeContainer: true,
      parent: cinterface,
      className: 'cell',
      active: this._settings.multiMarkerSelect,
      text: "Marker multi select",
      onactivate: () => {
        this._settings.multiMarkerSelect = true
      },
      ondeactivate: () => {
        this._settings.multiMarkerSelect = false
      }
    })


    drawObjects.map((k) => {
      input.checkButton({
        makeContainer: true,
        parent: cdraw,
        className: 'cell',
        text: k,
        active: this._options.builder.controls.draw.draw[k],
        onactivate: () => {
          this._options.builder.controls.draw.draw[k] = {
            allowIntersection: this._options.builder.controls.draw.edit.allowIntersection,
            snapDistance: 5,
            showArea: false,
            shapeOptions: {}
          }
          bR = true
        },
        ondeactivate: () => {
          this._options.builder.controls.draw.draw[k] = false
          bR = true
        }
      })
    })

    input.checkButton({
      makeContainer: true,
      parent: cdraw,
      className: 'cell',
      text: 'allowIntersection',
      active: this._options.builder.controls.draw.edit.allowIntersection,
      onactivate: () => {
        this._options.builder.controls.draw.edit.allowIntersection = true
        if (this._options.builder.controls.draw.draw.polygon) {
          this._options.builder.controls.draw.draw.polygon.allowIntersection = true
        }
        bR = true
      },
      ondeactivate: () => {
        this._options.builder.controls.draw.edit.allowIntersection = false
        if (this._options.builder.controls.draw.draw.polygon) {
          this._options.builder.controls.draw.draw.polygon.allowIntersection = false
        }
        bR = true
      }
    })



    input.selectInput({
      parent: cmap,
      className: 'form-control cell',
      label: 'CRS',
      choices: Object.keys(CRSs),
      value: this._options.map.crs || 'simple',
      oninput: (inp) => {
        this._options.map.crs = inp.value
        mR = true
      }
    })
    input.checkButton({
      makeContainer: true,
      parent: cmap,
      className: 'cell',
      active: this._options.builder.zoomControl,
      text: "Zoom control",
      onactivate: () => {
        this._options.builder.zoomControl = true
        mR = true
      },
      ondeactivate: () => {
        this._options.builder.zoomControl = false
        mR = true
      }
    })
    input.checkButton({
      makeContainer: true,
      parent: cmap,
      className: 'cell',
      active: this._options.map.multilevel,
      text: "Multi level",
      onactivate: () => {
        this._options.map.multilevel = true
        mR = true
      },
      ondeactivate: () => {
        this._options.map.multilevel = false
        mR = true
      }
    })



    drawObjects.map((k) => {
      input.checkButton({
        makeContainer: true,
        parent: cpopup,
        className: 'cell',
        active: this._options.builder.popup[k],
        text: k + ' ',
        icon: drawIcons[k],
        onactivate: () => {
          this._options.builder.popup[k] = true
          bR = true
        },
        ondeactivate: () => {
          this._options.builder.popup[k] = false
          bR = true
        }
      })

      input.checkButton({
        makeContainer: true,
        parent: ctooltip,
        className: 'cell',
        active: this._options.builder.tooltip[k],
        text: k + ' ',
        icon: drawIcons[k],
        onactivate: () => {
          this._options.builder.tooltip[k] = true
          bR = true
        },
        ondeactivate: () => {
          this._options.builder.tooltip[k] = false
          bR = true
        }
      })
    })

    modal.addBody(body)
    modal.show()
  }


  /**
   * Add a new map to the current workspace and map list
   * @param {[type]} configuration map configuration object
   */
  addNewMap(configuration) {
    configuration._id = this._indx++
      try { //try to set the builder to the configuration
        this.builder.setConfiguration(configuration)
      } catch (e) {
        // otherwise means that the builder is unable to load the map
        this.gui.alerts.add(e, 'error')
        return
      }
    let body = new ToggleElement(document.createElement('DIV'))

    let ic
    switch (configuration.source) { //choose the appropriate icon base on the source field
      case 'remote':
        ic = 'icon icon-network'
        break
      case 'local':
        ic = ''
        break
      case 'mixed':
        ic = ''
        break
      default:
        ic = ''
    }

    let ctn = new Menu() //build the contextual menu
    ctn.append(new MenuItem({
      label: 'Export map',
      type: 'normal',
      click: () => {
        mapio.saveAs(this.activeConfiguration, (c, p) => {
          this.gui.alerts.add(`${c.name} map saved in ${p}`, 'success')
        }, (c, p, err) => {
          this.gui.alerts.add(`Error saving ${c.name} map in ${p} ${err}`, 'error')
        })
      }
    }))
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
            if (this.activeConfiguration && this.activeConfiguration._id == configuration._id) {
              this.builder.clear(true)
            }
            this.mapsList.removeItem(configuration._id)
            delete this.maps[configuration._id]
          }
        })

      }
    }))


    let title = document.createElement('STRONG')
    title.innerHTML = configuration.name

    this.mapsList.addItem({
      id: configuration._id,
      title: title,
      key: `${configuration.name} ${configuration.date} ${configuration.authors}`,
      icon: ic,
      toggle: true,
      oncontextmenu: () => {
        ctn.popup()
      },
      onclick: {
        active: () => {
          this.mapsList.deactiveAll()
          //this.mapsList.hideAllDetails()
          //this.mapsList.showDetails(configuration._id)
          this.builder.setConfiguration(configuration)
          this.gui.viewTrick()
        },
        deactive: () => {
          //this.mapsList.hideAllDetails()
          this.builder.clear(true)
        }
      }
    })

    this.maps[configuration._id] = configuration
    this.mapsList.deactiveAll()
    this.mapsList.hideAllDetails()
    this.mapsList.activeItem(configuration._id)
    //this.mapsList.showDetails(configuration._id)
    this.show()
  }




  /**
   * Shows a dialog to open a file and add the selected layer to the current map
   * @param  {FileFilter[]} filters  optional filters for the accepted extensions
   */
  openLayerFile(filters) {
    if (Object.keys(this.maps).length <= 0) return
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
      if (!filenames) return
      if (filenames.length === 0) return
      fs.stat(filenames[0], (err, stats) => {
        if (err) return
        if (stats.isFile()) {
          dialog.showMessageBox({
            title: 'Add Layer?',
            type: 'warning',
            buttons: ['No', "Yes"],
            message: `Add layer from  ${filenames[0]} to map ${this.builder._configuration.name} ?`,
            noLink: true
          }, (id) => {
            if (id > 0) {
              this.addLayerFile(filenames[0])
            }
          })
        }
      })
    })
  }

  /**
   * Add the layer defined by the file in the given path to the present active map
   * @param {string} path    [description]
   * @param {object} options [description]
   */
  addLayerFile(pth, options) {
    options = options || {}
    if (pth.endsWith('.json')) {
      let conf = util.readJSONsync(pth)
      if (!conf) return
      conf = mapio.parseLayer(conf, path.dirname(pth))
      this.addLayer(conf)
    } else if (pth.endsWith('.jpg') || pth.endsWith('.JPG') || pth.endsWith('.png') || pth.endsWith('.gif')) {
      var dim = sizeOf(pth)
      let siz = Math.max(dim.height, dim.width)
      this.addLayer({
        name: pth,
        url: pth,
        author: 'unknown',
        type: options.type || 'imageOverlay',
        options: {
          maxZoom: 8,
          maxNativeZoom: 0,
          opacity: 1,
          tileSize: [dim.width / siz * 256, dim.height / siz * 256],
          bounds: [
            [-Math.floor(dim.height * 256 / siz), 0],
            [0, Math.floor(dim.width * 256 / siz)]
          ]
        }

      })
    } else if (pth.endsWith('.csv')) {

    } else if (pth.endsWith('.tiff') || pth.endsWith('.tif')) { //convert it to png and use it
      var converter = new ConvertTiff({
        prefix: 'slice'
      })

      converter.progress = (converted, total) => {
        var dim = sizeOf(`${converted[0].target}\/slice1.png`)
        let siz = Math.max(dim.height, dim.width)
        this.addLayer({
          type: `tileLayer`,
          url: `${converted[0].target}\/slice{level}.png`,
          options: {
            tileSize: [dim.width / siz * 256, dim.height / siz * 256],
            bounds: [
              [-Math.floor(dim.height * 256 / siz), 0],
              [0, Math.floor(dim.width * 256 / siz)]
            ],
            maxNativeZoom: 0,
            maxZoom: 8,
            minLevel: 1,
            maxLevel: 100
          },
          name: pth,
          multiLevel: true,
          baseLayer: true
        })
        this.gui.alerts.add(`${pth} added`, 'success')
      }
      this.gui.alerts.add(`${pth} started conversion`, 'default')
      converter.convertArray([pth], path.dirname(pth))
    }
  }


  /**
   * add the given layer to the current map
   * @param {Object} conf configuration object of the layer to add
   */
  addLayer(conf) {
    conf = mapio.parseLayer(conf)
    this.builder.loadLayer(conf)
    this.activeConfiguration.layers[`layer_${conf._id}`] = conf
    this.gui.alerts.add(`${conf.name} layer added`, 'success')
  }


  /**
   * Load a map to the present workspace
   * @param  {String} path path of the configuration file of the map
   */
  loadMap(path) {
    mapio.loadMap(path, (conf) => {
      this.addNewMap(conf)
      this.gui.alerts.add(`${conf.name} map loaded`, 'success')
    })
  }



}


module.exports = MapExtension
