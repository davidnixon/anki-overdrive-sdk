const debug = require("debug")("anki:device");
const os = require("os");
const coder = require("./coder.js");
const mediator = require("./mediator");
const EventEmitter = require("events").EventEmitter;
const protocol = require("./protocol");

/**
 *
 * @class AnkiDevice
 *
 * Class for creating Anki devices that handle the communications with a specific device.
 *
 */
module.exports = class AnkiDevice {
  constructor(peripheral) {
    this.peripheral = peripheral;
    this.id = peripheral.uuid;
    this.serviceUuids = JSON.stringify(peripheral.advertisement.serviceUuids);
    this.name = coder.decodeCarname(peripheral.advertisement.manufacturerData);
    this.information = coder.decodeCarInformation(
      peripheral.advertisement.localName
    );

    debug(`Created device ${this.id} (${this.name})`);
    this.readCharacteristic = null;
    this.writeCharacteristic = null;
    this.internalOnly = false;
    this.events = new EventEmitter();

    this.data = {
      lastMessage: null,
      version: null,
      batteryLevel: null,
      trackId: null,
      bufferedTrackId: null,
      trackPos: null,
      bufferedTrackPos: null,
      offset: null,
      offsetNotDocumented: null,
      offsetFromRoadCenter: null,
      speed: null,
      isLoading: null,
    };
  }

  connect() {
    try {
      const that = this;
      debug(`Connecting with ${that.id} (${that.name})`);
      const getService = function (services) {
        if (!services) {
          console.error("no services found for", that.name);
          return;
        }
        var service = null;
        if (os.platform() === "win32" || os.platform() === "linux") {
          service = services[2];
        } else {
          service = services[0]; // macOS
        }
        debug(`Found services for ${that.id} (${that.name})`);
        service.discoverCharacteristics();
        service.once("characteristicsDiscover", setCharacteristics);
      };

      const setCharacteristics = function (characteristics) {
        for (let i in characteristics) {
          const characteristic = characteristics[i];
          if (characteristic.uuid == "be15bee06186407e83810bd89c4d8df4") {
            that.readCharacteristic = characteristic;
          }

          if (characteristic.uuid == "be15bee16186407e83810bd89c4d8df4") {
            that.writeCharacteristic = characteristic;
          }
        }
        debug(
          `Found read/write characteristics (${Boolean(
            that.readCharacteristic
          )}/${Boolean(that.writeCharacteristic)}) for ${that.name} (${
            that.name
          })`
        );
        mediator.private.emit("deviceConnected", that);
      };

      const onConnect = async function () {
        that.peripheral.discoverServices();
        // const characteristics = await service.discoverCharacteristics([])
        // await setCharacteristics(characteristics)
        // Listen to own disconnect
        that.peripheral.once("disconnect", () => {
          mediator.private.emit("deviceDisconnected", this);
        });
        // mediator.private.emit('deviceConnected', that)
      };

      this.peripheral.once("connect", onConnect);
      this.peripheral.once("servicesDiscover", getService);
      this.peripheral.connect();
    } catch (err) {
      throw new Error(err);
    }
  }

  activateSDKMode() {
    debug(`Activating SDKMode for ${this.id} (${this.name})`);
    const that = this;
    if (!this.isConnected) {
      return new Error("Car is not connected yet.");
    }
    const message = coder.encodeSDKActivation();
    this._writeMessage(message).then(() => {
      mediator.private.emit("SDKModeOn", that);
    });
  }

  turnOnLogging() {
    debug(`Turning logging on for ${this.id} (${this.name})`);
    let that = this;
    if (!that.isConnected) {
      return new Error("Car is not connected yet.");
    }

    that.readCharacteristic.notify(true);
    that.readCharacteristic.on("read", (data) => {
      that._onMessage(data);
    });
    mediator.private.emit("loggingOn", that);
  }

  _onMessage(data) {
    const message = coder.decodeMessage(data);
    const id = message.messageId;
    const msgTypes = coder.getMessageTypes();

    switch (id) {
      case protocol.ANKI_VEHICLE_MSG_V2C_LOCALIZATION_POSITION_UPDATE:
        this.events.emit("localizationPositionUpdate", message);
        break;
      case protocol.ANKI_VEHICLE_MSG_V2C_LOCALIZATION_TRANSITION_UPDATE:
        this.events.emit("localizationTransitionUpdate", message);
        break;

      default:
        break;
    }
    if (this.internalOnly) return;

    if (msgTypes.status.includes(id)) {
      // Status Message: Update device data and send
      switch (id) {
        case 25:
          this.data.version = message.version;
          break;
        case 27:
          this.data.batteryLevel = message.batteryLevel;
          break;
        case 39:
          this.data.bufferedTrackId = this.data.trackId;
          this.data.bufferedTrackPos = this.data.trackPos;
          this.data.trackId = message.trackId;
          this.data.trackPos = message.trackPos;
          this.data.offset = message.offset;
          this.data.speed = message.speed;
          this._initOffset();
          break;
        case 45:
          this.data.offsetFromRoadCenter = message.offsetFromRoadCenter;
          break;
        case 63:
          this.data.isLoading = message.isLoading;
          break;
        case 65:
          this.data.offsetNotDocumented = message.offset;
          break;
        default:
          console.error("Unknown status message id");
      }
      this.data.lastMessage = +new Date();
      mediator.private.emit("carStatusMessage", this);
    } else {
      // Event Message: Stream
      mediator.private.emit("carEventMessage", this, message);
    }
  }

  disconnect() {
    // Let car disconnect itself
    const message = coder.encodeDisconnect();
    this._writeMessage(message);
    // Disconnect us from the car
    this.peripheral.disconnect(() => {
      this.readCharacteristic = null;
      this.writeCharacteristic = null;
    });
  }

  setLane() {
    const offset = this._getCurrentLane();
    const message = coder.encodeOffsetSet(offset);
    this._writeMessage(message);
  }

  setSpeed(speed, accel) {
    const message = coder.encodeSpeed(speed, accel);
    this._writeMessage(message);
  }

  setOffset(offset) {
    const message = coder.encodeOffsetChange(offset);
    this._writeMessage(message);
  }

  changeLane(goRight) {
    let message = null;
    if (goRight) {
      //message = coder.encodeOffsetChange(this.data.offset + 9)
      message = coder.encodeOffsetChange(this.data.offset + 9);
    } else {
      //message = coder.encodeOffsetChange(this.data.offset - 9)
      message = coder.encodeOffsetChange(this.data.offset - 9);
    }
    this._writeMessage(message);
  }

  setLight(val) {
    // LIGHT_HEADLIGHTS    0
    // LIGHT_BRAKELIGHTS   1
    // LIGHT_FRONTLIGHTS   2
    // LIGHT_ENGINE        3
    const message = coder.encodeLightChange(val);
    this._writeMessage(message);
  }

  setEngineLight(r, g, b) {
    const message = coder.encodeEngineLightChange(r, g, b);
    this._writeMessage(message);
  }

  uTurn() {
    const message = coder.encodeUTurn();
    this._writeMessage(message);
  }

  getBatteryLevel() {
    const message = coder.encodeBatteryRequest();
    this._writeMessage(message);
  }

  ping() {
    const message = coder.encodePing();
    this._writeMessage(message);
  }

  isConnected() {
    return (
      (this.readCharacteristic != null) & (this.writeCharacteristic != null)
    );
  }

  stopAtLine() {
    // do not emit public events until we complete this operation
    this.internalOnly = true;
    this.setSpeed(600, 25000);
    this.events.on("localizationPositionUpdate", (message) => {
      switch (message.road_piece_id) {
        case 34: // start piece
          this.setSpeed(0, 25000);
          mediator.private.emit("stoppedAtStart", this);
          this.events.off("localizationPositionUpdate");
          this.events.off("localizationTransitionUpdate");
          this.internalOnly = false;
          break;

        default:
          debug(this.name, "road_piece_id", message.road_piece_id);
          break;
      }
    });
    this.events.on("localizationTransitionUpdate", (message) => {
      debug(
        this.name,
        "road_piece_idx",
        message.road_piece_idx,
        "road_piece_idx_prev",
        message.road_piece_idx_prev
      );
    });
  }

  invokeCommand(command) {
    try {
      let message = this.formatMessage(command);
      this.writeCharacteristic.write(message, false);
    } catch (err) {
      console.error(err);
    }
  }

  _getCurrentLane() {
    const trackId = this.data.trackId;
    const trackPos = this.data.trackPos;

    const bufferedTrackId = this.data.bufferedTrackId;
    const bufferedTrackPos = this.data.bufferedTrackPos;
    //if(trackId != undefined && trackPos != undefined && bufferedTrackId != undefined && bufferedTrackPos != undefined){
    //if(trackId != null && trackPos != null && bufferedTrackId != null && bufferedTrackPos != null){
    if (
      bufferedTrackId != null &&
      bufferedTrackPos != null &&
      trackId == bufferedTrackId
    ) {
      const direction = trackPos - bufferedTrackPos;
      // Determine Current Lane
      if (trackPos == 0 || trackPos == 1 || trackPos == 2) {
        return -68.0 * direction;
      } else if (trackPos == 15 || trackPos == 16 || trackPos == 17) {
        return -23.0 * direction;
      } else if (trackPos == 30 || trackPos == 31 || trackPos == 32) {
        return 23.0 * direction;
      } else if (trackPos == 45 || trackPos == 46 || trackPos == 47) {
        return 68.0 * direction;
      } else {
        // Determine Offset between Lane 4 and 3
        if (trackPos == 3 || trackPos == 4 || trackPos == 5) {
          return -59.0 * direction;
        } else if (trackPos == 6 || trackPos == 7 || trackPos == 8) {
          return -50.0 * direction;
        } else if (trackPos == 9 || trackPos == 10 || trackPos == 11) {
          return -41.0 * direction;
        } else if (trackPos == 12 || trackPos == 13 || trackPos == 14) {
          return -32.0 * direction;
        }

        // Determine Offset between Lane 3 and 2
        else if (trackPos == 18 || trackPos == 19 || trackPos == 20) {
          return -14.0 * direction;
        } else if (trackPos == 21 || trackPos == 22 || trackPos == 23) {
          return -5.0 * direction;
        } else if (trackPos == 24 || trackPos == 25 || trackPos == 26) {
          return 5.0 * direction;
        } else if (trackPos == 27 || trackPos == 28 || trackPos == 29) {
          return 14.0 * direction;
        }

        // Determine offset between Lane 2 and 1
        else if (trackPos == 33 || trackPos == 34 || trackPos == 35) {
          return 32.0 * direction;
        } else if (trackPos == 36 || trackPos == 37 || trackPos == 38) {
          return 41.0 * direction;
        } else if (trackPos == 39 || trackPos == 40 || trackPos == 41) {
          return 50.0 * direction;
        } else if (trackPos == 42 || trackPos == 43 || trackPos == 44) {
          return 59.0 * direction;
        }
      }
    }
    return new Error("Buffer empty.");
  }

  _writeMessage(message) {
    return new Promise((resolve, reject) => {
      if (!this.writeCharacteristic) return resolve()
      this.writeCharacteristic.write(message, false, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
  // setup the offset to have a reference point on the track
  _initOffset() {
    if (
      this.data.initOffset == undefined &&
      (this.data.trackId == 36 ||
        this.data.trackId == 39 ||
        this.data.trackId == 40)
    ) {
      try {
        const offset = this._getCurrentLane();
        if (offset instanceof Error) {
          return;
        }
        const message = coder.encodeOffsetSet(offset);
        this._writeMessage(message);
        this.data.initOffset = offset;
      } catch (err) {
        return;
      }
    }
  }
};
