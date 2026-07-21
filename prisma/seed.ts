import { prisma } from "../src/lib/prisma";
import {
  addDays,
  dateAtUtcMidnight,
  londonWallTimeToUtc,
} from "../src/domain/time";
import { ensureSettings, nowInLondon, rebuildDayLedger } from "../src/lib/data";

async function main() {
  const alreadySeeded = await prisma.applicationSetting.findUnique({
    where: { key: "exampleSeedLoaded" },
  });
  if (alreadySeeded) {
    console.log("Example data has already been loaded.");
    return;
  }
  const settings = await ensureSettings();
  const today = nowInLondon().date;
  const jsDay = new Date(`${today}T00:00:00Z`).getUTCDay();
  const mondayOffset = jsDay === 0 ? -6 : 1 - jsDay;
  const monday = addDays(today, mondayOffset - 7);
  const recordedDates: string[] = [];
  for (let index = 0; index < 5; index += 1) {
    const date = addDays(monday, index);
    recordedDates.push(date);
    const intervals = [
      ["08:30", "12:30", "NORMAL_WORK"],
      ["12:30", "13:00", "LUNCH_BREAK"],
      ["13:00", "16:54", "NORMAL_WORK"],
    ] as const;
    for (const [start, end, type] of intervals) {
      const toMinutes = (time: string) =>
        Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
      await prisma.timeSegment.create({
        data: {
          localDate: dateAtUtcMidnight(date),
          startAt: londonWallTimeToUtc(date, toMinutes(start)),
          endAt: londonWallTimeToUtc(date, toMinutes(end)),
          type,
          note: "Optional example data",
        },
      });
    }
    await prisma.dailyCompletion.create({
      data: { localDate: dateAtUtcMidnight(date) },
    });
  }
  const medicalDate = addDays(monday, 2);
  await prisma.authorisedCredit.create({
    data: {
      localDate: dateAtUtcMidnight(medicalDate),
      durationMinutes: 45,
      startAt: londonWallTimeToUtc(medicalDate, 10 * 60 + 45),
      endAt: londonWallTimeToUtc(medicalDate, 11 * 60 + 30),
      type: "MEDICAL_APPOINTMENT",
      approvalStatus: "APPROVED",
      approvalDate: dateAtUtcMidnight(medicalDate),
      note: "Example authorised medical appointment",
    },
  });
  const leaveDate = addDays(monday, 7);
  recordedDates.push(leaveDate);
  await prisma.flexiLeave.create({
    data: {
      localDate: dateAtUtcMidnight(leaveDate),
      durationMinutes: settings.standardDayMinutes,
      kind: "FULL_DAY",
      approvalStatus: "APPROVED",
      approvalDate: dateAtUtcMidnight(leaveDate),
      note: "Example flexi leave day",
    },
  });
  const overtimeDate = addDays(monday, 4);
  await prisma.timeSegment.create({
    data: {
      localDate: dateAtUtcMidnight(overtimeDate),
      startAt: londonWallTimeToUtc(overtimeDate, 17 * 60),
      endAt: londonWallTimeToUtc(overtimeDate, 18 * 60),
      type: "OVERTIME",
      agreedNormalFinishMinutes: 17 * 60,
      approvalStatus: "APPROVED",
      approvalDate: dateAtUtcMidnight(overtimeDate),
      note: "Example overtime",
    },
  });
  await prisma.applicationSetting.create({
    data: { key: "exampleSeedLoaded", value: true },
  });
  for (const date of recordedDates) await rebuildDayLedger(date);
  console.log(`Loaded optional example data beginning ${monday}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
