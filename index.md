### MapExtension


The MapExtension is an extension for electrongui, it permits to load a 
configuration file (in [map.json](https://github.com/gherardovarando/map.schema.json) 
format), create, export and mainly visualize maps (geographical and not geographical).

#### What is a map

A map is just an ensemble of layers, every layers can be one of the following:
- TileLayer, tiled images.
- deepZoom images (not yet but soon :smile:)
- imageLayer, one image rendered in given bounds (just small images can be rendered this way)
- csvTiles, points loaded from tiled csv.
- featureGroup/layerGroup layer (usually markers or shapes) grouped.
- polygon, rectangle, circles
- markers, circleMarkers
- geoJSON layer, render a geoJSON layer

#### Visualize


#### Settings



#### Load a map

To load a map you can either select the map.json file from the menu `Maps > Load map` or dragging the map.json file into the application, in the maps list. You can also use the :heavy_plus_sign: button in the header bar.

If in the map is defined a `basePath` variable  a warning will be shown and it will
ask you if you want to redefine locally the `basePath` value 
(just do it for locally saved maps).

#### Create a map

To create a new map use the `Maps > Create map` menu or the :heavy_plus_sign: 
button in the header bar.
You will have to input the name of the map and the map will be created, you can then add layers.

#### Add layers

First, you have to load the map where you want to add a layer. Once you have selected the map, just use the :heavy_plus_sign: button or the menu entry `Maps > Add layer` you have different choices:

##### Add layers from file

Depending on the type of file:

- **layer.json**
You have to select a valid layer.json file (it can also be simply a .json file). The layer will be added to the map's configuration and then the application will try to reload the map.
Currently there are no test to assure that the selected file is really a layer.json so do not try to load in this way other json.

- **geo.json**
If you select a geo.json file it will be imported as a geoJSON layer.

#### Export a map

To export the map as a map.json file, just select the :arrow_down: button or use the `Maps > Export map` menu.
It will try to remove basePath from the urls of the layers, 
this feature not always work (we plan to fix it soon).

#### Expert Mode

If you select expert mode from the setting menu you are going to be able to see and 
modify directly the configuration object of the map.
