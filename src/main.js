/*jshint esversion: 6 */
const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const databox = require('node-databox');
const fs = require('fs');

const DATABOX_ZMQ_ENDPOINT = process.env.DATABOX_ZMQ_ENDPOINT || "tcp://127.0.0.1:5555";
const DATABOX_TESTING = !(process.env.DATABOX_VERSION);
const PORT = process.env.port || '8080';

let tsc = databox.NewTimeSeriesBlobClient(DATABOX_ZMQ_ENDPOINT, false);
let kvc = databox.NewKeyValueClient(DATABOX_ZMQ_ENDPOINT, false);

const settingsManager = require('./settings.js')(kvc);
const hue = require('./hue/hue.js')(settingsManager);


const app = express();

const https = require('https');
const http = require('http');

//some nasty global vars to holds the current state
var registeredLights = {} //keep track of which lights have been registered as data sources
var registeredSensors = {} //keep track of which sensors have been registered as data sources
var vendor = "Philips Hue";

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');
app.set("configured",false)


// app setup
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));


app.get('/status', function(req, res, next) {
    if (app.settings.configured) {
      res.send("active");
    } else {
      res.send("requiresConfig");
    }
});

app.get('/ui', function(req, res, next) {
  if (app.settings.configured) {
    let bulbList = []
    let lights = Object.entries(registeredLights)
    if(lights.length > 0) {
      bulbList = lights.map((bulb)=>{
        return "<li><b>"+ bulb[1].name + "</b> Last value: <pre>"+JSON.stringify(bulb[1].state,null,3)+"</pre></li>"
      });
    } else {
      bulbList=["<li>No bulbs found!</li>"]
    }
    let sensorsList = []
    let sensors = Object.entries(registeredSensors)
    if(sensors.length > 0) {
      sensorsList = sensors.map((s)=>{
        return "<li><b>"+ s[1].name + "</b> Last value: <pre>"+JSON.stringify(s[1].state,null,3)+"</pre></li>"
      });
    } else {
      sensorsList=["<li>No sensors found!</li>"]
    }

    res.send(
      "<h1>Lights</h1><div id='bulbs'><ul>"+bulbList.concat(" \n")+"</ul></div>" +
      "<h1>Sensors</h1><div id='sensors'><ul>"+sensorsList.concat(" \n")+"</ul></div>"
    );
  } else {
    console.log("res.render('config', {})");
    res.render('config', {});
  }
});

app.post('/ui', function (req, res) {
    var ip_address = (req.body.title);

    console.log(req.body.title);

    hue.findHub(ip_address)
    .then((data)=>{
       res.send(data);
    })
    .catch((err)=>{
       res.status(401).send("Failed to find hue bridge at " + ip_address + "<b>" + err + "</b>");
    });

});

//when testing, we run as http, (to prevent the need for self-signed certs etc);
if (DATABOX_TESTING) {
  console.log("[Creating TEST http server]", PORT);
  server = http.createServer(app).listen(PORT);

} else {
  console.log("[Creating https server]", PORT);
  const credentials = databox.getHttpsCredentials();
  server = https.createServer(credentials, app).listen(PORT);
}

module.exports = app;


var HueApi = require("node-hue-api").HueApi;

function ObserveProperty (dsID) {

  console.log("[Observing] ",dsID);

  //Deal with actuation events
  return tsc.Observe(dsID)
  .then((actuationEmitter)=>{

    actuationEmitter.on('data',(JsonObserveResponse)=>{
      console.log("[Actuation] data received",dsID, JsonObserveResponse.data);

      const tmp = dsID.split('-');
      const hueType = tmp[2];
      const hueId = tmp[3];
      _data = JSON.parse(JsonObserveResponse.data);
      hue.setLights(hueId,hueType,_data.data);

    });

    actuationEmitter.on('error',(error)=>{
      console.log("[warn] error received",dsID, error);
    });

  })
  .catch((err) => {
    console.warn("[Error Observing] ",dsID,err);
  });

}

const waitForConfig = async function () {

  await tsc.RegisterDatasource({
                              Description: 'Philips hue driver settings',
                              ContentType: 'text/json',
                              Vendor: 'Databox Inc.',
                              DataSourceType: 'philipsHueSettings',
                              DataSourceID: 'philipsHueSettings',
                              StoreType: 'kv',
                            });
  let settings = await settingsManager.getSettings()
  .catch((err) => {
    console.log("[waitForConfig] waiting for user configuration. ", err);
    setTimeout(waitForConfig,5000)
  })

  if (typeof settings == 'undefined') {
    //we have no settings do not continue
    return
  }

  app.set("configured",true)

  startDriverWork(settings)
}

const startDriverWork = async function (settings) {

  let hueApi = new HueApi(settings.hostname, settings.hash)

  let lights = await hueApi.lights()
  .catch((err) => {
    console.log("[Error] getting light data", err);
    lights = {"lights":[]}
  })

  await processlights(lights)

  let sensors = await hueApi.sensors()
  .catch((err) => {
    console.log("[Error] getting light data", err);
    sensors = {"sensors":[]}
  })
  await processSensors(sensors)

  //setup next poll
  //console.log("setting up next poll")
  setTimeout(startDriverWork,5000,settings);

}

waitForConfig()

const processSensors = async function (sensors) {

  //filter out sensors without an id
  let validSensors = sensors.sensors.filter((itm)=>{ return itm.uniqueid })

  for ( let i = 0; i< validSensors.length; i++) {

    let sensor = validSensors[i]

    if( !(sensor.uniqueid in registeredSensors)) {
      //new light found
      console.log("[NEW SENSOR FOUND] " + formatID(sensor.uniqueid) + " " + sensor.name);
      registeredSensors[sensor.uniqueid] = sensor;

      //register data sources
      await tsc.RegisterDatasource({
        Description: sensor.name + sensor.type,
        ContentType: 'text/json',
        Vendor: vendor,
        DataSourceType: 'hue-'+sensor.type,
        DataSourceID: 'hue-'+formatID(sensor.uniqueid),
        StoreType: 'ts'
      })
      .catch((error)=>{
        console.log("[ERROR] register sensor", error);
      });
    }

    registeredSensors[sensor.uniqueid] = sensor;

    await tsc.Write('hue-'+formatID(sensor.uniqueid),sensor.state)
    .catch((error)=>{
      console.log("[ERROR] writing sensor data", error);
    });

  }
}

const processlights = async function (lights) {

  for ( let i = 0; i< lights.lights.length; i++) {

    let light = lights.lights[i]
    let lightID = light.id

    if( !(light.uniqueid in registeredLights)) {
      //new light found
      console.log("[NEW BULB FOUND] " + light.uniqueid + " " + light.name + " lightID=" + lightID);
      //build the current state for the UI
      registeredLights[light.uniqueid] = light;
      //register data sources
      await tsc.RegisterDatasource({
        Description: light.name + ' on off state.',
        ContentType: 'text/json',
        Vendor: vendor,
        DataSourceType: 'bulb-on',
        DataSourceID: 'bulb-on-' + lightID,
        StoreType: 'tsblob'
      })

      await tsc.RegisterDatasource({
          Description: light.name + ' hue value.',
          ContentType: 'text/json',
          Vendor: vendor,
          DataSourceType: 'bulb-hue',
          DataSourceID: 'bulb-hue-' + lightID,
          StoreType: 'tsblob'
        });

      await tsc.RegisterDatasource({
          Description: light.name + ' brightness value.',
          ContentType: 'text/json',
          Vendor: vendor,
          DataSourceType: 'bulb-bri',
          DataSourceID: 'bulb-bri-' + lightID,
          StoreType: 'tsblob'
        });

      await tsc.RegisterDatasource({
          Description: light.name + ' saturation value.',
          ContentType: 'text/json',
          Vendor: vendor,
          DataSourceType: 'bulb-sat',
          DataSourceID: 'bulb-sat-' + lightID,
          StoreType: 'tsblob'
        });

      await tsc.RegisterDatasource({
          Description: light.name + ' color temperature value.',
          ContentType: 'text/json',
          Vendor: vendor,
          DataSourceType: 'bulb-ct',
          DataSourceID: 'bulb-ct-' + lightID,
          StoreType: 'tsblob'
        });

      await tsc.RegisterDatasource({
          Description: 'Set ' + light.name + ' bulbs on off state.',
          ContentType: 'text/json',
          Vendor: vendor,
          DataSourceType: 'set-bulb-on',
          DataSourceID: 'set-bulb-on-' + lightID,
          StoreType: 'tsblob',
          IsActuator:true
        })

      //set up the listeners for observe events
      await ObserveProperty('set-bulb-on-' + lightID)
      await ObserveProperty('set-bulb-hue-' + lightID)
      await ObserveProperty('set-bulb-ct-' + lightID)
      await ObserveProperty('set-bulb-sat-' + lightID)
      await ObserveProperty('set-bulb-bri-' + lightID)
    }

    //Update bulb state
    console.log("Updating light state", { data:light.state.on })
    await tsc.Write('bulb-on-'  + lightID, { data:light.state.on })
    .catch((err) => {
      console.log("[Error] could not write light data. ", err);
    })

    await tsc.Write('bulb-hue-' + lightID, { data:light.state.hue })
    .catch((err) => {
      console.log("[Error] could not write light data. ", err);
    })

    await tsc.Write('bulb-bri-' + lightID, { data:light.state.bri })
    .catch((err) => {
      console.log("[Error] could not write light data. ", err);
    })

    await tsc.Write('bulb-sat-' + lightID, { data:light.state.sat })
    .catch((err) => {
      console.log("[Error] could not write light data. ", err);
    })

    await tsc.Write('bulb-ct-'  + lightID, { data:light.state.ct })
    .catch((err) => {
      console.log("[Error] could not write light data. ", err);
    })

  } //end bulb processing
}