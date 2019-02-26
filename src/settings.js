
const databox = require('node-databox');

const datasourceid = 'philipsHueSettings';
const settingKey = 'settings';


module.exports = (StoreClient) => {

  let getSettings = () => {
    return new Promise((resolve, reject) => {
      StoreClient.KV.Read(datasourceid, settingKey)
        .then((settings) => {
          if (Object.keys(settings).length == 0) {
            return Promise.reject('No setting found.');
          }
          console.log("[getSettings]", settingKey);
          settingsCache = settings;
          resolve(settings);
        })
        .catch((err) => {
          reject(err);
        });

    });
  };

  let setSettings = (settings) => {
    //to do validate settings
    return new Promise((resolve, reject) => {
      StoreClient.KV.Write(datasourceid, settingKey, settings)
        .then(() => {
          resolve(settings);
        })
        .catch((err) => {
          reject(err);
        });

    });
  };

  return {
    getSettings: getSettings,
    setSettings: setSettings
  }
};