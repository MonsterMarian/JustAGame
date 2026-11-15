// electron-builder vynechává ze závislostí složky „examples“; hra z nich ale bere doplňky three.js (three/addons → three/examples/jsm).
module.exports = (file) => /[\\/]three[\\/]examples([\\/]|$)/.test(file);
