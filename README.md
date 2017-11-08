# MapExtension
[![npm version](https://badge.fury.io/js/mapextension.svg)](https://badge.fury.io/js/mapextension)
[![MIT Licence](https://badges.frapsoft.com/os/mit/mit.png?v=103)](https://opensource.org/licenses/mit-license.php)
#### extension for [electrongui](https://gherardovarando.github.io/electrongui/)


MapExtension use [leaflet](http://leafletjs.com) to render map.
[leaflet-map-builder](https://github.com/gherardovarando/leaflet-map-builder)
is used to build the leaflet map from the configuration object. [leaflet-draw](https://github.com/Leaflet/Leaflet.draw) is used to draw ROI and markers over the map.
The extension permit to import, export, create maps add different type of layers.

### Installation

#### Dev install
Install the extension in your electron app with
`npm install --save mapextension`.


## API

As every other [GuiExtension](https://gherardovarando.github.io/electrongui/API.html#guiextension)s, MapExtension can be loaded using the electrongui [extension manager](https://gherardovarando.github.io/electrongui/API.html#extensionsmanager) `gui.extensions.load('mapextension')` once it has been installed in the electron app folder.

You can the find MapExtension as `gui.extensions.extensions.MapExtension`

### Properties

#### `builder`
An instance of [L.MapBuilder](https://github.com/gherardovarando/leaflet-map-builder).

#### `map`
An instance of L.Map.

#### `maps`
List with all the loaded maps.

#### `activeConfiguration`
The configuration of the map currently active.

### Methods

#### `loadMap(path)`

#### `addLayer(configuration)`

#### `addNewMap(configuration)`
