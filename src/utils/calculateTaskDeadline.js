/**
 * src/utils/calculateTaskDeadline.js
 *
 * Calculates a task deadline based on company working hours.
 * Skips: non-working days, holidays, break times.
 *
 * Usage:
 *   import { calculateTaskDeadline } from "../utils/calculateTaskDeadline.js";
 *   const deadline = calculateTaskDeadline(new Date(), 60, companyDoc);
 */

function parseTime(timeStr) {
  const [hours, minutes] = timeStr.split(":").map(Number);
  return { hours, minutes };
}

function getDayName(date) {
  return ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"][date.getDay()];
}

function isHoliday(date, holidays = []) {
  return holidays.some(h => {
    const hd = new Date(h.date);
    return (
      hd.getFullYear() === date.getFullYear() &&
      hd.getMonth()    === date.getMonth()    &&
      hd.getDate()     === date.getDate()
    );
  });
}

function getScheduleForDate(date, workingHours, holidays) {
  if (isHoliday(date, holidays)) return null;
  const dayName  = getDayName(date);
  const schedule = workingHours.find(wh => wh.day === dayName);
  if (!schedule || !schedule.isWorking) return null;
  return schedule;
}

export function calculateTaskDeadline(startDateTime, requiredHours, company) {
  const { workingHours = [], holidays = [] } = company;
  let remainingMinutes = requiredHours * 60;
  let current = new Date(startDateTime);
  let safety  = 0; // prevent infinite loop

  while (remainingMinutes > 0 && safety < 365) {
    const schedule = getScheduleForDate(current, workingHours, holidays);

    // Not a working day — move to next day
    if (!schedule) {
      current.setDate(current.getDate() + 1);
      current.setHours(0, 0, 0, 0);
      safety++;
      continue;
    }

    const dayStart    = parseTime(schedule.startTime);
    const dayEnd      = parseTime(schedule.endTime);
    const dayStartMin = dayStart.hours * 60 + dayStart.minutes;
    const dayEndMin   = dayEnd.hours   * 60 + dayEnd.minutes;
    const currentMin  = current.getHours() * 60 + current.getMinutes();

    // Before work starts — jump to start
    if (currentMin < dayStartMin) {
      current.setHours(dayStart.hours, dayStart.minutes, 0, 0);
    }

    // After work ends — move to next day
    if (current.getHours() * 60 + current.getMinutes() >= dayEndMin) {
      current.setDate(current.getDate() + 1);
      current.setHours(0, 0, 0, 0);
      safety++;
      continue;
    }

    const nowMin = current.getHours() * 60 + current.getMinutes();

    // Available working minutes from now to end of day (minus breaks)
    let available = dayEndMin - nowMin;
    for (const b of schedule.breaks || []) {
      const bS  = parseTime(b.startTime);
      const bE  = parseTime(b.endTime);
      const bSm = bS.hours * 60 + bS.minutes;
      const bEm = bE.hours * 60 + bE.minutes;
      if (bEm <= nowMin) continue; // break already passed
      const oStart = Math.max(bSm, nowMin);
      const oEnd   = Math.min(bEm, dayEndMin);
      if (oEnd > oStart) available -= (oEnd - oStart);
    }
    available = Math.max(0, available);

    if (remainingMinutes <= available) {
      // Task finishes today — find exact time skipping breaks
      let add    = remainingMinutes;
      let cursor = nowMin;
      for (const b of schedule.breaks || []) {
        const bS  = parseTime(b.startTime);
        const bE  = parseTime(b.endTime);
        const bSm = bS.hours * 60 + bS.minutes;
        const bEm = bE.hours * 60 + bE.minutes;
        if (bEm <= cursor) continue;
        const oStart = Math.max(bSm, cursor);
        if (oStart < cursor + add) {
          add += bEm - oStart; // skip the break duration
        }
      }
      current = new Date(current.getTime() + add * 60 * 1000);
      remainingMinutes = 0;
    } else {
      // Use up rest of today, move to next day
      remainingMinutes -= available;
      current.setDate(current.getDate() + 1);
      current.setHours(0, 0, 0, 0);
    }

    safety++;
  }

  return current;
}