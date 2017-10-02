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

const leaflet = require('leaflet');
const leafletMarkerCluster = require('leaflet.markercluster');
window.Papa = require('papaparse'); //we have to define Papa as a global object
const leafletcsvtiles = require('leaflet-csvtiles');
const geometryutil = require('leaflet-geometryutil');
const leafletDraw = require('leaflet-draw');
require('leaflet-multilevel');
const snap = require(`leaflet-snap`);
const mapBuilder = require('leaflet-map-builder');
const {
  ipcRenderer
} = require('electron');

const builderEvs = ['reload', 'clear', 'set:configuration', 'load:control', 'load:layer', 'set:map']
const drawEvs = ['']

const CRSs = {
  simple: L.CRS.Simple,
  EPSG3395: L.CRS.EPSG3395,
  EPSG3857: L.CRS.EPSG3857,
  EPSG4326: L.CRS.EPSG4326
};


let nextKey = function(obj) {
    let finish = false;
    let key = 0;
    while (!finish) {
        if (Object.keys(obj).indexOf(`${key}`) >= 0) {
            key++;
        } else {
            finish = true;
        }
    }
    return key;
}

let send = function(ch, msg) {
  ipcRenderer.sendToHost(ch, msg);
}

class MapViewer {
  constructor() {
    this.mapCont = document.getElementById('map');
    //this.mapCont.style.height = '100%';
    this.mapCont.style['z-index'] = 0;

    ipcRenderer.on('exec', (event, message) => {
      let f = this[message.cmd];
      let par = message.par;
      if (typeof f === 'function') {
        f(par);
      }
    });

    ipcRenderer.on('data', (event, message) => {
      // let data = this.data[message.key];
      // event.sender.send('data', data);
    });

    ipcRenderer.on('configuration', (event, message) => {
      if (this.builder) {
        console.log(message);
        try {
          this.builder.setConfiguration(message);
        } catch (e) {
          throw (e);
        } finally {

        }
      }
    });


    ipcRenderer.on('options', (event, message) => {
      if (this.builder) {
        let options = message || {};
        options.loading = (i, tot) => {
          send('loading', {
            i: i,
            tot: tot
          });
        }
        options.controls = options.controls || {};
        options.controls.layers = {
          "autoZIndex": false,
          "sortLayers": false
        };
        this.builder.setOptions(options);
      }
    });

    ipcRenderer.on('clear', (event, message) => {
      if (this.builder) {
        this.builder.clear();
      }
    });

    ipcRenderer.on('reload', (event, message) => {
      if (this.builder) {
        this.builder.reload();
      }
    });

    ipcRenderer.on('map', (event, message) => {
      let options = {
        zoomSnap: message.zoomSnap,
        zoomDelta: message.zoomDelta,
        crs: CRSs[message.crs],
        zoomControl: message.zoomControl,
        multilevel: message.multilevel,
        levelControl: message.levelControl
      };

      this.map = L.map('map', options); //initialize map
      this.builder = new L.MapBuilder(this.map); //initialize the map builder
      builderEvs.map((evName) => {
        this.builder.on(evName, (msg) => {
          send(evName, msg);
        });
      });
      this.map.fitWorld();
      this._drawEvents();
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
        config.radius = layer.getRadius();
      }
      this.builder.loadLayer(config, this.builder._drawnItems);

      let key = nextKey(this.builder._configuration.layers.drawnItems.layers);
      this.builder._configuration.layers.drawnItems.layers[key] = config;
    });

    // when items are removed
    this.builder.map.on(L.Draw.Event.DELETED, (e) => {
      var layers = e.layers;
      layers.eachLayer((layer) => {
        this.builder._drawnItems.removeLayer(layer);
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
        //we have to change the configuration object, the layer in the map is already modified
        this.builder._configuration.layers.drawnItems.layers[layer._id] = config;
      });
    });
  }








}


module.exports = MapViewer;
