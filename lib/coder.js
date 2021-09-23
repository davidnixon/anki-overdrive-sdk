const debug = require("debug")("anki:coder");
const protocol = require("./protocol");
/**
 * @file
 *
 * Decodes and encodes messages
 */

function decodeCarname(manufacturerData) {
  /**
   * Vehicle hardware information encodeded in the MANUFACTURER_DATA
   * record of an advertising packet.
   *
   * - identifier: Unique identifer for a physical vehicle
   * - model_id: The model type of a vehicle
   * - product_id: Value identifying the vehicle as Anki Drive hardware
   */
  // typedef struct anki_vehicle_adv_mfg {
  //     uint32_t    identifier;
  //     uint8_t     model_id;
  //     uint8_t     _reserved;
  //     uint16_t    product_id;
  // } anki_vehicle_adv_mfg_t;
  const vehicle_identifier = manufacturerData.readUInt32LE(0);
  const model_id = manufacturerData.readUInt8(0);
  const product_id = manufacturerData.readUInt16LE(6);
  debug("manufacturerData", manufacturerData);
  debug("vehicle_identifier", vehicle_identifier);
  debug("model_id", model_id); // 190 = car?
  debug("product_id", product_id);

  let carname = null;
  switch (vehicle_identifier) {
    case 0x0800efbe:
      carname = "Ground Shock";
      break;
    case 0x0900efbe:
      carname = "Skull";
      break;
    case 0x0a00efbe:
      carname = "Thermo";
      break;
    case 0x0b00efbe:
      carname = "Nuke";
      break;
    case 0x0c00efbe:
      carname = "Guardian";
      break;
    case 0x0e00efbe:
      carname = "Big Bang";
      break;
    case 0x0f00efbe:
      carname = "Free Wheel";
      break;
    case 0x1000efbe:
      carname = "x52";
      break;
    case 0x1100efbe:
      carname = "X52 Ice";
      break;
    case 0x1300efbe:
      carname = "Ice Charger";
      break;
    default:
      console.error(`carname ${substr} unknown`);
      return new Error("Carname unknown.");
  }
  return carname;
}

function decodeCarInformation(localName) {
  /**
   * Vehicle information packed in the LOCAL_NAME string record
   * of an advertising packet.
   *
   * - state: Current vehicle state.
   *   NOTE: Changes to the vehicle state will cause the LOCAL_NAME value
   *   to change.
   * - version: Firmware version running on the vehicle
   * - name: User-defined name in UTF-8 encoding
   */
  // typedef struct anki_vehicle_adv_info {
  //     anki_vehicle_adv_state_t state;
  //     uint16_t            version;
  //     uint8_t             _reserved[5];
  //     unsigned char       name[13]; // UTF8: 12 bytes + NULL.
  // } anki_vehicle_adv_info_t;

  const coded = Buffer.from(localName, "utf8"); // this would work better if localName was already a Buffer
  debug(coded);
  const firmware_version = coded.readUInt16LE(0);
  const name = coded.toString("utf-8", 7);
  debug(`firmware_version 0x${firmware_version.toString(16)}`);
  debug("name", name);

  return firmware_version; // experimental
}

function getMessageTypes() {
  return {
    event: [23, 41, 43, 54, 67, 77, 134, 201],
    status: [25, 27, 39, 45, 63, 65],
  };
}

function decodeMessage(data, isNotification) {
  const messageId = data.readUInt8(1);
  let dict = {
    messageId: messageId,
    data: data,
    isNotification: isNotification,
    timestamp: Date.now(),
  };
  if (messageId === protocol.ANKI_VEHICLE_MSG_V2C_PING_RESPONSE) {
    // 'Ping Response'
    // example: <Buffer 01 17>
    // ANKI_VEHICLE_MSG_V2C_PING_RESPONSE = 0x17, // 23
    dict["descr"] = "Ping Response";
  } else if (messageId === protocol.ANKI_VEHICLE_MSG_V2C_VERSION_RESPONSE) {
    // 'Version'
    // example: <Buffer 05 19 6e 26 00 00>
    // ANKI_VEHICLE_MSG_V2C_VERSION_RESPONSE = 0x19, // 25
    // typedef struct anki_vehicle_msg_version_response {
    //    uint8_t     size;
    //    uint8_t     msg_id;
    //    uint16_t    version;
    // } ATTRIBUTE_PACKED anki_vehicle_msg_version_response_t;
    // #define ANKI_VEHICLE_MSG_V2C_VERSION_RESPONSE_SIZE   3
    dict["descr"] = "Version";
    dict["version"] = data.readUInt16LE(2);
  } else if (
    messageId === protocol.ANKI_VEHICLE_MSG_V2C_BATTERY_LEVEL_RESPONSE
  ) {
    // 'Battery Level'
    // example: <Buffer 03 1b 50 0f>
    // ANKI_VEHICLE_MSG_V2C_BATTERY_LEVEL_RESPONSE = 0x1b, // 27
    // typedef struct anki_vehicle_msg_battery_level_response {
    //     uint8_t     size;
    //     uint8_t     msg_id;
    //     uint16_t    battery_level;
    // } ATTRIBUTE_PACKED anki_vehicle_msg_battery_level_response_t;
    // #define ANKI_VEHICLE_MSG_V2C_BATTERY_LEVEL_RESPONSE_SIZE  3
    dict["descr"] = "Battery Level";
    const MAX_BATTERY_LEVEL = 4200;
    const level = data.readUInt16LE(2);
    dict.battery_level = Math.floor((level / MAX_BATTERY_LEVEL) * 100);
  } else if (
    messageId == protocol.ANKI_VEHICLE_MSG_V2C_LOCALIZATION_POSITION_UPDATE
  ) {
    // 'Localization Position Update'
    // example: <Buffer 10 27 21 28 48 e1 86 c2 02 01 47 00 00 00 02 fa 00>
    // ANKI_VEHICLE_MSG_V2C_LOCALIZATION_POSITION_UPDATE = 0x27, // 39
    // typedef struct anki_vehicle_msg_localization_position_update {
    //     uint8_t     size;
    //     uint8_t     msg_id;
    //     uint8_t     location_id;
    //     uint8_t     road_piece_id;
    //     float       offset_from_road_center_mm;
    //     uint16_t    speed_mm_per_sec;
    //     uint8_t     parsing_flags;

    //     /* ACK commands received */
    //     uint8_t     last_recv_lane_change_cmd_id;
    //     uint8_t     last_exec_lane_change_cmd_id;
    //     uint16_t    last_desired_lane_change_speed_mm_per_sec;
    //     uint16_t    last_desired_speed_mm_per_sec;
    // } ATTRIBUTE_PACKED anki_vehicle_msg_localization_position_update_t;
    // #define ANKI_VEHICLE_MSG_V2C_LOCALIZATION_POSITION_UPDATE_SIZE  16
    dict.descr = "Localization Position Update";
    dict.location_id = data.readUInt8(2);
    dict.road_piece_id = data.readUInt8(3);
    dict.offset_from_road_center_mm = data.readFloatLE(4);
    dict.speed_mm_per_sec = data.readUInt16LE(8);
    dict.parsing_flags = data.readUInt8(10);
    dict.last_recv_lane_change_cmd_id = data.readUInt8(11);
    dict.last_exec_lane_change_cmd_id = data.readUInt8(12);
    dict.last_desired_lane_change_speed_mm_per_sec = data.readUInt16LE(13);
    dict.last_desired_speed_mm_per_sec = data.readUInt16LE(15);
  } else if (
    messageId === protocol.ANKI_VEHICLE_MSG_V2C_LOCALIZATION_TRANSITION_UPDATE
  ) {
    // 'Localization Transition Update: Car reached new track'
    // example: <Buffer 12 29 00 00 02 2b 55 c2 00 ff 81 46 00 00 00 00 00 25 32>
    // ANKI_VEHICLE_MSG_V2C_LOCALIZATION_TRANSITION_UPDATE = 0x29, // 41
    // typedef struct anki_vehicle_msg_localization_transition_update {
    //     uint8_t     size;
    //     uint8_t     msg_id;
    //     int8_t      road_piece_idx;
    //     int8_t      road_piece_idx_prev;
    //     float       offset_from_road_center_mm;

    //     /* ACK commands received */
    //     uint8_t     last_recv_lane_change_id;
    //     uint8_t     last_exec_lane_change_id;
    //     uint16_t    last_desired_lane_change_speed_mm_per_sec;
    //     int8_t      ave_follow_line_drift_pixels;
    //     uint8_t     had_lane_change_activity;

    //     /* track grade detection */
    //     uint8_t     uphill_counter;
    //     uint8_t     downhill_counter;

    //     /* wheel displacement (cm) since last transition bar */
    //     uint8_t     left_wheel_dist_cm;
    //     uint8_t     right_wheel_dist_cm;
    // } ATTRIBUTE_PACKED anki_vehicle_msg_localization_transition_update_t;
    // #define ANKI_VEHICLE_MSG_V2C_LOCALIZATION_TRANSITION_UPDATE_SIZE    17
    dict.descr = "Localization Position Update: Car reached new track";
    dict.road_piece_idx = data.readUInt8(2);
    dict.road_piece_idx_prev = data.readUInt8(3);
    dict.offset_from_road_center_mm = data.readFloatLE(4);
    dict.last_recv_lane_change_id = data.readUInt8(8);
    dict.last_exec_lane_change_id = data.readUInt8(9);
    dict.last_desired_lane_change_speed_mm_per_sec = data.readUInt16LE(10);
    dict.ave_follow_line_drift_pixels = data.readUInt8(12);
    dict.had_lane_change_activity = data.readUInt8(13);
    dict.uphill_counter = data.readUInt8(14);
    dict.downhill_counter = data.readUInt8(15);
    dict.left_wheel_dist_cm = data.readUInt8(16);
    dict.right_wheel_dist_cm = data.readUInt8(17);
  } else if (
    messageId === protocol.ANKI_VEHICLE_MSG_V2C_LOCALIZATION_INTERSECTION_UPDATE
  ) {
    // ANKI_VEHICLE_MSG_V2C_LOCALIZATION_INTERSECTION_UPDATE = 0x2a, // 42
    // typedef struct anki_vehicle_msg_localization_intersection_update {
    //     uint8_t     size;
    //     uint8_t     msg_id;
    //     int8_t      road_piece_idx;
    //     float       offset_from_road_center_mm;

    //     uint8_t     intersection_code;
    //     uint8_t     is_exiting;
    //     uint16_t    mm_since_last_transition_bar;
    //     uint16_t    mm_since_last_intersection_code;
    // } ATTRIBUTE_PACKED anki_vehicle_msg_localization_intersection_update_t;
    // #define ANKI_VEHICLE_MSG_V2C_LOCALIZATION_INTERSECTION_UPDATE_SIZE    12
    dict.descr = "Localization Intersection Update";
    dict.road_piece_idx = data.readUInt8(2);
    dict.offset_from_road_center_mm = data.readFloatLE(3);
    dict.intersection_code = data.readUInt8(7);
    dict.is_exiting = data.readUInt8(8);
    dict.mm_since_last_transition_bar = data.readUInt16LE(9);
    dict.mm_since_last_intersection_code = data.readUInt16LE(11);
  } else if (messageId === protocol.ANKI_VEHICLE_MSG_V2C_VEHICLE_DELOCALIZED) {
    // 'Vehicle Delocalized'
    // example: <Buffer 01 2b>
    // ANKI_VEHICLE_MSG_V2C_VEHICLE_DELOCALIZED = 0x2b, // 43
    dict.descr = "Vehicle Delocalized";
  } else if (
    messageId === protocol.ANKI_VEHICLE_MSG_V2C_OFFSET_FROM_ROAD_CENTER_UPDATE
  ) {
    // 'Offset from Road Center Update'
    // example: <Buffer 06 2d 00 c8 75 3d 03>
    // ANKI_VEHICLE_MSG_V2C_OFFSET_FROM_ROAD_CENTER_UPDATE = 0x2d, // 45
    // typedef struct anki_vehicle_msg_offset_from_road_center_update {
    //     uint8_t     size;
    //     uint8_t     msg_id;
    //     float       offset_from_road_center_mm;
    //     uint8_t     lane_change_id;
    // } ATTRIBUTE_PACKED anki_vehicle_msg_offset_from_road_center_update_t;
    // #define ANKI_VEHICLE_MSG_V2C_OFFSET_FROM_ROAD_CENTER_UPDATE_SIZE  6
    dict.descr = "Offset from Road Center Update";
    dict.offset_from_road_center_mm = data.readFloatLE(2);
    dict.lane_change_id = data.readUInt8(6);
  } else if (messageId === protocol.ANKI_VEHICLE_MSG_V2CU_LOADING_UPDATE) {
    // 'Loading Status Changed'
    // example: <Buffer 05 3f 01 00 00 01>
    dict["descr"] = "Loading Status";
    const carNotLoading = data.readUInt8(3);
    if (carNotLoading == 0) {
      isLoading = false;
    } else if (carNotLoading == 1) {
      isLoading = true;
    }
    dict["isLoading"] = isLoading;
  } else if (messageId === protocol.ANKI_VEHICLE_MSG_V2CU_OFFSET_UPDATE) {
    // 'Changed Offset (not documented)'
    // example: <Buffer 0e 41 9a 99 7f 42 9a 99 7f 42 00 00 00 02 81>
    dict["descr"] = "Offset Changed (not documented)";
    dict["offset"] = data.readFloatLE(2);
  } else if (messageId === protocol.ANKI_VEHICLE_MSG_V2CU_UNKNOWN_1) {
    // example: <Buffer 03 36 00 00>
    dict["descr"] = "Unknown";
  } else if (messageId == protocol.ANKI_VEHICLE_MSG_V2CU_UNKNOWN_2) {
    // 'Unknown'
    // example: <Buffer 01 43>
    dict["descr"] = "Unknown";
  } else if (messageId === protocol.ANKI_VEHICLE_MSG_V2CU_UNKNOWN_3) {
    // 'Unknown'
    // example: <Buffer 03 4d 00 01>
    dict["descr"] = "Unknown";
  } else if (messageId === protocol.ANKI_VEHICLE_MSG_V2CU_UNKNOWN_4) {
    // 'Unknown'
    // example: <Buffer 0b 86 8e 00 27 08 00 00 10 10 00 00>
    dict["descr"] = "Unknown";
  } else if (messageId === protocol.ANKI_VEHICLE_MSG_V2CU_UNKNOWN_5) {
    // 'Unknown'
    // example: tbd
    dict["descr"] = "Unknown";
  } else {
    // 'Unknown message id'
    dict["descr"] = "Unknown";
  }
  return dict;
}

/**
 * git@github.com:anki/drive-sdk.git
 * ANKI_VEHICLE_MSG_C2V_SET_SPEED = 0x24, // 36
 * typedef struct anki_vehicle_msg_set_speed {
 *   uint8_t     size;
 *   uint8_t     msg_id;
 *   int16_t     speed_mm_per_sec;  // mm/sec
 *   int16_t     accel_mm_per_sec2; // mm/sec^2
 *   uint8_t     respect_road_piece_speed_limit;
 * } ATTRIBUTE_PACKED anki_vehicle_msg_set_speed_t;
 * #define ANKI_VEHICLE_MSG_C2V_SET_SPEED_SIZE  6
 * @param {Number} speed // mm/sec
 * @param {Number} accel // mm/sec^2
 * @returns message
 */
function encodeSpeed(speed, accel) {
  const message = Buffer.alloc(7);
  message.writeUInt8(6, 0);
  message.writeUInt8(36, 1);
  message.writeInt16LE(speed, 2);
  message.writeInt16LE(accel, 4);
  return message;
}

function encodeStop() {
  return encodeSpeed(0, 12500);
}

/**
 * git@github.com:anki/drive-sdk.git
 * ANKI_VEHICLE_MSG_C2V_SET_OFFSET_FROM_ROAD_CENTER = 0x2c, // 44
 * typedef struct anki_vehicle_msg_set_offset_from_road_center {
 *    uint8_t     size;
 *    uint8_t     msg_id;
 *    float       offset_mm;
 * } ATTRIBUTE_PACKED anki_vehicle_msg_set_offset_from_road_center_t;
 * #define ANKI_VEHICLE_MSG_C2V_SET_OFFSET_FROM_ROAD_CENTER_SIZE   5
 * @param {Float} offset // mm
 * @returns
 */
function encodeOffsetSet(offset) {
  // LANE 1 -68
  // LANE 2 -23
  // LANE 3  23
  // LANE 4  68
  // const validOffsets = [-68, -23, 23, 68]
  // const offset = validOffsets[lane]
  const message = Buffer.alloc(6);
  message.writeUInt8(5, 0);
  message.writeUInt8(44, 1);
  message.writeFloatLE(offset, 2);
  return message;
}

/**
 * git@github.com:anki/drive-sdk.git
 * ANKI_VEHICLE_MSG_C2V_CHANGE_LANE = 0x25, // 37
 * typedef struct anki_vehicle_msg_change_lane {
 *    uint8_t     size;
 *    uint8_t     msg_id;
 *    uint16_t    horizontal_speed_mm_per_sec;
 *    uint16_t    horizontal_accel_mm_per_sec2;
 *    float       offset_from_road_center_mm;
 *    uint8_t     hop_intent;
 *    uint8_t     tag;
 * } ATTRIBUTE_PACKED anki_vehicle_msg_change_lane_t;
 * #define ANKI_VEHICLE_MSG_C2V_CHANGE_LANE_SIZE    11
 * @param {Float} offset // mm
 * @returns message
 */
function encodeOffsetChange(offset) {
  const message = Buffer.alloc(12);
  message.writeUInt8(11, 0);
  message.writeUInt8(37, 1);
  message.writeInt16LE(250, 2);
  message.writeInt16LE(1000, 4);
  message.writeFloatLE(offset, 6);
  return message;
}

/**
 * git@github.com:anki/drive-sdk.git
 * ANKI_VEHICLE_MSG_C2V_CANCEL_LANE_CHANGE = 0x26, // 38
 * @returns
 */
function encodeOffsetChangeCancel() {
  const message = Buffer.alloc(2);
  message.writeUInt8(1, 0);
  message.writeUInt8(38, 1);
  return message;
}

/**
 * git@github.com:anki/drive-sdk.git
 * ANKI_VEHICLE_MSG_C2V_SET_LIGHTS = 0x1d, // 29
 * The bits in the simple light message corresponding to each type of light.
 * #define LIGHT_HEADLIGHTS    0
 * #define LIGHT_BRAKELIGHTS   1
 * #define LIGHT_FRONTLIGHTS   2
 * #define LIGHT_ENGINE        3
 * typedef struct anki_vehicle_msg_set_lights {
 *     uint8_t size;
 *     uint8_t msg_id;
 *     uint8_t light_mask;     // Valid and value bits for lights (see above)
 * } ATTRIBUTE_PACKED anki_vehicle_msg_set_lights_t;
 * #define ANKI_VEHICLE_MSG_C2V_SET_LIGHTS_SIZE 2
 * @param {Number} mask
 * @returns message
 */
function encodeLightChange(mask) {
  const message = Buffer.alloc(3);
  message.writeUInt8(2, 0);
  message.writeUInt8(29, 1);
  message.writeUInt8(mask, 2);
  return message;
}

/**
 * git@github.com:anki/drive-sdk.git
 * ANKI_VEHICLE_MSG_C2V_LIGHTS_PATTERN = 0x33, // 51
 * #define ANKI_VEHICLE_MAX_LIGHT_INTENSITY 14
 * #define ANKI_VEHICLE_MAX_LIGHT_TIME 11
 *
 *  LED channel definitions - for RGB engine, front, and tail lights
 * typedef enum {
 *    LIGHT_RED,
 *    LIGHT_TAIL,
 *    LIGHT_BLUE,
 *    LIGHT_GREEN,
 *    LIGHT_FRONTL,
 *    LIGHT_FRONTR,
 *    LIGHT_COUNT
 * } anki_vehicle_light_channel_t;
 *
 * Below is a description of the various effects used in SetLight(...)
 * typedef enum {
 *    EFFECT_STEADY,    // Simply set the light intensity to 'start' value
 *    EFFECT_FADE,      // Fade intensity from 'start' to 'end'
 *    EFFECT_THROB,     // Fade intensity from 'start' to 'end' and back to 'start'
 *    EFFECT_FLASH,     // Turn on LED between time 'start' and time 'end' inclusive
 *    EFFECT_RANDOM,    // Flash the LED erratically - ignoring start/end
 *    EFFECT_COUNT
 * } anki_vehicle_light_effect_t;
 *
 * typedef struct anki_vehicle_light_config {
 *    uint8_t     channel;
 *    uint8_t     effect;
 *    uint8_t     start;
 *    uint8_t     end;
 *    uint8_t     cycles_per_10_sec;
 * } ATTRIBUTE_PACKED anki_vehicle_light_config_t;
 *
 * #define LIGHT_CHANNEL_COUNT_MAX 3
 * typedef struct anki_vehicle_msg_lights_pattern {
 *    uint8_t                         size;
 *    uint8_t                         msg_id;
 *    uint8_t                         channel_count;
 *    anki_vehicle_light_config_t     channel_config[LIGHT_CHANNEL_COUNT_MAX];
 * } ATTRIBUTE_PACKED anki_vehicle_msg_lights_pattern_t;
 * #define ANKI_VEHICLE_MSG_C2V_LIGHTS_PATTERN_SIZE    17
 * @param {Number} r
 * @param {Number} g
 * @param {Number} b
 * @returns message
 */
function encodeEngineLightChange(r, g, b) {
  const channel_count = 3;
  const cycles_per_10_sec = 0;
  const LIGHT_RED = 0;
  const LIGHT_GREEN = 3;
  const LIGHT_BLUE = 2;
  const EFFECT_STEADY = 0;
  const message = Buffer.alloc(18);
  message.writeUInt8(17, 0);
  message.writeUInt8(51, 1);
  message.writeUInt8(channel_count, 2);

  message.writeUInt8(LIGHT_RED, 3);
  message.writeUInt8(EFFECT_STEADY, 4);
  message.writeUInt8(r, 5);
  message.writeUInt8(r, 6);
  message.writeUInt8(cycles_per_10_sec, 7);

  message.writeUInt8(LIGHT_GREEN, 8);
  message.writeUInt8(EFFECT_STEADY, 9);
  message.writeUInt8(g, 10);
  message.writeUInt8(g, 11);
  message.writeUInt8(cycles_per_10_sec, 12);

  message.writeUInt8(LIGHT_BLUE, 13);
  message.writeUInt8(EFFECT_STEADY, 14);
  message.writeUInt8(b, 15);
  message.writeUInt8(b, 16);
  message.writeUInt8(cycles_per_10_sec, 17);
  return message;
}

/**
 * git@github.com:anki/drive-sdk.git
 * ANKI_VEHICLE_MSG_C2V_BATTERY_LEVEL_REQUEST = 0x1a, // 26
 * @returns  message
 */
function encodeBatteryRequest() {
  const message = Buffer.alloc(2);
  message.writeUInt8(1, 0);
  message.writeUInt8(26, 1);
  return message;
}

/**
 * git@github.com:anki/drive-sdk.git
 * ANKI_VEHICLE_MSG_C2V_DISCONNECT = 0x0d, // 13
 * @returns message
 */
function encodeDisconnect() {
  const message = Buffer.alloc(2);
  message.writeUInt8(1, 0);
  message.writeUInt8(13, 1);
  return message;
}
/**
 * git@github.com:anki/drive-sdk.git
 * ANKI_VEHICLE_MSG_C2V_TURN = 0x32, // 50
 * typedef enum {
 *   VEHICLE_TURN_NONE        = 0,
 *   VEHICLE_TURN_LEFT        = 1,
 *   VEHICLE_TURN_RIGHT       = 2,
 *   VEHICLE_TURN_UTURN       = 3,
 *   VEHICLE_TURN_UTURN_JUMP  = 4,
 * } anki_vehicle_turn_type_t;
 *
 * typedef enum {
 *   VEHICLE_TURN_TRIGGER_IMMEDIATE    = 0, // Run immediately
 *   VEHICLE_TURN_TRIGGER_INTERSECTION = 1, // Run at the next intersection
 * } anki_vehicle_turn_trigger_t;
 *
 * typedef struct anki_vehicle_msg_turn {
 *    uint8_t     size;
 *    uint8_t     msg_id;
 *    uint8_t     type;
 *    uint8_t     trigger;
 * } ATTRIBUTE_PACKED anki_vehicle_msg_turn_t;
 * #define ANKI_VEHICLE_MSG_C2V_TURN_SIZE 3
 * @returns message
 */
function encodeUTurn() {
  const VEHICLE_TURN_UTURN = 3;
  const VEHICLE_TURN_TRIGGER_IMMEDIATE = 0;
  const message = Buffer.alloc(4);
  message.writeUInt8(3, 0);
  message.writeUInt8(50, 1);
  message.writeUInt8(VEHICLE_TURN_UTURN, 2);
  message.writeUInt8(VEHICLE_TURN_TRIGGER_IMMEDIATE, 3);
  return message;
}

/**
 * git@github.com:anki/drive-sdk.git
 * ANKI_VEHICLE_MSG_C2V_SDK_MODE = 0x90, // 144
 * #define ANKI_VEHICLE_SDK_OPTION_OVERRIDE_LOCALIZATION   0x1
 * typedef struct anki_vehicle_msg_sdk_mode {
 *     uint8_t     size;
 *     uint8_t     msg_id;
 *     uint8_t     on;
 *     uint8_t     flags;
 * } ATTRIBUTE_PACKED anki_vehicle_msg_sdk_mode_t;
 * #define ANKI_VEHICLE_MSG_SDK_MODE_SIZE   3
 * @returns message
 */
function encodeSDKActivation() {
  const message = Buffer.alloc(4);
  message.writeUInt8(3, 0);
  message.writeUInt8(144, 1);
  message.writeUInt8(1, 2);
  message.writeUInt8(1, 3);
  return message;
}

/**
 * git@github.com:anki/drive-sdk.git
 * ANKI_VEHICLE_MSG_C2V_PING_REQUEST = 0x16, // 22
 */
function encodePing() {
  message = Buffer.alloc(2);
  message.writeUInt8(1, 0);
  message.writeUInt8(22, 1);
}

/**
 * git@github.com:anki/drive-sdk.git
 * ANKI_VEHICLE_MSG_C2V_VERSION_REQUEST = 0x18, // 24
 */
function encodeVersion() {
  message = Buffer.alloc(2);
  message.writeUInt8(1, 0);
  message.writeUInt8(24, 1);
}

/**
 * git@github.com:anki/drive-sdk.git
 * ANKI_VEHICLE_MSG_C2V_SET_CONFIG_PARAMS = 0x45, // 69
 * This message is experimental and may change in the future.
 * typedef enum anki_track_material {
 *    TRACK_MATERIAL_PLASTIC,
 *    TRACK_MATERIAL_VINYL,
 * } anki_track_material_t;
 *
 * #define SUPERCODE_NONE          0
 * #define SUPERCODE_BOOST_JUMP    1
 * #define SUPERCODE_ALL           (SUPERCODE_BOOST_JUMP)
 *
 * typedef struct anki_vehicle_msg_set_config_params {
 *     uint8_t     size;
 *     uint8_t     msg_id;
 *     uint8_t     super_code_parse_mask;
 *     uint8_t     track_material;
 * } ATTRIBUTE_PACKED anki_vehicle_msg_set_config_params_t;
 * #define ANKI_VEHICLE_MSG_C2V_SET_CONFIG_PARAMS_SIZE 3
 * @param {Boolean} plastic
 * @param {Boolean} supercode
 */
function encodeConfigChange() {
  const TRACK_MATERIAL_PLASTIC = 0;
  const TRACK_MATERIAL_VINYL = 1;
  const SUPERCODE_NONE = 0;
  const SUPERCODE_ALL = 1;
  message = Buffer.alloc(4);
  message.writeUInt8(3, 0);
  message.writeUInt8(69, 1);
  message.writeUInt8(
    plastic ? TRACK_MATERIAL_PLASTIC : TRACK_MATERIAL_VINYL,
    2
  );
  message.writeUInt8(supercode ? SUPERCODE_ALL : SUPERCODE_NONE, 2);
}

module.exports = {
  decodeCarname: decodeCarname,
  decodeCarInformation: decodeCarInformation,
  getMessageTypes: getMessageTypes,
  decodeMessage: decodeMessage,
  encodeSpeed: encodeSpeed,
  encodeStop: encodeStop,
  encodeOffsetSet: encodeOffsetSet,
  encodeOffsetChange: encodeOffsetChange,
  encodeOffsetChangeCancel: encodeOffsetChangeCancel,
  encodeLightChange: encodeLightChange,
  encodeEngineLightChange: encodeEngineLightChange,
  encodeBatteryRequest: encodeBatteryRequest,
  encodeDisconnect: encodeDisconnect,
  encodeUTurn: encodeUTurn,
  encodeSDKActivation: encodeSDKActivation,
  encodePing: encodePing,
  encodeVersion: encodeVersion,
  encodeConfigChange: encodeConfigChange,
};
