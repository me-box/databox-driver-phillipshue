/*jshint esversion: 6 */
const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const databox = require('node-databox');
const fs = require('fs');

const DATABOX_ZMQ_ENDPOINT = process.env.DATABOX_ZMQ_ENDPOINT

let tsc = databox.NewTimeSeriesBlobClient(DATABOX_ZMQ_ENDPOINT, false);
let kvc = databox.NewKeyValueClient(DATABOX_ZMQ_ENDPOINT, false);

const settingsManager = require('./settings.js')(kvc);
const hue = require('./hue/hue.js')(settingsManager);

const credentials = databox.getHttpsCredentials();

const PORT = process.env.port || '8080';

const app = express();

const https = require('https');

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
    let bulbList = ""
    let lights = Object.entries(registeredLights)
    if(lights.length > 0) {
      bulbList = lights.map((bulb)=>{
        return "<li><b>"+ bulb[1].name + "</b> Last value: <pre>"+JSON.stringify(bulb[1].state,null,3)+"</pre></li>"
      });
    } else {
      bulbList=["<li>No bulbs found!</li>"]
    }
    res.send("<h1>Lights</h1><div id='bulbs'><ul>"+bulbList.concat(" \n")+"</ul></div>");
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

https.createServer(credentials, app).listen(PORT);

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
            console.log("[waitForConfig] waiting for user configuration. ", err);
            setTimeout(waitForConfig,5000);
          });

      };

      waitForConfig();
    });

  })
  .then((hueApi)=>{

    app.set("configured",true)

    //Look for new lights and update light states
    var infinitePoll = function() {

        hueApi.lights()
        .then((lights)=>{
           //Update available data sources
            lights.lights.forEach((light, lightID)=>{

              if( !(light.uniqueid in registeredLights)) {
                //new light found
                console.log("[NEW BULB FOUND] " + light.uniqueid + " " + light.name);

                //build the current state for the UI
                registeredLights[light.uniqueid] = light;

                //register data sources
                tsc.RegisterDatasource({
                  Description: light.name + ' on off state.',
                  ContentType: 'text/json',
                  Vendor: vendor,
                  DataSourceType: 'bulb-on',
                  DataSourceID: 'bulb-on-' + lightID,
                  StoreType: 'tsblob'
                })
                .then(()=>{
                  return tsc.RegisterDatasource({
                    Description: light.name + ' hue value.',
                    ContentType: 'text/json',
                    Vendor: vendor,
                    DataSourceType: 'bulb-hue',
                    DataSourceID: 'bulb-hue-' + lightID,
                    StoreType: 'tsblob'
                  });
                })
                .then(()=>{
                  return tsc.RegisterDatasource({
                    Description: light.name + ' brightness value.',
                    ContentType: 'text/json',
                    Vendor: vendor,
                    DataSourceType: 'bulb-bri',
                    DataSourceID: 'bulb-bri-' + lightID,
                    StoreType: 'tsblob'
                  });
                })
                .then(()=>{
                  return tsc.RegisterDatasource({
                    Description: light.name + ' saturation value.',
                    ContentType: 'text/json',
                    Vendor: vendor,
                    DataSourceType: 'bulb-sat',
                    DataSourceID: 'bulb-sat-' + lightID,
                    StoreType: 'tsblob'
                  });
                })
                .then(()=>{
                  return tsc.RegisterDatasource({
                    Description: light.name + ' color temperature value.',
                    ContentType: 'text/json',
                    Vendor: vendor,
                    DataSourceType: 'bulb-ct',
                    DataSourceID: 'bulb-ct-' + lightID,
                    StoreType: 'tsblob'
                  });
                })
                .then(()=>{
                  return tsc.RegisterDatasource({
                    Description: 'Set ' + light.name + ' bulbs on off state.',
                    ContentType: 'text/json',
                    Vendor: vendor,
                    DataSourceType: 'set-bulb-on',
                    DataSourceID: 'set-bulb-on-' + lightID,
                    StoreType: 'tsblob',
                    IsActuator:true
                  })
                  .then(()=>{
                    return ObserveProperty('set-bulb-on-' + lightID);
                  })
                  .catch((err)=>{
                    console.warn(err)
                  });

                })
                .then(()=>{
                  return tsc.RegisterDatasource({
                    Description: 'Set ' + light.name + ' hue value.',
                    ContentType: 'text/json',
                    Vendor: vendor,
                    DataSourceType: 'set-bulb-hue',
                    DataSourceID: 'set-bulb-hue-' + lightID,
                    StoreType: 'tsblob',
                    IsActuator:true
                  })
                  .then(()=>{
                    return ObserveProperty('set-bulb-hue-' + lightID);
                  });
                })
                .then(()=>{
                  return tsc.RegisterDatasource({
                    Description:'Set ' + light.name + ' brightness value.',
                    ContentType: 'text/json',
                    Vendor: vendor,
                    DataSourceType: 'set-bulb-bri',
                    DataSourceID: 'set-bulb-bri-' + lightID,
                    StoreType: 'tsblob',
                    IsActuator:true
                  })
                  .then(()=>{
                    return ObserveProperty('set-bulb-bri-' + lightID);
                  });
                })
                .then(()=>{
                  return tsc.RegisterDatasource({
                    Description: 'Set ' + light.name + ' saturation value.',
                    ContentType: 'text/json',
                    Vendor: vendor,
                    DataSourceType: 'set-bulb-sat',
                    DataSourceID: 'set-bulb-sat-' + lightID,
                    StoreType: 'tsblob',
                    IsActuator:true
                  })
                  .then(()=>{
                    return ObserveProperty('set-bulb-sat-' + lightID);
                  });
                })
                .then(()=>{
                  return tsc.RegisterDatasource({
                    Description: 'Set ' + light.name + ' color temperature value.',
                    ContentType: 'text/json',
                    Vendor: vendor,
                    DataSourceType: 'set-bulb-ct',
                    DataSourceID: 'set-bulb-ct-' + lightID,
                    StoreType: 'tsblob',
                    IsActuator:true
                  })
                  .then(()=>{
                    return ObserveProperty('set-bulb-ct-' + lightID);
                  });
                })
                .catch((err)=>{
                  console.warn(err);
                });

              } else {

                //build the current state for the UI
                registeredLights[light.uniqueid] = light;

                //Update bulb state
                tsc.Write('bulb-on-'  + lightID, { data:light.state.on })
               .then(()=>{
                  return tsc.Write('bulb-hue-' + lightID, { data:light.state.hue });
                })
                .then(()=>{
                  return tsc.Write('bulb-bri-' + lightID, { data:light.state.bri });
                })
                .then(()=>{
                  return tsc.Write('bulb-sat-' + lightID, { data:light.state.sat });
                })
                .then(()=>{
                  return tsc.Write('bulb-ct-'  + lightID, { data:light.state.ct });
                })
                .catch((err)=>{
                  console.log("Error witting to store ", err)
                })


              }

          });

        })
        .catch((error)=>{
          console.log("[ERROR]", error);
        });

        //deal with sensors
        function formatID(id) {
          return id.replace(/\W+/g,"").trim();
        }

        hueApi.sensors()
          .then((sensors)=>{
            sensors.sensors.filter((itm)=>{ return itm.uniqueid }).forEach((sensor)=>{

              if( !(sensor.uniqueid in registeredSensors)) {
                //new light found
                console.log("[NEW SENSOR FOUND] " + formatID(sensor.uniqueid) + " " + sensor.name);
                registeredSensors[sensor.uniqueid] = sensor;

                //register data sources
                tsc.RegisterDatasource({
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
              } else {

                registeredSensors[sensor.uniqueid] = sensor;

                // update state
                tsc.Write('hue-'+formatID(sensor.uniqueid),sensor.state)
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