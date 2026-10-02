import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getDb, addDays, todayInTz } from "../db/database.js";
import { config } from "../config.js";
import { TOOLS, ToolContext } from "../tools/tools.js";
import { listAvailableSlots } from "../services/availability.js";

describe("Hospital Agent Tools Execution", () => {
  const db = getDb();
  const ctx: ToolContext = {
    db,
    conversationId: "conv_test_tools_001",
    channel: "chat",
  };

  it("get_departments returns all 10 clinical hospital units", () => {
    const res = TOOLS.get_departments.execute(ctx, {});
    assert.equal(res.success, true);
    const data = res.data as { count: number; departments: Array<{ id: string; name: string }> };
    assert.ok(data.count >= 10, "Should have at least 10 departments");
    assert.ok(data.departments.some((d) => d.name.includes("Cardiology")));
    assert.ok(data.departments.some((d) => d.name.includes("Dermatology")));
  });

  it("get_doctor_schedules returns weekly shift roster for specialist", () => {
    const res = TOOLS.get_doctor_schedules.execute(ctx, { doctor_name: "Nadia" });
    assert.equal(res.success, true);
    const data = res.data as { doctors: Array<{ name: string; schedules: Array<{ day: string; hours: string }> }> };
    assert.ok(data.doctors.length > 0, "Should find matching doctor");
    assert.ok(data.doctors[0].name.includes("Nadia"));
    assert.ok(data.doctors[0].schedules.length >= 6, "Dr. Nadia sits Mon-Sat");
  });

  it("check_availability checks open slots for doctor on valid shift day", () => {
    const today = todayInTz(config.businessTimezone);
    let checkDate = addDays(today, 1);
    for (let i = 1; i <= 7; i++) {
      const d = addDays(today, i);
      const dayName = new Date(d + "T00:00:00Z").toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
      if (dayName === "Wednesday") {
        checkDate = d;
        break;
      }
    }

    const res = TOOLS.check_availability.execute(ctx, {
      service_id: "svc_derm_nadia",
      date: checkDate,
    });
    assert.equal(res.success, true);
    const data = res.data as { slots: string[]; weekday: string };
    assert.ok(Array.isArray(data.slots) && data.slots.length > 0);
  });

  it("book_appointment creates confirmed booking and prevents double-booking", () => {
    const today = todayInTz(config.businessTimezone);
    let bookDate = addDays(today, 2);
    for (let i = 2; i <= 9; i++) {
      const d = addDays(today, i);
      const dayName = new Date(d + "T00:00:00Z").toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
      if (dayName === "Thursday") {
        bookDate = d;
        break;
      }
    }

    const avail = listAvailableSlots(db, "svc_derm_nadia", bookDate);
    assert.equal(avail.ok, true);
    assert.ok(avail.slots.length > 0, "Must have open slots on Thursday");
    const targetSlot = avail.slots[0];

    // Step 1: Book appointment for targetSlot
    const res1 = TOOLS.book_appointment.execute(ctx, {
      service_id: "svc_derm_nadia",
      date: bookDate,
      time: targetSlot,
      customer_name: "Tariq Mahmood Test",
      phone: "+923001234567",
      email: "tariq@test.pk",
    });

    assert.equal(res1.success, true, "First booking should succeed");
    const data1 = res1.data as { appointment_id: string; status: string; customer: string };
    assert.ok(data1.appointment_id.startsWith("APT-"), "Appointment ID should start with APT-");
    assert.equal(data1.status, "confirmed");

    // Step 2: Attempt duplicate booking on the exact same doctor, date, and slot
    const res2 = TOOLS.book_appointment.execute(ctx, {
      service_id: "svc_derm_nadia",
      date: bookDate,
      time: targetSlot,
      customer_name: "Another Patient",
      phone: "+923007654321",
    });

    assert.equal(res2.success, false, "Duplicate booking on occupied slot must fail");
    assert.equal(res2.error?.code, "slot_taken", "Should return slot_taken error code");
  });
});
