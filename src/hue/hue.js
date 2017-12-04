
var hue = require("node-hue-api");
var HueApi = require("node-hue-api").HueApi;
var settingsManager = require('../settings.js')
 //ToDo fix setting manger needs a tsc

module.exports = (settingsManager) => {

  var clamp = function (x, lower, upper) {
    return Math.min(upper, Math.max(lower, x));
  }

  /*bri(value)	Sets the brightness, where value from 0 to 255
  hue(value)	Sets the hue, where value from 0 to 65535
  sat(value)	Sets the saturation value from 0 to 255
  xy(x, y)	Sets the xy value where x and y is from 0 to 1 in the Philips Color co-ordinate system
  ct(colorTemperature)	Set the color temperature to a value between 153 and 500*/

  function setLights (light_no, type, val) {

    return new Promise((resolve,reject)=>{
      settingsManager.getSettings()
        .then((settings)=>{
          api = new HueApi(settings.hostname, settings.hash);
          lightState = hue.lightState;
          state = lightState.create();
          switch(type) {
                case 'on':
                  if(val == 'on' || val === true || val == 1) {
                    api.setLightState(light_no, state.on())
                    .then(() => {resolve();})
                    .catch((err) => {reject(err);});
                  } else {
                    api.setLightState(light_no, state.off())
                    .then(() => {resolve();})
                    .catch((err) => {reject(err);});
                  }
                  break;
                case 'hue':
                  api.setLightState(light_no, state.hue(clamp(val,0,65535)))
                  .then(() => {resolve();})
                  .catch((err) => {reject(err);});
                  break;
                case 'sat':
                  api.setLightState(light_no, state.sat(clamp(val,0,255)))
                  .then(() => {resolve();})
                  .catch((err) => {reject(err);});
                  break;
                case 'bri':
                  api.setLightState(light_no, state.bri(clamp(val,0,255)))
                  .then(() => {resolve();})
                  .catch((err) => {reject(err);});
                  break;
                case 'ct':
                  api.setLightState(light_no, state.bri(clamp(val,153,500)))
                  .then(() => {resolve();})
                  .catch((err) => {reject(err);});
                  break;
                default:
                  reject("[Not Implemented]",type);
              }

        });
    });

  };

  function findHub (hostname) {
    console.log("[HUE.findHub]", hostname);
    return new Promise((resolve, reject)=>{
      var user;
      var hue2 = new HueApi();

      hue2.registerUser(hostname, "databox")
      .then((res)=>{
        var user_object = {user: "databox", hash: res, "hostname": hostname};
        settingsManager.setSettings(user_object)
          .then((settings)=>{
            console.log("[findHub] new settings saved");
            resolve(settings);
          })
          .catch((err)=>{
            console.log("[findHub] error saving settings",err);
            reject(err);
          });
      })
      .catch((err)=>{
        reject(err);
      });

    });

  };

  return {
    findHub:findHub,
    setLights:setLights
  };

};