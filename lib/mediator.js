/**
 * @file
 *
 * Creates a global private and a global public event emitter.
 * The private event emitter is used only inside the SDK,
 * while the public event emitter is being shared.
 *
 */

const EventEmitter = require("events").EventEmitter;
const Device = require("./device");

const private = new EventEmitter();
const public = new EventEmitter();

private.on("deviceDisconnected", (device) => {
  console.log(`Device disconnected ${device.id} (${device.name})`);
  const minifiedDevice = {
    id: device.id,
    name: device.name,
  };
  public.emit("deviceDisconnected", minifiedDevice);
});

private.on("deviceConnected", (device) => {
  console.log(`Device connected ${device.id} (${device.name})`);
  device.activateSDKMode();
});

private.on("SDKModeOn", (device) => {
  console.log(`SDK mode on for  ${device.id} (${device.name})`);
  device.turnOnLogging();
});

private.on("loggingOn", (device) => {
  console.log(`Logging on for  ${device.id} (${device.name})`);
  const minifiedDevice = {
    id: device.id,
    name: device.name,
  };
  public.emit("carReady", minifiedDevice);
});

private.on("carStatusMessage", (device) => {
  const minifiedDevice = {
    id: device.id,
    name: device.name,
  };
  const status = device.data;
  public.emit("carStatusMessage", minifiedDevice, status);
});

private.on("carEventMessage", (device, msg) => {
  const minifiedDevice = {
    id: device.id,
    name: device.name,
  };
  public.emit("carEventMessage", minifiedDevice, msg);
});
private.on("stoppedAtStart", (device, msg) => {
  const minifiedDevice = {
    id: device.id,
    name: device.name,
  };
  public.emit("stoppedAtStart", minifiedDevice, msg);
});

exports.private = private;
exports.public = public;
