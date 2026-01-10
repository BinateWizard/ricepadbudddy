/*********************************************************************
 * PadBuddy ESP32B – Motor + GPS Node (HTTP REST API)
 * FINAL VERSION – Relay-style structure + Complete Error Handling
 *********************************************************************/

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <TinyGPSPlus.h>
#include <WiFiUdp.h>
#include <NTPClient.h>

// ================= WIFI =================
const char* WIFI_SSID = "ZTE_2.4G_cAabzE";
const char* WIFI_PASS = "JKCh4gdT";

// ================= FIREBASE =================
const char* DATABASE_URL    = "https://rice-padbuddy-default-rtdb.asia-southeast1.firebasedatabase.app";
const char* DATABASE_SECRET = "lTOi0CD0S1Mf3Vu6dVhCPPaWKU9c5FTRSZ9idBYN";

// ================= DEVICE INFO =================
#define DEVICE_ID "DEVICE_0005"
#define NODE_ID   "ESP32B"

// ================= MOTOR PINS =================
#define IN1 26
#define IN2 27
#define ENA 14

// ================= GPS PINS =================
#define GPS_RX 17
#define GPS_TX 16
#define GPS_BAUD 9600

HardwareSerial gpsSerial(2);
TinyGPSPlus gps;

// ================= POLLING / TIMING =================
unsigned long nextMotorPollAt = 0;
unsigned long nextGPSPollAt = 0;
const unsigned long pollInterval = 1000;

unsigned long lastHeartbeat = 0;
const unsigned long HEARTBEAT_INTERVAL = 30000;

unsigned long lastWiFiAttempt = 0;
const unsigned long WIFI_RECONNECT_INTERVAL = 30000;

// ================= STATE =================
unsigned long long lastMotorTS = 0;
unsigned long long lastGPSTS = 0;
bool wifiConnected = false;

// ================= NTP =================
WiFiUDP ntpUDP;
NTPClient timeClient(ntpUDP, "pool.ntp.org", 0, 60000);
bool timeSynced = false;

// ================= UTIL =================
unsigned long long nowTS() {
  return timeSynced
           ? (unsigned long long)timeClient.getEpochTime() * 1000ULL + (millis() % 1000)
           : millis();
}

void printTimestamp() {
  unsigned long long ts = nowTS();
  Serial.printf("[%llu] ", ts);
}

bool sendPATCH(const String& path, const String& payload) {
  if (!wifiConnected) return false;
  HTTPClient http;
  http.setTimeout(5000);
  http.begin(String(DATABASE_URL) + path + ".json?auth=" + DATABASE_SECRET);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-HTTP-Method-Override", "PATCH");
  int code = http.PATCH(payload);
  http.end();
  return code == 200 || code == 204;
}

bool sendPUTInt64(const String& path, unsigned long long value) {
  if (!wifiConnected) return false;
  HTTPClient http;
  http.setTimeout(5000);
  http.begin(String(DATABASE_URL) + path + ".json?auth=" + DATABASE_SECRET);
  http.addHeader("Content-Type", "application/json");
  int code = http.PUT(String(value));
  http.end();
  return code == 200 || code == 204;
}

bool sendPUTJson(const String& path, const String& payload) {
  if (!wifiConnected) return false;
  HTTPClient http;
  http.setTimeout(5000);
  http.begin(String(DATABASE_URL) + path + ".json?auth=" + DATABASE_SECRET);
  http.addHeader("Content-Type", "application/json");
  int code = http.PUT(payload);
  http.end();
  return code == 200 || code == 204;
}

// ================= WIFI =================
void connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) {
    wifiConnected = true;
    return;
  }

  if (millis() - lastWiFiAttempt < WIFI_RECONNECT_INTERVAL) {
    return;
  }
  
  lastWiFiAttempt = millis();
  wifiConnected = false;

  printTimestamp();
  Serial.println("[WiFi] Attempting connection...");
  
  WiFi.disconnect(true);
  delay(1000);
  
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.persistent(false);
  WiFi.begin(WIFI_SSID, WIFI_PASS);

  unsigned long start = millis();
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && millis() - start < 15000) {
    delay(500);
    Serial.print(".");
    attempts++;
    if (attempts > 30) break;
  }

  if (WiFi.status() == WL_CONNECTED) {
    wifiConnected = true;
    printTimestamp();
    Serial.println("[WiFi] CONNECTED");
    Serial.print("[WiFi] IP: ");
    Serial.println(WiFi.localIP());
    Serial.print("[WiFi] RSSI: ");
    Serial.print(WiFi.RSSI());
    Serial.println(" dBm");
  } else {
    wifiConnected = false;
    printTimestamp();
    Serial.println("[WiFi] FAILED - Will retry in 30s");
    WiFi.disconnect(true);
  }
}

// ================= MOTOR CONTROL =================
void moveDown() { 
  digitalWrite(IN1, HIGH); 
  digitalWrite(IN2, LOW); 
  digitalWrite(ENA, HIGH);
  printTimestamp();
  Serial.println("[Motor] Moving DOWN");
}

void moveUp() { 
  digitalWrite(IN1, LOW);  
  digitalWrite(IN2, HIGH); 
  digitalWrite(ENA, HIGH);
  printTimestamp();
  Serial.println("[Motor] Moving UP");
}

void stopMotor() { 
  digitalWrite(ENA, LOW);
  printTimestamp();
  Serial.println("[Motor] STOP");
}

// ================= HEARTBEAT =================
void sendHeartbeat() {
  if (!wifiConnected) return;
  if (millis() - lastHeartbeat < HEARTBEAT_INTERVAL) return;

  unsigned long long currentTimeMs = nowTS();
  String path = "/devices/" DEVICE_ID "/heartbeat";
  if (sendPUTInt64(path, currentTimeMs)) {
    printTimestamp();
    Serial.printf("[HB] Sent: %llu\n", currentTimeMs);
  }

  lastHeartbeat = millis();
}

// ================= MOTOR COMMAND POLLING =================
void checkMotorCommand() {
  if (!wifiConnected) return;
  
  unsigned long now = millis();
  if (now < nextMotorPollAt) return;
  nextMotorPollAt = now + pollInterval;

  String path = "/devices/" DEVICE_ID "/commands/" NODE_ID "/motor";
  HTTPClient http;
  http.setTimeout(5000);
  http.begin(String(DATABASE_URL) + path + ".json?auth=" + DATABASE_SECRET);
  int code = http.GET();
  String response = "";
  if (code == 200) response = http.getString();
  http.end();

  if (code != 200 || response == "null" || response == "") return;

  StaticJsonDocument<512> doc;
  DeserializationError err = deserializeJson(doc, response);
  if (err) {
    Serial.println("[Motor] JSON error: " + String(err.c_str()));
    return;
  }

  if (String(doc["status"]) != "pending") return;
  if (String(doc["nodeId"]) != NODE_ID) return;

  unsigned long long requestedAt = doc["requestedAt"] | 0;
  if (requestedAt == lastMotorTS) return;
  lastMotorTS = requestedAt;

  String action = doc["action"] | "";
  printTimestamp();
  Serial.println("[Motor] Action: " + action);

  // ACKNOWLEDGE
  unsigned long long execTime = nowTS();
  StaticJsonDocument<256> ack;
  ack["status"] = "acknowledged";
  ack["acknowledgedAt"] = execTime;
  String ackPayload;
  serializeJson(ack, ackPayload);
  sendPATCH(path, ackPayload);

  // EXECUTE
  if (action == "up") moveUp();
  else if (action == "down") moveDown();
  delay(5000);
  stopMotor();

  // COMPLETE
  StaticJsonDocument<256> done;
  done["status"] = "completed";
  done["executedAt"] = nowTS();
  String donePayload;
  serializeJson(done, donePayload);
  sendPATCH(path, donePayload);
  printTimestamp();
  Serial.println("[Motor] Command completed");
}

// ================= GPS COMMAND POLLING =================
void checkGPSCommand() {
  if (!wifiConnected) return;
  
  unsigned long now = millis();
  if (now < nextGPSPollAt) return;
  nextGPSPollAt = now + pollInterval;

  String cmdPath = "/devices/" DEVICE_ID "/commands/" NODE_ID "/gps";
  String gpsPath = "/devices/" DEVICE_ID "/gps";
  
  HTTPClient http;
  http.setTimeout(5000);
  http.begin(String(DATABASE_URL) + cmdPath + ".json?auth=" + DATABASE_SECRET);
  int code = http.GET();
  String response = "";
  if (code == 200) response = http.getString();
  http.end();

  if (code != 200 || response == "null" || response == "") return;

  StaticJsonDocument<512> doc;
  DeserializationError err = deserializeJson(doc, response);
  if (err) {
    Serial.println("[GPS] JSON error: " + String(err.c_str()));
    return;
  }

  if (String(doc["status"]) != "pending") return;
  if (String(doc["nodeId"]) != NODE_ID) return;

  unsigned long long requestedAt = doc["requestedAt"] | 0;
  if (requestedAt == lastGPSTS) return;
  lastGPSTS = requestedAt;

  printTimestamp();
  Serial.println("[GPS] Command received - acquiring fix...");

  // ACKNOWLEDGE
  unsigned long long ackTime = nowTS();
  StaticJsonDocument<256> ack;
  ack["status"] = "acknowledged";
  ack["acknowledgedAt"] = ackTime;
  String ackPayload;
  serializeJson(ack, ackPayload);
  sendPATCH(cmdPath, ackPayload);

  // ATTEMPT GPS FIX
  unsigned long start = millis();
  bool fix = false;
  while (millis() - start < 60000) {
    while (gpsSerial.available()) gps.encode(gpsSerial.read());
    if (gps.location.isValid()) { 
      fix = true; 
      break; 
    }
    delay(100);
  }

  if (fix) {
    // PUBLISH GPS DATA
    printTimestamp();
    Serial.print("[GPS] Fix acquired: ");
    Serial.print(gps.location.lat(), 6);
    Serial.print(", ");
    Serial.println(gps.location.lng(), 6);
    
    StaticJsonDocument<256> gpsData;
    gpsData["status"] = "ok";
    gpsData["lat"] = gps.location.lat();
    gpsData["lng"] = gps.location.lng();
    gpsData["timestamp"] = nowTS();
    String gpsPayload;
    serializeJson(gpsData, gpsPayload);
    sendPUTJson(gpsPath, gpsPayload);

    // MARK COMMAND COMPLETED
    StaticJsonDocument<256> done;
    done["status"] = "completed";
    done["executedAt"] = nowTS();
    String donePayload;
    serializeJson(done, donePayload);
    sendPATCH(cmdPath, donePayload);
    printTimestamp();
    Serial.println("[GPS] Command completed");
  } else {
    // PUBLISH GPS ERROR - Clear stale coordinates
    printTimestamp();
    Serial.println("[GPS] Fix timeout - no signal");
    
    StaticJsonDocument<256> gpsError;
    gpsError["status"] = "error";
    gpsError["timestamp"] = nowTS();
    String errorPayload;
    serializeJson(gpsError, errorPayload);
    sendPUTJson(gpsPath, errorPayload);

    // MARK COMMAND AS ERROR
    StaticJsonDocument<256> cmdError;
    cmdError["status"] = "error";
    cmdError["error"] = "GPS timeout";
    cmdError["executedAt"] = nowTS();
    String cmdErrorPayload;
    serializeJson(cmdError, cmdErrorPayload);
    sendPATCH(cmdPath, cmdErrorPayload);
    printTimestamp();
    Serial.println("[GPS] Command failed - error published");
  }
}

// ================= SETUP =================
void setup() {
  Serial.begin(115200);
  delay(2000);
  
  Serial.println("\n\n========================================");
  Serial.println("  PadBuddy ESP32B - Motor + GPS Node");
  Serial.println("========================================\n");

  // Motor setup
  pinMode(IN1, OUTPUT);
  pinMode(IN2, OUTPUT);
  pinMode(ENA, OUTPUT);
  stopMotor();
  Serial.println("[Init] Motor pins configured");

  // GPS setup
  gpsSerial.begin(GPS_BAUD, SERIAL_8N1, GPS_RX, GPS_TX);
  Serial.println("[Init] GPS serial initialized");

  // WiFi setup
  connectWiFi();
  
  // NTP setup
  if (wifiConnected) {
    timeClient.begin();
    timeSynced = timeClient.forceUpdate();
    if (!timeSynced) Serial.println("[NTP] Fallback to millis()");
    else Serial.println("[NTP] Time synced");
  }

  Serial.println("\n[System] ESP32B READY\n");
}

// ================= LOOP =================
void loop() {
  // WiFi reconnection (throttled)
  connectWiFi();
  
  // NTP update
  if (wifiConnected && timeClient.update()) {
    timeSynced = true;
  }

  // Core operations
  sendHeartbeat();
  checkMotorCommand();
  checkGPSCommand();

  // Keep reading GPS data in background
  while (gpsSerial.available()) {
    gps.encode(gpsSerial.read());
  }
  
  delay(100);
}
