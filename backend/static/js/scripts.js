var UPDATE_RATE_SECONDS = 2;
var ALT_VIZ_FACTOR = 1;

var pollingInterval = null;

$(document).ready(function () {
    main();

    setOnAddressLookupListener();
    setOnJumpToISSLocation();
    setOnShowHistoryButtonListener();
    historySlidingBarListener();

    fetchHistoryISSData();

    pollingInterval = setInterval(function () {
        fetchISSLocation(function (data) {
            updateISSModel(data.latitude, data.longitude, data.altitude);
            drawISSShadow(data.latitude, data.longitude);
        });
        fetchGroundStations(function (data) {
            drawGroundStations(data);
        });
    }, UPDATE_RATE_SECONDS * 1000);
});

var wwd = null;
var currentISSLocation = {
    lat: 0,
    lon: 0,
    alt: 0,
};
var selectedPlacemarkLayer = null;
var ISSModelLayer = null;
var historyISSData = null;
var groundStationsLayer = null;
var shapeLayer = null;

function main() {
    renderEarth();

    fetchGroundStations(function (data) {
        drawGroundStations(data);
    });

    fetchISSLocation(function (data) {
        drawISSModelAtPosition(data.latitude, data.longitude, data.altitude);
        drawISSShadow(data.latitude, data.longitude);
        setLookingAtLocation(data.latitude, data.longitude, true);

    });
}

function drawISSShadow (latitude, longitude) {
    if (shapeLayer) {
        wwd.removeLayer(shapeLayer);
    }
    shapeLayer = new WorldWind.RenderableLayer("ISS Shadow");
    wwd.addLayer(shapeLayer);

    var attributes = new WorldWind.ShapeAttributes(null);
    attributes.outlineColor = WorldWind.Color.BLUE;
    attributes.interiorColor = new WorldWind.Color(0, 1, 1, 0.5);

    var highlightAttributes = new WorldWind.ShapeAttributes(attributes);
    highlightAttributes.interiorColor = new WorldWind.Color(1, 1, 1, 1);

    var circle = new WorldWind.SurfaceCircle(new WorldWind.Location(latitude, longitude), 100e3, attributes);
    circle.highlightAttributes = highlightAttributes;
    shapeLayer.addRenderable(circle);
}

function updateISSModel (latitude, longitude, altitude) {
    currentISSLocation.lat = latitude;
    currentISSLocation.lon = longitude;
    currentISSLocation.alt = altitude;
    if (ISSModelLayer && ISSModelLayer.renderables.length > 0) {
        ISSModelLayer.renderables[0].position = new WorldWind.Position(latitude, longitude, altitude * 1000 * ALT_VIZ_FACTOR);
        ISSModelLayer.renderables[0].xRotation = -latitude + 90 + 15;
        ISSModelLayer.renderables[0].yRotation = 0;
        ISSModelLayer.renderables[0].zRotation = longitude + 90;
        wwd.redraw();
    }
}

function fetchNextPass (lat, lon, cb) {
    fetch(SERVICE_URLS.visibility + '?lat=' + lat + '&lon=' + lon)
    .then(response => response.json())
    .then(data => {
        cb(data);
    }).catch(err => {
        console.log(err);
    });
}

function fetchGroundStations (cb) {
    fetch(SERVICE_URLS.groundStations)
    .then(response => response.json())
    .then(data => {
        cb(data);
    }).catch(err => {
        console.log(err);
    });
}

function fetchISSLocation (cb) {
    fetch(SERVICE_URLS.current || 'https://api.wheretheiss.at/v1/satellites/25544')
    .then(response => response.json())
    .then(data => {
        cb(data[0]);
    }).catch(err => {
        console.log(err);
    })
}

function setLookingAtLocation (latitude, longitude, isFirstTime=false) {
    wwd.navigator.lookAtLocation.latitude = latitude;
    wwd.navigator.lookAtLocation.longitude = longitude;
    if (isFirstTime){
        wwd.navigator.tilt = 60;
        wwd.navigator.heading = 60;
        wwd.navigator.range = 3e6;
    }
    wwd.redraw();
}

function renderEarth () {
    // Create a WorldWindow for the canvas.
    wwd = new WorldWind.WorldWindow("viz-container");
    wwd.addLayer(new WorldWind.BMNGOneImageLayer());
    wwd.addLayer(new WorldWind.BMNGLandsatLayer());
    wwd.addLayer(new WorldWind.StarFieldLayer());
    wwd.addLayer(new WorldWind.AtmosphereLayer());
    wwd.addLayer(new WorldWind.CoordinatesDisplayLayer(wwd));
    wwd.addLayer(new WorldWind.ViewControlsLayer(wwd));
}

function addGroundStationsLayer () {
    if (groundStationsLayer) {
        wwd.removeLayer(groundStationsLayer);
    }
    var placemarkAttributes = new WorldWind.PlacemarkAttributes(null);
    placemarkAttributes.imageSource = "images/ground-station.png";
    placemarkAttributes.imageScale = 0.05;
    placemarkAttributes.imageOffset = new WorldWind.Offset(
        WorldWind.OFFSET_FRACTION, 0.3,
        WorldWind.OFFSET_FRACTION, 0.0);
    placemarkAttributes.labelAttributes.color = WorldWind.Color.WHITE;
    placemarkAttributes.labelAttributes.offset = new WorldWind.Offset(
    WorldWind.OFFSET_FRACTION, 0.5,
        WorldWind.OFFSET_FRACTION, 1.0);
    var placemarkLayer = new WorldWind.RenderableLayer("Ground Stations");
    return {placemarkAttributes, placemarkLayer};
}

function addSelectedPositionLayer () {
    var placemarkAttributes = new WorldWind.PlacemarkAttributes(null);
    placemarkAttributes.imageSource = WorldWind.configuration.baseUrl + "images/pushpins/plain-white.png";
    placemarkAttributes.imageScale = 0.5;
    placemarkAttributes.imageOffset = new WorldWind.Offset(
        WorldWind.OFFSET_FRACTION, 0.3,
        WorldWind.OFFSET_FRACTION, 0.0);
    placemarkAttributes.labelAttributes.color = WorldWind.Color.WHITE;
    placemarkAttributes.labelAttributes.offset = new WorldWind.Offset(
    WorldWind.OFFSET_FRACTION, 0.5,
        WorldWind.OFFSET_FRACTION, 1.0);
    var placemarkLayer = new WorldWind.RenderableLayer("Selected Position");
    return {placemarkAttributes, placemarkLayer};
}

function drawGroundStations (data) {
    // split the data into two layers - in-sight and out-of-sight
    var inSight = [];
    var outOfSight = [];
    data.forEach(station => {
        if (station.visible) {
            inSight.push(station);
        } else {
            outOfSight.push(station);
        }
    });

    if (groundStationsLayer) {
        wwd.removeLayer(groundStationsLayer);
    }

    var placemarkOutOfSightAttributes = new WorldWind.PlacemarkAttributes(null);
    placemarkOutOfSightAttributes.imageSource = "images/ground-station.png";
    placemarkOutOfSightAttributes.imageScale = 0.05;
    placemarkOutOfSightAttributes.imageOffset = new WorldWind.Offset(
        WorldWind.OFFSET_FRACTION, 0.3,
        WorldWind.OFFSET_FRACTION, 0.0);
    placemarkOutOfSightAttributes.labelAttributes.color = WorldWind.Color.RED;
    placemarkOutOfSightAttributes.labelAttributes.offset = new WorldWind.Offset(
        WorldWind.OFFSET_FRACTION, 0.5,
        WorldWind.OFFSET_FRACTION, 1.0);
    var placemarkOutOfSightLayer = new WorldWind.RenderableLayer("OutOfSight Ground Stations");

    var placemarkInSightAttributes = new WorldWind.PlacemarkAttributes(null);
    placemarkInSightAttributes.imageSource = "images/ground-station.png";
    placemarkInSightAttributes.imageScale = 0.05;
    placemarkInSightAttributes.imageOffset = new WorldWind.Offset(
        WorldWind.OFFSET_FRACTION, 0.3,
        WorldWind.OFFSET_FRACTION, 0.0);
    placemarkInSightAttributes.labelAttributes.color = WorldWind.Color.GREEN;
    placemarkInSightAttributes.labelAttributes.offset = new WorldWind.Offset(
        WorldWind.OFFSET_FRACTION, 0.5,
        WorldWind.OFFSET_FRACTION, 1.0);
    var placemarkInSightLayer = new WorldWind.RenderableLayer("InSight Ground Stations");


    outOfSight.forEach(station => {
        var placemark = new WorldWind.Placemark(new WorldWind.Position(station.lat, station.lon, station.alt), false, null);
        placemark.altitudeMode = WorldWind.RELATIVE_TO_GROUND;
        placemark.label = station.name;
        placemark.attributes = placemarkOutOfSightAttributes;
        placemarkOutOfSightLayer.addRenderable(placemark);
    });

    inSight.forEach(station => {
        var placemark = new WorldWind.Placemark(new WorldWind.Position(station.lat, station.lon, station.alt), false, null);
        placemark.altitudeMode = WorldWind.RELATIVE_TO_GROUND;
        placemark.label = station.name;
        placemark.attributes = placemarkInSightAttributes;
        placemarkInSightLayer.addRenderable(placemark);
    });

    wwd.addLayer(placemarkOutOfSightLayer);
    wwd.addLayer(placemarkInSightLayer);
}

function renderGroundStations () {
    var {placemarkAttributes, placemarkLayer} = addGroundStationsLayer();
    NASA_GROUND_STATIONS.forEach(function (station) {
        addPlacemark(station.name, station.lat, station.lon, station.alt, placemarkAttributes, placemarkLayer);
    });
    wwd.addLayer(placemarkLayer);
}

function addPlacemark (title, latitude, longitude, altitude, placemarkAttributes, placemarkLayer) {
    var position = new WorldWind.Position(latitude, longitude, altitude);
    var placemark = new WorldWind.Placemark(position, false, placemarkAttributes);
    placemark.label = title;
    placemark.alwaysOnTop = true;
    placemarkLayer.addRenderable(placemark);
}

function updateSelectedPlacemark (title, latitude, longitude, altitude) {
    if (selectedPlacemarkLayer) {
        wwd.removeLayer(selectedPlacemarkLayer);
    }
    var {placemarkAttributes, placemarkLayer} = addSelectedPositionLayer();
    addPlacemark(title, latitude, longitude, altitude, placemarkAttributes, placemarkLayer);
    wwd.addLayer(placemarkLayer);
    selectedPlacemarkLayer = placemarkLayer;
}

/* Jump to ISS location */
function setOnJumpToISSLocation () {
    $('#jump-to-iss-location').on('click', function () {
        setLookingAtLocation(currentISSLocation.lat, currentISSLocation.lon, true);
    });
}

/* When the ISS passes near me? */
function setOnAddressLookupListener () {
    $('#address-lookup').on('click', function () {
        var address = $('#address-search-box').val();
        if (address) {
           _translateAddressToLatLong(address, function (response) {
               if (response && response.data && response.data.length > 0) {
                   var lat = response.data[0].latitude;
                   var lng = response.data[0].longitude;
                   var address = response.data[0].label;
                   updateSelectedPlacemark(address, lat, lng, 0);
                   setLookingAtLocation(lat, lng);
                     fetchNextPass(lat, lng, function (data) {
                        $('#next-pass-list').html('');
                        data.forEach(function (pass) {
                            $('#next-pass-list').append(`<li>${(new Date(pass * 1000)).toLocaleString()}</li>`);
                        });
                     });
               }
           });
        }
    });

    $('#address-search-box').on('keypress', function (e) {
        if (e.which == 13) {
            $('#address-lookup').click();
        }
    });
}

function _translateAddressToLatLong (address, cb) {
    POSITION_STACK_API_KEY = '7a994a17acc88da115420ad5df88ddb8';
    var url = `http://api.positionstack.com/v1/forward?access_key=${POSITION_STACK_API_KEY}&query=${address}`;
    fetch(url)
    .then(response => response.json())
    .then(data => {
        cb(data);
    }).catch(err => {
        console.log(err);
    });
}

/* History of ISS */
function setOnShowHistoryButtonListener () {
    $('#show-history-btn').on('click', function () {
        clearInterval(pollingInterval);
        $('#slide-container').toggleClass('slide-container-hide');
    });
}

function historySlidingBarListener () {
    var slider = document.getElementById("range-element");
    var output = document.getElementById("range-value");

    slider.oninput = function() {
        output.innerHTML = new Date(historyISSData[this.value].timestamp * 1000).toLocaleString();

        var lat = historyISSData[this.value].lat;
        var lng = historyISSData[this.value].lon;
        var alt = historyISSData[this.value].height;

        currentISSLocation.lat = lat;
        currentISSLocation.lon = lng;
        currentISSLocation.alt = alt;

        updateISSModel(lat, lng, alt);
        drawISSShadow(lat, lng);
        setLookingAtLocation(lat, lng);
    }
}

function _updateSlidingBarData () {
    var slider = document.getElementById("range-element");
    var output = document.getElementById("range-value");
    slider.max = historyISSData.length - 1;
    slider.value = historyISSData.length - 1;
    output.innerHTML = new Date(historyISSData[slider.value].timestamp * 1000).toLocaleString();
}

function fetchHistoryISSData () {
    var now = Math.floor(Date.now() / 1000);
    fetch(SERVICE_URLS.history + now)
    .then(response => response.json())
    .then(data => {
        console.log(data);
        historyISSData = data;
        _updateSlidingBarData();
    }).catch(err => {
        console.log(err);
    });
}

/* Re-draw the ISS model */
function drawISSModelAtPosition (latitude, longitude, altitude) {
    if (ISSModelLayer) {
        wwd.removeLayer(ISSModelLayer);
    }

    ISSModelLayer = new WorldWind.RenderableLayer();
    wwd.addLayer(ISSModelLayer);

    var position = new WorldWind.Position(latitude, longitude, altitude * 1000 * ALT_VIZ_FACTOR);
    var config = {dirPath: 'images/'};
    var colladaLoader = new WorldWind.ColladaLoader(position, config);
    colladaLoader.load("iss.dae", function (colladaModel) {
        colladaModel.scale = 1100;
        colladaModel.xRotation = -latitude + 90 + 15;
        colladaModel.yRotation = 0;
        colladaModel.zRotation = longitude + 90;
        ISSModelLayer.addRenderable(colladaModel);
    });
}

