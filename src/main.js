/*jshint esversion: 6 */
const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const databox = require('node-databox');
const fs = require('fs');

const DATABOX_ZMQ_ENDPOINT = process.env.DATABOX_ZMQ_ENDPOINT

let tsc = databox.NewTimeSeriesClient(DATABOX_ZMQ_ENDPOINT, false);
let kvc = databox.NewKeyValueClient(DATABOX_ZMQ_ENDPOINT, false);

const settingsManager = require('./settings.js')(kvc);
const hue = require('./hue/hue.js')(settingsManager);

const credentials = databox.getHttpsCredentials();

const PORT = process.env.port || '8080';

const app = express();

const https = require('https');

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');


// app setup
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));


app.get('/status', function(req, res, next) {

    res.send("active");

});

app.get('/ui', function(req, res, next) {
	console.log("res.render('config', {})");
  res.render('config', {});
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

https.createServer(credentials, app).listen(PORT);

module.exports = app;


var HueApi = require("node-hue-api").HueApi;

var registeredLights = {} //keep track of which lights have been registered as data sources
var registeredSensors = {} //keep track of which sensors have been registered as data sources
var vendor = "Philips Hue";



function ObserveProperty (dsID) {

  //Deal with actuation events
  kvc.Observe(dsID)
  .then((actuationEmitter)=>{
    actuationEmitter.on('data',(data)=>{
      console.log("[Actuation] data received",dsID, data);

      const tmp = dsID.split('-');
      const hueType = tmp[2];
      const hueId = tmp[3];

      hue.setLights(hueId,hueType,data.data);

    });

    actuationEmitter.on('error',(error)=>{
      console.log("[warn] error received",dsID, error);
    });

  });

}

Promise.resolve()
  .then(()=>{
    return tsc.RegisterDatasource(
              {
              Description: 'Philips hue driver settings',
              ContentType: 'text/json',
              Vendor: 'Databox Inc.',
              DataSourceType: 'philipsHueSettings',
              DataSourceID: 'philipsHueSettings',
              StoreType: 'kv',
            });
  })
  .then(()=>{

    return new Promise((resolve,reject)=>{
      var waitForConfig = function() {

        settingsManager.getSettings()
          .then((settings)=>{
            console.log("[SETTINGS] retrieved", settings);
            resolve(new HueApi(settings.hostname, settings.hash));
          })
          .catch((err)=>{
            console.log("[waitForConfig] waiting for user configuration");
            setTimeout(waitForConfig,5000);
          });

      };

      waitForConfig();
    });

  })
  .then((hueApi)=>{

    //Look for new lights and update light states
    var infinitePoll = function() {

        hueApi.lights()
        .then((lights)=>{
           //Update available data sources
            lights.lights.forEach((light)=>{

              if( !(light.id in registeredLights)) {
                //new light found
                console.log("[NEW BULB FOUND] " + light.id + " " + light.name);
                registeredLights[light.id] = light.id;

                //register data sources
                tsc.RegisterDatasource({
                  Description: light.name + ' on off state.',
                  ContentType: 'text/json',
                  Vendor: vendor,
                  DataSourceType: 'bulb-on',
                  DataSourceID: 'bulb-on-' + light.id,
                  StoreType: 'ts'
                });
                tsc.RegisterDatasource({
                  Description: light.name + ' hue value.',
                  ContentType: 'text/json',
                  Vendor: vendor,
                  DataSourceType: 'bulb-hue',
                  DataSourceID: 'bulb-hue-' + light.id,
                  StoreType: 'ts'
                });
                tsc.RegisterDatasource({
                  Description: light.name + ' brightness value.',
                  ContentType: 'text/json',
                  Vendor: vendor,
                  DataSourceType: 'bulb-bri',
                  DataSourceID: 'bulb-bri-' + light.id,
                  StoreType: 'ts'
                });
                tsc.RegisterDatasource({
                  Description: light.name + ' saturation value.',
                  ContentType: 'text/json',
                  Vendor: vendor,
                  DataSourceType: 'bulb-sat',
                  DataSourceID: 'bulb-sat-' + light.id,
                  StoreType: 'ts'
                });
                tsc.RegisterDatasource({
                  Description: light.name + ' color temperature value.',
                  ContentType: 'text/json',
                  Vendor: vendor,
                  DataSourceType: 'bulb-ct',
                  DataSourceID: 'bulb-ct' + light.id,
                  StoreType: 'ts'
                });

                //register actuators
                tsc.RegisterDatasource({
                  Description: 'Set ' + light.name + ' bulbs on off state.',
                  ContentType: 'text/json',
                  Vendor: vendor,
                  DataSourceType: 'set-bulb-on',
                  DataSourceID: 'set-bulb-on-' + light.id,
                  StoreType: 'ts',
                  isActuator:true
                })
                .then(()=>{
                  ObserveProperty('set-bulb-on-' + light.id);
                })
                .catch((err)=>{
                  console.log("[Error] registering actuator ", err);
                });

                tsc.RegisterDatasource({
                  Description: 'Set ' + light.name + ' hue value.',
                  ContentType: 'text/json',
                  Vendor: vendor,
                  DataSourceType: 'set-bulb-hue',
                  DataSourceID: 'set-bulb-hue-' + light.id,
                  StoreType: 'ts',
                  isActuator:true
                })
                .then(()=>{
                  ObserveProperty('set-bulb-hue-' + light.id);
                });

                tsc.RegisterDatasource({
                  Description:'Set ' + light.name + ' brightness value.',
                  ContentType: 'text/json',
                  Vendor: vendor,
                  DataSourceType: 'set-bulb-bri',
                  DataSourceID: 'set-bulb-bri-' + light.id,
                  StoreType: 'ts',
                  isActuator:true
                })
                .then(()=>{
                  ObserveProperty('set-bulb-bri-' + light.id);
                });

                tsc.RegisterDatasource({
                  Description: 'Set ' + light.name + ' saturation value.',
                  ContentType: 'text/json',
                  Vendor: vendor,
                  DataSourceType: 'set-bulb-sat',
                  DataSourceID: 'set-bulb-sat-' + light.id,
                  StoreType: 'ts',
                  isActuator:true
                })
                .then(()=>{
                  ObserveProperty('set-bulb-sat-' + light.id);
                });

                tsc.RegisterDatasource({
                  Description: 'Set ' + light.name + ' color temperature value.',
                  ContentType: 'text/json',
                  Vendor: vendor,
                  DataSourceType: 'set-bulb-ct',
                  DataSourceID: 'set-bulb-ct' + light.id,
                  StoreType: 'ts',
                  isActuator:true
                })
                .then(()=>{
                  ObserveProperty('set-bulb-ct-' + light.id);
                });

              } else {

                //Update bulb state
                console.log("WRITING for bulb", light.id, " Values::", light.state.on, light.state.hue, light.state.bri,light.state.sat,light.state.ct);
                tsc.Write('bulb-on-'  + light.id, { data:light.state.on });
                tsc.Write('bulb-hue-' + light.id, { data:light.state.hue });
                tsc.Write('bulb-bri-' + light.id, { data:light.state.bri });
                tsc.Write('bulb-sat-' + light.id, { data:light.state.sat });
                tsc.Write('bulb-ct-'  + light.id, { data:light.state.ct });

              }

          });

        })
        .catch((error)=>{
          console.log("[ERROR]", error);
        });

        //deal with sensors
        function formatSensorID(id) {
          return id.replace(/\W+/g,"").trim();
        }

        hueApi.sensors()
          .then((sensors)=>{
            sensors.sensors.filter((itm)=>{ return itm.uniqueid }).forEach((sensor)=>{

              if( !(sensor.uniqueid in registeredSensors)) {
                //new light found
                console.log("[NEW SENSOR FOUND] " + formatSensorID(sensor.uniqueid) + " " + sensor.name);
                registeredSensors[sensor.uniqueid] = sensor.uniqueid;

                //register data sources
                tsc.RegisterDatasource({
                  Description: sensor.name + sensor.type,
                  ContentType: 'text/json',
                  Vendor: vendor,
                  DataSourceType: 'hue-'+sensor.type,
                  DataSourceID: 'hue-'+formatSensorID(sensor.uniqueid),
                  StoreType: 'ts'
                })
                .catch((error)=>{
                  console.log("[ERROR] register sensor", error);
                });
              } else {
                // update state
                console.log("WRITING SENSOR DATA::", 'hue-'+formatSensorID(sensor.uniqueid),sensor.state);
                tsc.Write('hue-'+formatSensorID(sensor.uniqueid),sensor.state)
                .catch((error)=>{
                  console.log("[ERROR] writing sensor data", error);
                });
              }
            })
          })
          .catch((error)=>{
            console.log("[ERROR] Querying sensors", error);
          });

        //setup next poll
        setTimeout(infinitePoll,1000);
    };

    infinitePoll();

  })
  .catch((error)=>{
    console.log("[ERROR]",error);
  });