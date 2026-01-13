"use client";

import { useState } from "react";

export default function SchedulesPage() {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    fieldId: "",
    deviceId: "",
    time: "",
    ampm: "AM",
    description: ""
  });

  // Converts 12-hour to 24-hour format
  function to24Hour(time: string, ampm: string) {
    let [h, m] = time.split(":");
    let hour = parseInt(h);
    if (ampm === "PM" && hour < 12) hour += 12;
    if (ampm === "AM" && hour === 12) hour = 0;
    return `${hour.toString().padStart(2, "0")}:${m}`;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const schedule = {
      ...form,
      time24: to24Hour(form.time, form.ampm),
    };
    // TODO: send schedule to Firestore
    alert(`Schedule saved: ${JSON.stringify(schedule)}`);
    setShowForm(false);
  }

  return (
    <div className="p-6 max-w-xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Schedules</h1>
      <button
        className="mb-4 px-4 py-2 bg-blue-600 text-white rounded"
        onClick={() => setShowForm(true)}
      >
        Add Schedule
      </button>
      {showForm && (
        <form className="bg-white p-4 rounded shadow" onSubmit={handleSubmit}>
          <div className="mb-2">
            <label className="block mb-1 font-medium">Field ID</label>
            <input
              className="border px-2 py-1 rounded w-full"
              value={form.fieldId}
              onChange={e => setForm(f => ({ ...f, fieldId: e.target.value }))}
              required
            />
          </div>
          <div className="mb-2">
            <label className="block mb-1 font-medium">Device ID</label>
            <input
              className="border px-2 py-1 rounded w-full"
              value={form.deviceId}
              onChange={e => setForm(f => ({ ...f, deviceId: e.target.value }))}
              required
            />
          </div>
          <div className="mb-2 flex gap-2 items-center">
            <label className="block font-medium">Time</label>
            <input
              type="text"
              pattern="^(0[1-9]|1[0-2]):[0-5][0-9]$"
              placeholder="hh:mm"
              className="border px-2 py-1 rounded w-24"
              value={form.time}
              onChange={e => setForm(f => ({ ...f, time: e.target.value }))}
              required
            />
            <select
              className="border px-2 py-1 rounded"
              value={form.ampm}
              onChange={e => setForm(f => ({ ...f, ampm: e.target.value }))}
            >
              <option value="AM">AM</option>
              <option value="PM">PM</option>
            </select>
          </div>
          <div className="mb-2">
            <label className="block mb-1 font-medium">Description</label>
            <input
              className="border px-2 py-1 rounded w-full"
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            />
          </div>
          <button className="mt-2 px-4 py-2 bg-green-600 text-white rounded" type="submit">
            Save
          </button>
          <button
            className="mt-2 ml-2 px-4 py-2 bg-gray-300 text-gray-700 rounded"
            type="button"
            onClick={() => setShowForm(false)}
          >
            Cancel
          </button>
        </form>
      )}
      {/* TODO: List schedules here */}
    </div>
  );
}
