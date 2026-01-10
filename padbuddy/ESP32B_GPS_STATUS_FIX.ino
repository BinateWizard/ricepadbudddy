/*********************************************************************
 * PadBuddy ESP32B – Motor + GPS Node (HTTP REST API)
 * Pin Locked Version:
 *   Motor: IN1=26, IN2=27, ENA=14
 *   GPS:  RX=17, TX=16
 * 
 * ✅ FIXED: GPS status now properly set to "ok" on success
 * ✅ FIXED: Uses PUT instead of PATCH to replace old GPS data
 * 
 * Command Paths (polled from Firebase RTDB):
 *   Motor: /devices/DEVICE_ID/commands/ESP32B/motor
 *   GPS:   /devices/DEVICE_ID/commands/ESP32B/gps
 * 
 * GPS Data Output Path:
 *   /devices/DEVICE_ID/gps
 *********************************************************************/

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <NTPClient.h>
#include <WiFiUdp.h>
#include <TinyGPSPlus.h>

// ================= WIFI CONFIG =================
const char* WIFI_SSID = "4G-UFI-5623";
const char* WIFI_PASS = "1234567890";

// ================= FIREBASE CONFIG =================
#define FIREBASE_URL   "https://rice-padbuddy-default-rtdb.asia-southeast1.firebasedatabase.app"
#define FIREBASE_AUTH  "lTOi0CD0S1Mf3Vu6dVhCPPaWKU9c5FTRSZ9idBYN"

#define DEVICE_ID "DEVICE_0005"
#define NODE_ID   "ESP32B"

// ================= MOTOR CONFIG =================
#define IN1 26
#define IN2 27
#define ENA 14

// ================= GPS CONFIG =================
#define GPS_RX 16 // ESP32 RX receives GPS TX
#define GPS_TX 17 // ESP32 TX → GPS RX (optional)
#define GPS_BAUD 9600

HardwareSerial gpsSerial(2); // UART2 for GPS
TinyGPSPlus gps;

// ================= TIMING =================
#define HEARTBEAT_INTERVAL 30000UL
#define COMMAND_POLL_MIN 1000UL
#define COMMAND_POLL_MAX 5000UL
#define GPS_TIMEOUT 30000UL
#define MOTOR_RUN_TIME 5000UL  // Motor runs for 5 seconds

// ================= STATE =================
unsigned long lastHeartbeat = 0;
unsigned long lastMotorPoll = 0;
unsigned long lastGPSPoll = 0;
unsigned long motorPollInterval = COMMAND_POLL_MIN;
unsigned long gpsPollInterval = COMMAND_POLL_MIN;

unsigned long long lastProcessedMotorCommand = 0;
unsigned long long lastProcessedGPSCommand = 0;

// ================= NTP =================
WiFiUDP ntpUDP;
NTPClient timeClient(ntpUDP, "pool.ntp.org", 0, 60000);
bool timeSynced = false;

// ================= UTILITY FUNCTIONS =================
void logMsg(const String &msg) {
  Serial.printf("[%lu] %s\n", millis(), msg.c_str());
}

unsigned long long getTimestamp() {
  if (timeSynced && timeClient.getEpochTime() > 0) {
    return (unsigned long long)timeClient.getEpochTime() * 1000ULL + (millis() % 1000);
  }
  return millis();
}

// ================= WIFI =================
void connectWiFi() {
  static unsigned long lastAttempt = 0;
  const unsigned long retryInterval = 10000; // 10s backoff

  if (WiFi.status() == WL_CONNECTED) return;

  if (millis() - lastAttempt < retryInterval) return;
  lastAttempt = millis();

  logMsg("WiFi disconnected, starting WiFi.begin()");
  WiFi.disconnect(true);  // ✅ Full disconnect - clears previous connection state
  delay(100);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
}

// ================= HTTP HELPERS =================
bool sendPUTInt64(const String &path, unsigned long long value) {
  if (WiFi.status() != WL_CONNECTED) return false;
  HTTPClient http;
  http.setTimeout(5000);
  String url = String(FIREBASE_URL) + path + ".json?auth=" + FIREBASE_AUTH;
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  String payload = String(value);
  int code = http.PUT(payload);
  http.end();
  return (code >= 200 && code < 300);
}

bool sendPUT(const String &path, const String &jsonPayload) {
  if (WiFi.status() != WL_CONNECTED) return false;
  HTTPClient http;
  http.setTimeout(5000);
  String url = String(FIREBASE_URL) + path + ".json?auth=" + FIREBASE_AUTH;
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  int code = http.PUT(jsonPayload);
  http.end();
  return (code >= 200 && code < 300);
}

String sendGET(const String &path) {
  if (WiFi.status() != WL_CONNECTED) return "";
  HTTPClient http;
  http.setTimeout(5000);
  String url = String(FIREBASE_URL) + path + ".json?auth=" + FIREBASE_AUTH;
  http.begin(url);
  int code = http.GET();
  String payload = "";
  if (code >= 200 && code < 300) payload = http.getString();
  http.end();
  return payload;
}

bool sendPATCH(const String &path, const String &jsonPayload) {
  if (WiFi.status() != WL_CONNECTED) return false;
  HTTPClient http;
  http.setTimeout(5000);
  String url = String(FIREBASE_URL) + path + ".json?auth=" + FIREBASE_AUTH;
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  int code = http.PATCH(jsonPayload);
  http.end();
  return (code >= 200 && code < 300);
}

// ================= HEARTBEAT =================
void sendHeartbeat() {
  if (millis() - lastHeartbeat < HEARTBEAT_INTERVAL) return;
  unsigned long long ts = getTimestamp();
  String path = "/devices/" DEVICE_ID "/heartbeat";
  if (sendPUTInt64(path, ts)) {
    logMsg("Heartbeat sent: " + String((unsigned long)(ts / 1000)));
  } else {
    logMsg("Heartbeat failed");
  }
  lastHeartbeat = millis();
}

// ================= MOTOR CONTROL =================
void moveDown() { 
  digitalWrite(IN1, HIGH); 
  digitalWrite(IN2, LOW); 
  analogWrite(ENA, 255);  // Full speed PWM for 12V motor
  logMsg("Motor: Moving DOWN");
}

void moveUp() { 
  digitalWrite(IN1, LOW); 
  digitalWrite(IN2, HIGH); 
  analogWrite(ENA, 255);  // Full speed PWM for 12V motor
  logMsg("Motor: Moving UP");
}

void stopMotor() { 
  analogWrite(ENA, 0);  // PWM 0 = motor off
  digitalWrite(IN1, LOW);
  digitalWrite(IN2, LOW);
  logMsg("Motor: STOPPED");
}

void handleMotorCommand(const JsonObject &cmd) {
  unsigned long long ts = getTimestamp();
  String cmdPath = "/devices/" DEVICE_ID "/commands/" NODE_ID "/motor";

  // Send ACK immediately
  StaticJsonDocument<256> ackDoc;
  ackDoc["acknowledgedAt"] = ts;
  ackDoc["status"] = "acknowledged";
  String ackJson; 
  serializeJson(ackDoc, ackJson);
  if (!sendPATCH(cmdPath, ackJson)) {
    logMsg("Failed to send motor ACK");
  }

  // Get action from command
  String action = cmd["action"].as<String>();
  logMsg("Executing motor command: " + action);

  // Execute motor action with auto-stop
  if (action == "down") {
    moveDown();
    delay(MOTOR_RUN_TIME);
    stopMotor();
  } else if (action == "up") {
    moveUp();
    delay(MOTOR_RUN_TIME);
    stopMotor();
  } else {
    stopMotor();
  }

  // Send completion status
  ts = getTimestamp();
  StaticJsonDocument<256> completeDoc;
  completeDoc["status"] = "completed";
  completeDoc["executedAt"] = ts;
  
  if (action == "down") {
    completeDoc["actualState"] = "motor_down";
  } else if (action == "up") {
    completeDoc["actualState"] = "motor_up";
  } else {
    completeDoc["actualState"] = "motor_stopped";
  }
  
  String completeJson; 
  serializeJson(completeDoc, completeJson);
  if (sendPATCH(cmdPath, completeJson)) {
    logMsg("Motor command completed: " + action);
  } else {
    logMsg("Failed to send motor completion");
  }
}

// ================= GPS HANDLER =================
void handleGPSCommand(const JsonObject &cmd) {
  unsigned long long ts = getTimestamp();
  String cmdPath = "/devices/" DEVICE_ID "/commands/" NODE_ID "/gps";
  String gpsDataPath = "/devices/" DEVICE_ID "/gps";

  // Send ACK immediately
  StaticJsonDocument<256> ackDoc;
  ackDoc["acknowledgedAt"] = ts;
  ackDoc["status"] = "acknowledged";
  String ackJson; 
  serializeJson(ackDoc, ackJson);
  if (!sendPATCH(cmdPath, ackJson)) {
    logMsg("Failed to send GPS ACK");
  }

  logMsg("Waiting for GPS fix (max 30s)...");

  unsigned long start = millis();
  bool gotFix = false;
  
  while (millis() - start < GPS_TIMEOUT) {
    // Feed watchdog and allow WiFi stack to run
    yield();
    
    while (gpsSerial.available()) {
      gps.encode(gpsSerial.read());
    }
    
    if (gps.location.isValid() && gps.location.isUpdated()) {
      int sats = gps.satellites.isValid() ? gps.satellites.value() : 0;
      double hdop = gps.hdop.isValid() ? gps.hdop.hdop() : 99.0;
      if (sats >= 3 && hdop < 5.0) {
        gotFix = true;
        logMsg("GPS fix acquired: " + String(sats) + " sats, HDOP: " + String(hdop));
        break;
      }
    }
    delay(100);
  }

  ts = getTimestamp();

  if (gotFix) {
    // ✅ SUCCESS: Send GPS data with status: "ok"
    StaticJsonDocument<384> gpsDoc;
    gpsDoc["status"] = "ok";  // ✅ CRITICAL FIX: Set status to "ok" for frontend
    gpsDoc["lat"] = gps.location.lat();
    gpsDoc["lng"] = gps.location.lng();
    gpsDoc["alt"] = gps.altitude.isValid() ? gps.altitude.meters() : 0;
    gpsDoc["sats"] = gps.satellites.value();
    gpsDoc["hdop"] = gps.hdop.hdop();
    gpsDoc["timestamp"] = ts;
    gpsDoc["ts"] = ts;
    gpsDoc["deviceId"] = DEVICE_ID;
    gpsDoc["nodeId"] = NODE_ID;
    
    String gpsJson; 
    serializeJson(gpsDoc, gpsJson);
    
    // ✅ Use PUT to completely replace GPS data (clears old error status)
    if (sendPUT(gpsDataPath, gpsJson)) {
      logMsg("GPS data sent to " + gpsDataPath);
    } else {
      logMsg("Failed to send GPS data");
    }

    // Update command status to completed
    StaticJsonDocument<256> completeDoc;
    completeDoc["status"] = "completed";
    completeDoc["executedAt"] = ts;
    completeDoc["actualState"] = "gps_read";
    completeDoc["lat"] = gps.location.lat();
    completeDoc["lng"] = gps.location.lng();
    
    String completeJson; 
    serializeJson(completeDoc, completeJson);
    sendPATCH(cmdPath, completeJson);
    logMsg("GPS command completed successfully");
  } else {
    // ❌ FAILURE: Send error status
    logMsg("GPS fix timeout after 30 seconds");
    
    // Clear GPS data and set error status
    StaticJsonDocument<256> gpsErrorDoc;
    gpsErrorDoc["status"] = "error";
    gpsErrorDoc["timestamp"] = ts;
    
    String gpsErrorJson; 
    serializeJson(gpsErrorDoc, gpsErrorJson);
    sendPUT(gpsDataPath, gpsErrorJson);
    
    // Update command status to error
    StaticJsonDocument<256> errDoc;
    errDoc["status"] = "error";
    errDoc["error"] = "GPS fix timeout";
    errDoc["executedAt"] = ts;
    errDoc["sats"] = gps.satellites.isValid() ? gps.satellites.value() : 0;
    errDoc["hdop"] = gps.hdop.isValid() ? gps.hdop.hdop() : 99.0;
    
    String errJson; 
    serializeJson(errDoc, errJson);
    sendPATCH(cmdPath, errJson);
    logMsg("GPS command failed");
  }
}

// ================= COMMAND POLLING =================
void pollMotorCommand() {
  if (millis() - lastMotorPoll < motorPollInterval) return;
  lastMotorPoll = millis();

  String path = "/devices/" DEVICE_ID "/commands/" NODE_ID "/motor";
  String payload = sendGET(path);
  
  if (payload.length() == 0 || payload == "null") { 
    motorPollInterval = COMMAND_POLL_MAX; 
    return; 
  }

  StaticJsonDocument<512> doc;
  if (deserializeJson(doc, payload)) {
    logMsg("Motor JSON parse error");
    return;
  }

  JsonObject cmd = doc.as<JsonObject>();
  if (!cmd.containsKey("status") || !cmd.containsKey("action") || !cmd.containsKey("requestedAt")) return;

  String status = cmd["status"].as<String>();
  unsigned long long requestedAt = cmd["requestedAt"].as<unsigned long long>();
  if (requestedAt == lastProcessedMotorCommand) return;

  if (status == "pending") {
    lastProcessedMotorCommand = requestedAt;
    logMsg("New motor command received");
    handleMotorCommand(cmd);
    motorPollInterval = COMMAND_POLL_MIN;
  } else {
    motorPollInterval = COMMAND_POLL_MAX;
  }
}

void pollGPSCommand() {
  if (millis() - lastGPSPoll < gpsPollInterval) return;
  lastGPSPoll = millis();

  String path = "/devices/" DEVICE_ID "/commands/" NODE_ID "/gps";
  String payload = sendGET(path);
  
  if (payload.length() == 0 || payload == "null") { 
    gpsPollInterval = COMMAND_POLL_MAX; 
    return; 
  }

  StaticJsonDocument<512> doc;
  if (deserializeJson(doc, payload)) {
    logMsg("GPS JSON parse error");
    return;
  }

  JsonObject cmd = doc.as<JsonObject>();
  if (!cmd.containsKey("status") || !cmd.containsKey("requestedAt")) return;

  String status = cmd["status"].as<String>();
  unsigned long long requestedAt = cmd["requestedAt"].as<unsigned long long>();
  if (requestedAt == lastProcessedGPSCommand) return;

  if (status == "pending") {
    lastProcessedGPSCommand = requestedAt;
    logMsg("New GPS command received");
    handleGPSCommand(cmd);
    gpsPollInterval = COMMAND_POLL_MIN;
  } else {
    gpsPollInterval = COMMAND_POLL_MAX;
  }
}

// ================= SETUP =================
void setup() {
  Serial.begin(115200);
  delay(1000);
  
  logMsg("========================================");
  logMsg("PadBuddy ESP32B - Motor + GPS Node");
  logMsg("Device: " DEVICE_ID);
  logMsg("Node: " NODE_ID);
  logMsg("========================================");

  // Motor pins
  pinMode(IN1, OUTPUT);
  pinMode(IN2, OUTPUT);
  pinMode(ENA, OUTPUT);
  stopMotor();

  // GPS Serial
  gpsSerial.begin(GPS_BAUD, SERIAL_8N1, GPS_RX, GPS_TX);
  logMsg("GPS Serial initialized on RX=" + String(GPS_RX) + ", TX=" + String(GPS_TX));

  // WiFi - Blocking connection with timeout
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  logMsg("Connecting to WiFi...");

  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 15000) {
    delay(500);
    Serial.print(".");
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    logMsg("WiFi connected: " + WiFi.localIP().toString());
  } else {
    logMsg("WiFi connection FAILED, continuing in offline mode");
  }

  // NTP
  timeClient.begin();
  if (WiFi.status() == WL_CONNECTED) {
    timeSynced = timeClient.forceUpdate();
    if (!timeSynced) logMsg("NTP sync failed, fallback to millis()");
  }

  // Only send heartbeat if connected
  if (WiFi.status() == WL_CONNECTED) {
    sendHeartbeat();
  }

  logMsg("ESP32B Motor+GPS node READY");
  logMsg("Polling motor: /devices/" DEVICE_ID "/commands/" NODE_ID "/motor");
  logMsg("Polling GPS: /devices/" DEVICE_ID "/commands/" NODE_ID "/gps");
}

// ================= LOOP =================
void loop() {
  connectWiFi();
  if (timeClient.update()) timeSynced = true;

  sendHeartbeat();

  pollMotorCommand();
  pollGPSCommand();

  while (gpsSerial.available()) {
    gps.encode(gpsSerial.read());
  }

  delay(100);
}
