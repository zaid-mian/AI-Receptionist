import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getDb } from "../db/database.js";
import { listAvailableSlots } from "../services/availability.js";
import { addDays, todayInTz } from "../db/database.js";
import { config } from "../config.js";

describe("Shift-Aware Availability Engine", () => {
  const db = getDb();

  it("rejects booking on past dates", () => {
    const res = listAvailableSlots(db, "svc_derm_nadia", "2020-01-01");
    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.equal(res.code, "past_date");
    }
  });

  it("rejects unknown service ids", () => {
    const today = todayInTz(config.businessTimezone);
    const futureDate = addDays(today, 2);
    const res = listAvailableSlots(db, "svc_non_existent_999", futureDate);
    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.equal(res.code, "invalid_service");
    }
  });

  it("returns doctor slots strictly within scheduled shift hours", () => {
    // Find next Monday
    const today = todayInTz(config.businessTimezone);
    let checkDate = addDays(today, 1);
    for (let i = 1; i <= 7; i++) {
      const d = addDays(today, i);
      const dayName = new Date(d + "T00:00:00Z").toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
      if (dayName === "Monday") {
        checkDate = d;
        break;
      }
    }

    const res = listAvailableSlots(db, "svc_derm_nadia", checkDate);
    assert.equal(res.ok, true, "Monday is an active shift for Dr. Nadia Ali");
    if (res.ok) {
      assert.ok(res.slots.length > 0, "Should generate OPD shift slots");
      // Dr Nadia Ali shift is 11:00 - 14:00 on Monday
      assert.equal(res.slots[0], "11:00");
      assert.ok(res.slots.includes("11:15"));
      assert.ok(res.slots.includes("13:45"));
      // Should not contain times outside shift
      assert.equal(res.slots.includes("14:00"), false);
      assert.equal(res.slots.includes("10:45"), false);
    }
  });

  it("correctly identifies doctor off-days (e.g. Sunday)", () => {
    const today = todayInTz(config.businessTimezone);
    let sundayDate = addDays(today, 1);
    for (let i = 1; i <= 7; i++) {
      const d = addDays(today, i);
      const dayName = new Date(d + "T00:00:00Z").toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
      if (dayName === "Sunday") {
        sundayDate = d;
        break;
      }
    }

    const res = listAvailableSlots(db, "svc_derm_nadia", sundayDate);
    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.equal(res.code, "doctor_not_sitting");
    }
  });
});
