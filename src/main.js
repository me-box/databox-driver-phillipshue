/*jshint esversion: 6 */
const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const hue = require('./hue/hue.js');
const databox = require('node-databox');
const settingsManager = require('./settings.js');
const fs = require('fs');

const DATABOX_STORE_BLOB_ENDPOINT = process.env.DATABOX_STORE_ENDPOINT;

const credentials = databox.getHttpsCredentials();

const PORT = process.env.port || '8080';

const config = require('./routes/config');
const status = require('./routes/status');

const app = express();

const https = require('https');

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');


// app setup
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

app.use('/status', status);
app.use('/ui', config);

https.createServer(credentials, app).listen(PORT);

module.exports = app;


var HueApi = require("node-hue-api").HueApi;
var userConfigFile = './hue/user.json';
var registeredLights = {} //keep track of which lights have been registered as data sources
var registeredSensors = {} //keep track of which sensors have been registered as data sources
var vendor = "Philips Hue";


databox.waitForStoreStatus(DATABOX_STORE_BLOB_ENDPOINT,'active',10)
  .then(()=>{
    return databox.catalog.registerDatasource(
              DATABOX_STORE_BLOB_ENDPOINT, {
              description: 'Philips hue driver settings',
              contentType: 'text/json',
              vendor: 'Databox Inc.',
              type: 'philipsHueSettings',
              datasourceid: 'philipsHueSettings',
              storeType: 'databox-store-blob',
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

    //Deal with actuation events
    databox.subscriptions.connect(DATABOX_STORE_BLOB_ENDPOINT)
    .then((actuationEmitter)=>{
      actuationEmitter.on('data',(endpointHost, actuatorId, data)=>{
        console.log("[Actuation] data received",endpointHost, actuatorId, data);

        const tmp = actuatorId.split('-');
        const hueType = tmp[2];
        const hueId = tmp[3];

        hue.setLights(hueId,hueType,data.data);

      });
    });


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
                databox.catalog.registerDatasource(DATABOX_STORE_BLOB_ENDPOINT,{
                  description: light.name + ' on off state.',
                  contentType: 'text/json',
                  vendor: vendor,
                  type: 'bulb-on',
                  datasourceid: 'bulb-on-' + light.id,
                  storeType: 'databox-store-blob'
                });
                databox.catalog.registerDatasource(DATABOX_STORE_BLOB_ENDPOINT,{
                  description: light.name + ' hue value.',
                  contentType: 'text/json',
                  vendor: vendor,
                  type: 'bulb-hue',
                  datasourceid: 'bulb-hue-' + light.id,
                  storeType: 'databox-store-blob'
                });
                databox.catalog.registerDatasource(DATABOX_STORE_BLOB_ENDPOINT,{
                  description: light.name + ' brightness value.',
                  contentType: 'text/json',
                  vendor: vendor,
                  type: 'bulb-bri',
                  datasourceid: 'bulb-bri-' + light.id,
                  storeType: 'databox-store-blob'
                });
                databox.catalog.registerDatasource(DATABOX_STORE_BLOB_ENDPOINT,{
                  description: light.name + ' saturation value.',
                  contentType: 'text/json',
                  vendor: vendor,
                  type: 'bulb-sat',
                  datasourceid: 'bulb-sat-' + light.id,
                  storeType: 'databox-store-blob'
                });
                databox.catalog.registerDatasource(DATABOX_STORE_BLOB_ENDPOINT,{
                  description: light.name + ' color temperature value.',
                  contentType: 'text/json',
                  vendor: vendor,
                  type: 'bulb-ct',
                  datasourceid: 'bulb-ct' + light.id,
                  storeType: 'databox-store-blob'
                });

                //register actuators
                databox.catalog.registerDatasource(DATABOX_STORE_BLOB_ENDPOINT,{
                  description: 'Set ' + light.name + ' bulbs on off state.',
                  contentType: 'text/json',
                  vendor: vendor,
                  type: 'set-bulb-on',
                  datasourceid: 'set-bulb-on-' + light.id,
                  storeType: 'databox-store-blob',
                  isActuator:true
                })
                .then(()=>{
                  databox.subscriptions.subscribe(DATABOX_STORE_BLOB_ENDPOINT,'set-bulb-on-' + light.id,'ts');
                })
                .catch((err)=>{
                  console.log("[Error] registering actuator ", err);
                });

                databox.catalog.registerDatasource(DATABOX_STORE_BLOB_ENDPOINT,{
                  description: 'Set ' + light.name + ' hue value.',
                  contentType: 'text/json',
                  vendor: vendor,
                  type: 'set-bulb-hue',
                  datasourceid: 'set-bulb-hue-' + light.id,
                  storeType: 'databox-store-blob',
                  isActuator:true
                })
                .then(()=>{
                  databox.subscriptions.subscribe(DATABOX_STORE_BLOB_ENDPOINT,'set-bulb-hue-' + light.id,'ts');
                });

                databox.catalog.registerDatasource(DATABOX_STORE_BLOB_ENDPOINT,{
                  description:'Set ' + light.name + ' brightness value.',
                  contentType: 'text/json',
                  vendor: vendor,
                  type: 'set-bulb-bri',
                  datasourceid: 'set-bulb-bri-' + light.id,
                  storeType: 'databox-store-blob',
                  isActuator:true
                })
                .then(()=>{
                  databox.subscriptions.subscribe(DATABOX_STORE_BLOB_ENDPOINT,'set-bulb-bri-' + light.id,'ts');
                });

                databox.catalog.registerDatasource(DATABOX_STORE_BLOB_ENDPOINT,{
                  description: 'Set ' + light.name + ' saturation value.',
                  contentType: 'text/json',
                  vendor: vendor,
                  type: 'set-bulb-sat',
                  datasourceid: 'set-bulb-sat-' + light.id,
                  storeType: 'databox-store-blob',
                  isActuator:true
                })
                .then(()=>{
                  databox.subscriptions.subscribe(DATABOX_STORE_BLOB_ENDPOINT,'set-bulb-sat-' + light.id,'ts');
                });

                databox.catalog.registerDatasource(DATABOX_STORE_BLOB_ENDPOINT,{
                  description: 'Set ' + light.name + ' color temperature value.',
                  contentType: 'text/json',
                  vendor: vendor,
                  type: 'set-bulb-ct',
                  datasourceid: 'set-bulb-ct' + light.id,
                  storeType: 'databox-store-blob',
                  isActuator:true
                })
                .then(()=>{
                  databox.subscriptions.subscribe(DATABOX_STORE_BLOB_ENDPOINT,'set-bulb-ct-' + light.id,'ts');
                });

              } else {

                //Update bulb state
                databox.timeseries.write(DATABOX_STORE_BLOB_ENDPOINT, 'bulb-on-'  + light.id, light.state.on);
                databox.timeseries.write(DATABOX_STORE_BLOB_ENDPOINT, 'bulb-hue-' + light.id, light.state.hue);
                databox.timeseries.write(DATABOX_STORE_BLOB_ENDPOINT, 'bulb-bri-' + light.id, light.state.bri);
                databox.timeseries.write(DATABOX_STORE_BLOB_ENDPOINT, 'bulb-sat-' + light.id, light.state.sat);
                databox.timeseries.write(DATABOX_STORE_BLOB_ENDPOINT, 'bulb-ct-'  + light.id, light.state.ct);

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
                databox.catalog.registerDatasource(DATABOX_STORE_BLOB_ENDPOINT,{
                  description: sensor.name + sensor.type,
                  contentType: 'text/json',
                  vendor: vendor,
                  type: 'hue-'+sensor.type,
                  datasourceid: 'hue-'+formatSensorID(sensor.uniqueid),
                  storeType: 'databox-store-blob'
                })
                .catch((error)=>{
                  console.log("[ERROR] register sensor", error);
                });
              } else {
                // update state
                console.log("WRITING SENSOR DATA::",DATABOX_STORE_BLOB_ENDPOINT, 'hue-'+formatSensorID(sensor.uniqueid),sensor.state);
                databox.timeseries.write(DATABOX_STORE_BLOB_ENDPOINT, 'hue-'+formatSensorID(sensor.uniqueid),sensor.state)
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