
const databox = require('node-databox');

const datasourceid = 'philipsHueSettings';

let settingsCache = null;

module.exports = (keyValueClient) => {

  let kvc = keyValueClient;

  let getSettings = () => {
  return new Promise((resolve,reject)=>{

    if(settingsCache !== null) {
      resolve(settingsCache);
    }

    kvc.Read(datasourceid)
    .then((settings)=>{
      if(sObject.keys(settings).length == 0) {
        return Promise.reject('No setting found.');
      }
      console.log("[getSettings]",settings);
      settingsCache = settings;
      resolve(settings);
    })
    .catch((err)=>{
      reject(err);
    });

  });
  };

  let setSettings = (settings) => {

  //to do validate settings
  return new Promise((resolve,reject)=>{
    kvc.Write(datasourceid,settings)
    .then(()=>{
      settingsCache = settings;
      resolve(settings);
    })
    .catch((err)=>{
      reject(err);
    });

  });
  };

  return {
    getSettings:getSettings,
    setSettings:setSettings
  }
};