import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import * as twilio from "twilio";

admin.initializeApp();

// Initialize Twilio client using environment variables
const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID || functions.config().twilio?.account_sid;
const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN || functions.config().twilio?.auth_token;
const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER || functions.config().twilio?.phone_number;

const twilioClient = twilio.default(twilioAccountSid, twilioAuthToken);

/**
 * Send SMS notification using Twilio
 * Callable function that can be invoked from client-side
 */
export const sendSmsNotification = functions.https.onCall(
  async (data, context) => {
    // Check if user is authenticated
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "User must be authenticated to send SMS"
      );
    }

    const {phoneNumber, message} = data;

    // Validate input
    if (!phoneNumber || !message) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Phone number and message are required"
      );
    }

    try {
      // Send SMS via Twilio
      const result = await twilioClient.messages.create({
        body: message,
        from: twilioPhoneNumber,
        to: phoneNumber,
      });

      console.log("SMS sent successfully:", result.sid);

      return {
        success: true,
        messageSid: result.sid,
        status: result.status,
      };
    } catch (error) {
      console.error("Error sending SMS:", error);
      throw new functions.https.HttpsError(
        "internal",
        "Failed to send SMS notification"
      );
    }
  }
);

/**
 * Send notification when sensor readings trigger an alert
 * Triggered by Realtime Database changes
 */
export const sendSensorAlertSms = functions.database
  .ref("/devices/{deviceId}/sensors/{sensorType}")
  .onUpdate(async (change, context) => {
    const {deviceId, sensorType} = context.params;
    const newValue = change.after.val();

    // Get device info to find associated field and user
    const deviceSnapshot = await admin
      .database()
      .ref(`/devices/${deviceId}`)
      .once("value");
    const device = deviceSnapshot.val();

    if (!device || !device.fieldId) {
      console.log("Device not found or not associated with a field");
      return null;
    }

    // Get field info
    const fieldSnapshot = await admin
      .firestore()
      .collection("fields")
      .doc(device.fieldId)
      .get();

    if (!fieldSnapshot.exists) {
      console.log("Field not found");
      return null;
    }

    const field = fieldSnapshot.data();
    const userId = field?.userId;

    if (!userId) {
      console.log("No user associated with field");
      return null;
    }

    // Get user's phone number
    const userSnapshot = await admin
      .firestore()
      .collection("users")
      .doc(userId)
      .get();

    const user = userSnapshot.data();
    const phoneNumber = user?.phoneNumber;

    if (!phoneNumber) {
      console.log("User has no phone number");
      return null;
    }

    // Check if alert conditions are met (customize based on your needs)
    let alertMessage = "";

    if (sensorType === "soilMoisture" && newValue < 30) {
      alertMessage = `🌾 PadBuddy Alert: Low soil moisture (${newValue}%) detected in field "${field.name}". Consider irrigation.`;
    } else if (sensorType === "temperature" && newValue > 35) {
      alertMessage = `🌾 PadBuddy Alert: High temperature (${newValue}°C) detected in field "${field.name}". Monitor your crop closely.`;
    } else if (sensorType === "ph" && (newValue < 5.5 || newValue > 7.0)) {
      alertMessage = `🌾 PadBuddy Alert: pH level (${newValue}) is outside optimal range in field "${field.name}".`;
    }

    // Only send if there's an alert message
    if (alertMessage) {
      try {
        const result = await twilioClient.messages.create({
          body: alertMessage,
          from: twilioPhoneNumber,
          to: phoneNumber,
        });

        console.log("Alert SMS sent:", result.sid);

        // Log the notification in Firestore
        await admin.firestore().collection("notifications").add({
          userId,
          fieldId: device.fieldId,
          deviceId,
          type: "sensor_alert",
          sensorType,
          message: alertMessage,
          value: newValue,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          sentViaSms: true,
          smsSid: result.sid,
        });

        return {success: true, messageSid: result.sid};
      } catch (error) {
        console.error("Error sending alert SMS:", error);
        return {success: false, error: String(error)};
      }
    }

    return null;
  });

/**
 * Send SMS for growth stage transitions
 * Triggered by Firestore field updates
 */
export const sendStageTransitionSms = functions.firestore
  .document("fields/{fieldId}")
  .onUpdate(async (change, context) => {
    const {fieldId} = context.params;
    const newData = change.after.data();
    const oldData = change.before.data();

    // Check if growth stage changed
    if (newData.currentStage !== oldData.currentStage) {
      const userId = newData.userId;

      if (!userId) return null;

      // Get user's phone number
      const userSnapshot = await admin
        .firestore()
        .collection("users")
        .doc(userId)
        .get();

      const user = userSnapshot.data();
      const phoneNumber = user?.phoneNumber;

      if (!phoneNumber) {
        console.log("User has no phone number");
        return null;
      }

      const message = `🌾 PadBuddy: Your field "${newData.name}" has entered the ${newData.currentStage} stage. Check your dashboard for specific care recommendations.`;

      try {
        const result = await twilioClient.messages.create({
          body: message,
          from: twilioPhoneNumber,
          to: phoneNumber,
        });

        console.log("Stage transition SMS sent:", result.sid);

        // Log notification
        await admin.firestore().collection("notifications").add({
          userId,
          fieldId,
          type: "stage_transition",
          stage: newData.currentStage,
          message,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          sentViaSms: true,
          smsSid: result.sid,
        });

        return {success: true, messageSid: result.sid};
      } catch (error) {
        console.error("Error sending stage transition SMS:", error);
        return {success: false, error: String(error)};
      }
    }

    return null;
  });

/**
 * Send daily summary SMS (can be scheduled using Cloud Scheduler)
 */
export const sendDailySummary = functions.pubsub
  .schedule("0 8 * * *") // Every day at 8 AM
  .timeZone("Asia/Manila") // Adjust to your timezone
  .onRun(async (context) => {
    console.log("Running daily summary task");

    // Get all active users with phone numbers
    const usersSnapshot = await admin
      .firestore()
      .collection("users")
      .where("phoneNumber", "!=", null)
      .where("smsNotifications", "==", true)
      .get();

    const sendPromises: Promise<any>[] = [];

    for (const userDoc of usersSnapshot.docs) {
      const user = userDoc.data();
      const userId = userDoc.id;

      // Get user's active fields
      const fieldsSnapshot = await admin
        .firestore()
        .collection("fields")
        .where("userId", "==", userId)
        .where("status", "==", "active")
        .get();

      if (fieldsSnapshot.empty) continue;

      const fieldCount = fieldsSnapshot.size;
      const message = `🌾 PadBuddy Daily Summary: You have ${fieldCount} active field(s). Check your dashboard for today's recommendations and sensor readings.`;

      const sendPromise = twilioClient.messages
        .create({
          body: message,
          from: twilioPhoneNumber,
          to: user.phoneNumber,
        })
        .then((result) => {
          console.log(`Daily summary sent to ${userId}:`, result.sid);
          return result;
        })
        .catch((error) => {
          console.error(`Error sending daily summary to ${userId}:`, error);
          return null;
        });

      sendPromises.push(sendPromise);
    }

    await Promise.all(sendPromises);
    console.log("Daily summary task completed");
    return null;
  });
