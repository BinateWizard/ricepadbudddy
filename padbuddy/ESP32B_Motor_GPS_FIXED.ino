/*********************************************************************
 * PadBuddy ESP32B – Motor + GPS Node (HTTP REST API)
 * FIXED VERSION – Relay-style structure + Error handling
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

  Serial.println("\n[WiFi] Attempting connection...");
  
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
    Serial.println("\n[WiFi] CONNECTED");
    Serial.print("[WiFi] IP: ");
    Serial.println(WiFi.localIP());
    Serial.print("[WiFi] RSSI: ");
    Serial.print(WiFi.RSSI());
    Serial.println(" dBm");
  } else {
    wifiConnected = false;
    Serial.println("\n[WiFi] FAILED - Will retry in 30s");
    WiFi.disconnect(true);
  }
}

// ================= MOTOR CONTROL =================
void moveDown() { 
  digitalWrite(IN1, HIGH); 
  digitalWrite(IN2, LOW); 
  digitalWrite(ENA, HIGH);
  Serial.println("[Motor] Moving DOWN");
}

void moveUp() { 
  digitalWrite(IN1, LOW);  
  digitalWrite(IN2, HIGH); 
  digitalWrite(ENA, HIGH);
  Serial.println("[Motor] Moving UP");
}

void stopMotor() { 
  digitalWrite(ENA, LOW);
  Serial.println("[Motor] STOP");
}

void pollMotorCommand() {
  if (!wifiConnected) return;
  if (millis() - lastMotorPoll < COMMAND_POLL_INTERVAL) return;
  lastMotorPoll = millis();

  String payload = sendGET("/devices/" DEVICE_ID "/commands/" NODE_ID "/motor");
  if (payload == "" || payload == "null") return;

  StaticJsonDocument<256> doc;
  if (deserializeJson(doc, payload)) return;

  if (doc["status"] != "pending") return;

  unsigned long long ts = doc["requestedAt"];
  if (ts == lastMotorTS) return;
  lastMotorTS = ts;

  String action = doc["action"];
  Serial.print("[Motor] Command received: ");
  Serial.println(action);

  StaticJsonDocument<128> ack;
  ack["status"] = "acknowledged";
  ack["acknowledgedAt"] = nowTS();
  String j; serializeJson(ack, j);
  sendPATCH("/devices/" DEVICE_ID "/commands/" NODE_ID "/motor", j);

  if (action == "down") moveDown();
  else if (action == "up") moveUp();
  delay(5000);
  stopMotor();

  StaticJsonDocument<128> done;
  done["status"] = "completed";
  done["executedAt"] = nowTS();
  serializeJson(done, j);
  sendPATCH("/devices/" DEVICE_ID "/commands/" NODE_ID "/motor", j);
  Serial.println("[Motor] Command completed");
}

// ================= GPS =================
void pollGPSCommand() {
  if (!wifiConnected) return;
  if (millis() - lastGPSPoll < COMMAND_POLL_INTERVAL) return;
  lastGPSPoll = millis();

  String payload = sendGET("/devices/" DEVICE_ID "/commands/" NODE_ID "/gps");
  if (payload == "" || payload == "null") return;

  StaticJsonDocument<256> doc;
  if (deserializeJson(doc, payload)) return;

  if (doc["status"] != "pending") return;

  unsigned long long ts = doc["requestedAt"];
  if (ts == lastGPSTS) return;
  lastGPSTS = ts;

  Serial.println("[GPS] Command received - acquiring fix...");

  String cmdPath = "/devices/" DEVICE_ID "/commands/" NODE_ID "/gps";
  String gpsPath = "/devices/" DEVICE_ID "/gps";

  StaticJsonDocument<128> ack;
  ack["status"] = "acknowledged";
  ack["acknowledgedAt"] = nowTS();
  String j; serializeJson(ack, j);
  sendPATCH(cmdPath, j);

  unsigned long start = millis();
  bool fix = false;

  while (millis() - start < GPS_TIMEOUT) {
    while (gpsSerial.available()) gps.encode(gpsSerial.read());
    if (gps.location.isValid()) { 
      fix = true; 
      break; 
    }
    delay(100);
  }

  if (fix) {
    Serial.print("[GPS] Fix acquired: ");
    Serial.print(gps.location.lat(), 6);
    Serial.print(", ");
    Serial.println(gps.location.lng(), 6);
    
    StaticJsonDocument<256> ok;
    ok["status"] = "ok";
    ok["lat"] = gps.location.lat();
    ok["lng"] = gps.location.lng();
    ok["timestamp"] = nowTS();
    serializeJson(ok, j);
    sendPATCH(gpsPath, j);

    StaticJsonDocument<128> done;
    done["status"] = "completed";
    done["executedAt"] = nowTS();
    serializeJson(done, j);
    sendPATCH(cmdPath, j);
  } else {
    Serial.println("[GPS] Fix timeout - no signal");
    
    StaticJsonDocument<256> err;
    err["status"] = "error";
    err["message"] = "GPS fix timeout";
    err["reason"] = "No valid GPS signal";
    err["timestamp"] = nowTS();
    serializeJson(err, j);
    sendPATCH(gpsPath, j);

    StaticJsonDocument<128> cmdErr;
    cmdErr["status"] = "error";
    cmdErr["error"] = "GPS timeout";
    cmdErr["executedAt"] = nowTS();
    serializeJson(cmdErr, j);
    sendPATCH(cmdPath, j);
  }
}

// ================= SETUP / LOOP =================
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
    timeClient.update();
    Serial.println("[Init] NTP client started");
  }

  Serial.println("\n[System] ESP32B READY\n");
}

void loop() {
  // Check WiFi status and reconnect if needed (with throttling)
  connectWiFi();
  
  // Update NTP time if connected
  if (wifiConnected) {
    timeClient.update();
  }

  // Execute operations only if connected
  sendHeartbeat();
  pollMotorCommand();
  pollGPSCommand();

  // Keep reading GPS data
  while (gpsSerial.available()) {
    gps.encode(gpsSerial.read());
  }
  
  delay(100);
}
