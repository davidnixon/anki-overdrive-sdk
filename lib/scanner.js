const debug = require("debug")("anki:scanner");
const noble = require("@abandonware/noble");
const waitUntil = require("async-wait-until");

/**
 * This module is responsible for scanning for Anki devices
 */
module.exports = class Scanner {
  constructor() {
    this.peripherals = [];
    this.state = undefined;
  }

  /**
   * Set up noble listeners. Mandatory before scan.
   */
  async setUpNoble() {
    try {
      await noble.on("discover", (peripheral) => {
        const isAnkiDevice = function (peripheral) {
          if (!Boolean(peripheral.advertisement.serviceUuids)) return false;
          const serviceUuids = JSON.stringify(
            peripheral.advertisement.serviceUuids
          );
          if (!Boolean(serviceUuids)) return false;

          return serviceUuids.indexOf("be15beef6186407e83810bd89c4d8df4") > -1;
        };

        if (isAnkiDevice(peripheral)) {
          this.peripherals.push(peripheral);
        }
      });
      await noble.on("stateChange", (status) => {
        this.state = status;
      });
    } catch (err) {
      throw new Error(err);
    }
  }

  /**
   * Scans for devices and returns peripherals. Scans for 20 seconds before stopping.
   */
  async scan() {
    try {
      let that = this;
      await waitUntil(() => {
        return that.state === "poweredOn";
      }, 20000);
      debug("Starting to scan...");
      return await waitUntil(
        () => {
          noble.stopScanning();
          if (that.peripherals.length <= 0) {
            debug("Scanning...");
            noble.startScanning(
              ["be15beef6186407e83810bd89c4d8df4"],
              false,
              (error) => {
                if (error) debug(error);
              }
            );
          } else {
            debug("Found " + that.peripherals.length + " devices.");
            return that.peripherals;
          }
        },
        20000,
        4000
      );
    } catch (err) {
      throw new Error(err);
    }
  }
};
