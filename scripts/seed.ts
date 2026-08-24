/**
 * Demo seed.
 *
 * Produces a society that looks like it has been running for two months: a
 * realistic spread of categories, a believable resolution rate, complaints at
 * every lifecycle stage, some genuinely overdue, and audit trails that read
 * like real operational history rather than generated filler.
 *
 * Deterministic by design — a seeded PRNG, and all timestamps derived from a
 * fixed "now" — so every run produces the same dataset and a screenshot taken
 * today matches one taken next week.
 *
 *   npm run db:seed
 */
import { randomUUID } from 'node:crypto';

import bcrypt from 'bcryptjs';
import { config } from 'dotenv';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import * as schema from '../src/server/db/schema';

config({ path: '.env' });

const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DIRECT_URL or DATABASE_URL must be set.');
  process.exit(1);
}

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'admin@greenwoodheights.in';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'Admin@12345';
const RESIDENT_PASSWORD = process.env.SEED_RESIDENT_PASSWORD ?? 'Resident@12345';

const isLocal = connectionString.includes('localhost') || connectionString.includes('127.0.0.1');

// ---------------------------------------------------------------------------
// Deterministic randomness (mulberry32)
// ---------------------------------------------------------------------------

function createRng(seed: number) {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = createRng(20260824);
const pick = <T>(items: readonly T[]): T => items[Math.floor(rng() * items.length)]!;
const chance = (probability: number) => rng() < probability;

const NOW = new Date();
const hoursAgo = (hours: number) => new Date(NOW.getTime() - hours * 3600_000);
const daysAgo = (days: number) => hoursAgo(days * 24);

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

const RESIDENTS = [
  { name: 'Ananya Iyer', flat: 'A-402', phone: '+91 98450 11234' },
  { name: 'Rohit Deshmukh', flat: 'B-1104', phone: '+91 99870 22145' },
  { name: 'Fatima Sheikh', flat: 'C-208', phone: '+91 98201 33456' },
  { name: 'Karthik Reddy', flat: 'A-1507', phone: '+91 91760 44521' },
  { name: 'Meera Nair', flat: 'D-301', phone: '+91 94470 55632' },
  { name: 'Sandeep Grewal', flat: 'B-706', phone: '+91 98110 66743' },
  { name: 'Priya Venkatesh', flat: 'C-903', phone: '+91 89390 77854' },
  { name: 'Imran Qureshi', flat: 'D-1202', phone: '+91 90040 88965' },
  { name: 'Lakshmi Subramanian', flat: 'A-605', phone: '+91 97410 99076' },
  { name: 'Vikram Choudhary', flat: 'B-1801', phone: '+91 93130 10187' },
  { name: 'Neha Bhatt', flat: 'C-504', phone: '+91 99300 21298' },
  { name: 'Arjun Pillai', flat: 'D-807', phone: '+91 95000 32309' },
] as const;

const ADMINS = [
  { name: 'Suresh Menon', flat: 'Society Office', email: ADMIN_EMAIL, phone: '+91 80 4567 1200' },
  {
    name: 'Rajeshwari Patil',
    flat: 'Society Office',
    email: 'facilities@greenwoodheights.in',
    phone: '+91 80 4567 1201',
  },
] as const;

function emailFor(name: string): string {
  const [first = 'resident', last = ''] = name.toLowerCase().split(' ');
  return `${first}.${last}`.replace(/[^a-z.]/g, '') + '@greenwoodheights.in';
}

// ---------------------------------------------------------------------------
// Complaint templates — written as a resident would actually write them.
// ---------------------------------------------------------------------------

type Category = schema.ComplaintCategory;

interface Template {
  category: Category;
  title: string;
  description: string;
}

const TEMPLATES: Template[] = [
  {
    category: 'WATER_SUPPLY',
    title: 'No water supply in the morning hours',
    description:
      'There has been no water in our flat between 6 AM and 9 AM for the last four days. The overhead tank for B wing seems to be running dry before the morning slot ends. Several neighbours on the 11th floor have the same problem. Requesting the committee to check the pump timing and the tanker schedule.',
  },
  {
    category: 'ELEVATOR',
    title: 'Lift 2 stops between floors and doors jam',
    description:
      'The second lift in A wing has stopped twice this week between the 9th and 10th floors. The doors took nearly a minute to open and the emergency intercom did not connect to the security desk. This is a safety issue, especially for senior residents. Please have the AMC vendor inspect it urgently.',
  },
  {
    category: 'PLUMBING',
    title: 'Seepage on bedroom ceiling from flat above',
    description:
      'There is visible water seepage on the master bedroom ceiling, directly below the bathroom of the flat above ours. The patch has grown from about six inches to nearly two feet over the past fortnight and the paint has started peeling. I have spoken to the upstairs neighbour who is willing to allow access for inspection.',
  },
  {
    category: 'ELECTRICAL',
    title: 'Corridor lights not working on 5th floor',
    description:
      'The corridor lights between flats 501 and 508 have been out for over a week. Only the emergency light near the staircase is working, so the passage is quite dark after 7 PM. Two of the tube fittings appear to be completely dead rather than just needing bulbs.',
  },
  {
    category: 'SECURITY',
    title: 'Main gate intercom not connecting to flat',
    description:
      'The intercom from the main gate has not been connecting to our flat for the past ten days. Delivery staff and visitors are being sent up without verification because the guard cannot reach us. This defeats the purpose of the visitor management system. Please get the intercom line checked.',
  },
  {
    category: 'CLEANING',
    title: 'Garbage not collected from C wing for three days',
    description:
      'Wet waste from the C wing collection point has not been cleared since Monday. The bins are overflowing into the service corridor and there is a strong smell reaching the lower floors. It is also attracting stray dogs near the service entrance.',
  },
  {
    category: 'PARKING',
    title: 'Visitor cars occupying allotted parking slot',
    description:
      'My allotted slot D-807 has been occupied by visitor vehicles on four separate occasions this month. The security staff say they are unable to identify whose guests they are. Requesting either enforcement of the visitor parking zone or clearer slot markings.',
  },
  {
    category: 'NOISE',
    title: 'Late night construction noise from renovation',
    description:
      'Interior renovation work in a flat on our floor has been continuing past 11 PM on weekdays, including drilling and tile cutting. Society rules specify work hours until 6 PM. We have young children and this has been going on for over two weeks.',
  },
  {
    category: 'COMMON_AREA',
    title: 'Children play area swing is broken and unsafe',
    description:
      'One of the two swings in the children play area has a broken chain link and the seat hangs at an angle. Children are still using it because it has not been cordoned off. Requesting immediate barricading and repair before someone is injured.',
  },
  {
    category: 'PEST_CONTROL',
    title: 'Mosquito breeding near the STP area',
    description:
      'There is significant stagnant water collecting near the STP and the adjoining drain has not been cleared. Mosquito activity in the ground floor flats and the podium garden has increased sharply. The last fogging appears to have been over two months ago.',
  },
  {
    category: 'ELECTRICAL',
    title: 'Frequent power trips in D wing since last week',
    description:
      'The D wing has experienced repeated MCB trips, roughly three to four times a day, mostly in the evening. The backup generator kicks in but the transition is not smooth and it has already affected our refrigerator. An electrician should check the wing distribution board load.',
  },
  {
    category: 'PLUMBING',
    title: 'Kitchen sink drain blocked and overflowing',
    description:
      'The kitchen sink has been draining very slowly for a week and now backs up completely when the washing machine discharges. It appears to be a blockage in the common stack rather than in our line, as the neighbour below reports a similar issue.',
  },
  {
    category: 'WATER_SUPPLY',
    title: 'Brown water from taps after tanker refill',
    description:
      'Every time a water tanker refills the underground tank, the water from our taps runs brown and gritty for two to three hours. It settles eventually but leaves sediment. Requesting a water quality test and cleaning of the underground sump.',
  },
  {
    category: 'CLEANING',
    title: 'Staircase landings not being swept regularly',
    description:
      'The staircase landings between the 3rd and 7th floors of C wing have not been swept properly for a couple of weeks. There is accumulated dust, food wrappers and leaves. The housekeeping roster on the notice board says these should be cleaned on alternate days.',
  },
  {
    category: 'COMMON_AREA',
    title: 'Clubhouse air conditioning not cooling',
    description:
      'The air conditioning in the clubhouse hall has not been cooling for the past two weeks. The unit runs but blows warm air. Several residents have booked the hall for functions this month and this needs servicing before then.',
  },
  {
    category: 'SECURITY',
    title: 'CCTV camera at basement entry not recording',
    description:
      'I was told during a parking dispute that the basement entry camera footage was unavailable for the past month. If that camera has been non-functional, it is a significant gap given the vehicle movement through that entrance. Requesting an audit of all CCTV units.',
  },
  {
    category: 'OTHER',
    title: 'Society mobile app not reflecting maintenance dues',
    description:
      'The maintenance payment I made on the 3rd via NEFT has still not been reflected against my account and the app continues to show it as pending with a late fee. I have the transaction reference and can share it with the accounts desk.',
  },
  {
    category: 'ELEVATOR',
    title: 'Lift floor indicator display not working in C wing',
    description:
      'The digital floor indicator inside the C wing lift has been blank for about three weeks. The lift itself functions normally but without the display it is difficult to know which floor you are on, particularly for elderly residents and visitors.',
  },
];

const ADMIN_NOTES = {
  toInProgress: [
    'Assigned to the in-house maintenance team. Inspection scheduled for tomorrow morning.',
    'Vendor has been contacted and a site visit is arranged for this week.',
    'Acknowledged. Raising a work order with the AMC contractor today.',
    'Our plumber will visit between 10 AM and 12 PM. Please ensure someone is available at the flat.',
    'Escalated to the facility manager. Parts have been ordered and should arrive in two days.',
  ],
  toResolved: [
    'Work completed and verified on site. Please reopen a fresh complaint if the issue recurs.',
    'Repair done by the vendor and inspected by the facility manager. Closing this complaint.',
    'Issue resolved. The replacement part has been fitted and tested.',
    'Cleared by the housekeeping supervisor. Roster has been revised to prevent a repeat.',
    'Completed. We have also scheduled a preventive check next month to avoid recurrence.',
  ],
  priority: [
    'Raised to high priority — this is a safety concern.',
    'Multiple residents affected; moving this up the queue.',
    'Lowering priority as a temporary workaround is in place.',
    'Set to high after the site inspection report.',
  ],
} as const;

const NOTICES = [
  {
    title: 'Annual General Body Meeting — Sunday, 14th at 10:00 AM',
    body: 'The Annual General Body Meeting will be held in the clubhouse hall this Sunday at 10:00 AM. The agenda covers the audited accounts for the financial year, the revised maintenance charges proposal, the lift modernisation quotation for A and B wings, and the election of two managing committee members.\n\nQuorum is mandatory. If you are unable to attend in person, please submit a signed proxy form at the society office by Saturday 6:00 PM. The agenda pack and last year\'s minutes have been circulated by email.',
    isImportant: true,
    daysAgo: 2,
  },
  {
    title: 'Water tanker schedule revised from Monday',
    body: 'Following the reduced Cauvery supply this week, tanker deliveries have been rescheduled. A and B wings will receive supply between 6:00 AM and 8:30 AM, and C and D wings between 5:00 PM and 7:30 PM.\n\nResidents are requested to store water for essential use and avoid using hoses for vehicle washing until the supply normalises. The borewell recharge work is expected to complete by the end of the month.',
    isImportant: true,
    daysAgo: 6,
  },
  {
    title: 'Lift modernisation work in A wing — 18th to 22nd',
    body: 'Lift 1 in A wing will be out of service from the 18th to the 22nd for modernisation of the control panel and door mechanism. Lift 2 will remain operational throughout.\n\nWe request residents on higher floors to plan for slightly longer waiting times. Movers and heavy deliveries should be scheduled outside this window. The vendor will work from 9:00 AM to 6:00 PM daily.',
    isImportant: false,
    daysAgo: 9,
  },
  {
    title: 'Diwali celebrations and fire safety guidelines',
    body: 'The society Diwali celebration will be held in the podium garden on the evening of the festival, starting at 6:30 PM with a rangoli competition for children.\n\nFor everyone\'s safety, firecrackers are permitted only in the designated open area near the east gate, between 6:00 PM and 10:00 PM. Please do not burst crackers in corridors, balconies, the basement or near parked vehicles. Fire extinguishers and a first-aid station will be available near the clubhouse.',
    isImportant: false,
    daysAgo: 14,
  },
  {
    title: 'Housekeeping roster updated for all wings',
    body: 'The revised housekeeping roster is now in effect. Staircase landings and corridors will be swept daily before 9:00 AM, and mopped on alternate days. Basement sweeping moves to twice weekly on Tuesdays and Fridays.\n\nThe supervisor\'s contact number is displayed at each wing entrance. Please report any lapse directly through the maintenance tracker so it can be logged and followed up.',
    isImportant: false,
    daysAgo: 18,
  },
  {
    title: 'Pest control drive — all wings, first week of next month',
    body: 'A society-wide pest control drive covering common areas, basements, the STP surroundings and the garbage collection points is scheduled for the first week of next month.\n\nResidents who wish to have their flats treated as part of the same drive may register at the society office by the 28th. The treatment is chemical-based; households with infants, elderly members or pets should inform the team in advance.',
    isImportant: false,
    daysAgo: 24,
  },
  {
    title: 'Reminder: vehicle stickers mandatory from next month',
    body: 'All resident vehicles must display the new RFID parking sticker from the 1st. Vehicles without a valid sticker will not be permitted into the basement and will be directed to visitor parking.\n\nStickers are being issued at the society office against a copy of the RC book and the allotment letter. The office is open on weekdays from 10:00 AM to 1:00 PM and 4:00 PM to 7:00 PM.',
    isImportant: true,
    daysAgo: 30,
  },
];

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------

async function main() {
  const pool = new Pool({
    connectionString,
    max: 1,
    ssl: isLocal ? undefined : { rejectUnauthorized: false },
  });
  const db = drizzle(pool, { schema, casing: 'snake_case' });

  console.info('[seed] clearing existing demo data …');
  // complaint_events is append-only by trigger, so a plain DELETE is refused.
  // Disabling the trigger for the length of a wipe is the deliberate,
  // explicit act the audit design intends it to be.
  await pool.query('ALTER TABLE complaint_events DISABLE TRIGGER complaint_events_no_delete');
  await pool.query(
    'TRUNCATE complaint_events, email_outbox, complaints, notices, sessions, users RESTART IDENTITY CASCADE',
  );
  await pool.query('ALTER TABLE complaint_events ENABLE TRIGGER complaint_events_no_delete');
  await pool.query('ALTER SEQUENCE complaint_reference_seq RESTART WITH 1');
  await pool.query(
    `INSERT INTO app_settings (id, society_name, overdue_threshold_days)
     VALUES (1, 'Greenwood Heights', 7)
     ON CONFLICT (id) DO UPDATE SET society_name = EXCLUDED.society_name,
                                    overdue_threshold_days = EXCLUDED.overdue_threshold_days`,
  );

  console.info('[seed] creating users …');
  const adminHash = await bcrypt.hash(ADMIN_PASSWORD, 12);
  const residentHash = await bcrypt.hash(RESIDENT_PASSWORD, 12);

  const adminRows = await db
    .insert(schema.users)
    .values(
      ADMINS.map((admin) => ({
        email: admin.email.toLowerCase(),
        passwordHash: adminHash,
        fullName: admin.name,
        flatNumber: admin.flat,
        phone: admin.phone,
        role: 'ADMIN' as const,
        createdAt: daysAgo(120),
      })),
    )
    .returning({ id: schema.users.id, fullName: schema.users.fullName });

  const residentRows = await db
    .insert(schema.users)
    .values(
      RESIDENTS.map((resident, index) => ({
        email: emailFor(resident.name),
        passwordHash: residentHash,
        fullName: resident.name,
        flatNumber: resident.flat,
        phone: resident.phone,
        role: 'RESIDENT' as const,
        createdAt: daysAgo(110 - index * 2),
      })),
    )
    .returning({ id: schema.users.id, fullName: schema.users.fullName });

  const primaryAdmin = adminRows[0]!;

  console.info('[seed] creating notices …');
  await db.insert(schema.notices).values(
    NOTICES.map((notice) => ({
      title: notice.title,
      body: notice.body,
      isImportant: notice.isImportant,
      authorId: pick(adminRows).id,
      publishedAt: daysAgo(notice.daysAgo),
      createdAt: daysAgo(notice.daysAgo),
    })),
  );

  console.info('[seed] creating complaints and audit trails …');

  /**
   * The distribution is chosen so every screen has something to show:
   * a healthy resolved archive, a live queue, and a handful of genuinely
   * overdue items so the overdue view and dashboard KPI are not empty.
   */
  const PLAN: Array<{ finalStatus: schema.ComplaintStatus; ageDays: number }> = [
    // Overdue and still open — these drive the overdue queue (threshold 7d).
    { finalStatus: 'OPEN', ageDays: 21 },
    { finalStatus: 'OPEN', ageDays: 16 },
    { finalStatus: 'IN_PROGRESS', ageDays: 13 },
    { finalStatus: 'OPEN', ageDays: 11 },
    { finalStatus: 'IN_PROGRESS', ageDays: 9 },
    // Approaching the threshold but not yet breached.
    { finalStatus: 'IN_PROGRESS', ageDays: 5 },
    { finalStatus: 'OPEN', ageDays: 4 },
    { finalStatus: 'IN_PROGRESS', ageDays: 3 },
    { finalStatus: 'OPEN', ageDays: 2 },
    { finalStatus: 'OPEN', ageDays: 1 },
    // Recently raised.
    { finalStatus: 'OPEN', ageDays: 0 },
    // Resolved archive — some resolved quickly, some slowly.
    { finalStatus: 'RESOLVED', ageDays: 34 },
    { finalStatus: 'RESOLVED', ageDays: 30 },
    { finalStatus: 'RESOLVED', ageDays: 27 },
    { finalStatus: 'RESOLVED', ageDays: 23 },
    { finalStatus: 'RESOLVED', ageDays: 19 },
    { finalStatus: 'RESOLVED', ageDays: 15 },
    { finalStatus: 'RESOLVED', ageDays: 12 },
    { finalStatus: 'RESOLVED', ageDays: 8 },
    { finalStatus: 'RESOLVED', ageDays: 6 },
    { finalStatus: 'RESOLVED', ageDays: 4 },
    { finalStatus: 'RESOLVED', ageDays: 2 },
  ];

  let templateCursor = 0;
  let created = 0;

  for (const plan of PLAN) {
    const template = TEMPLATES[templateCursor % TEMPLATES.length]!;
    templateCursor += 1;

    const resident = pick(residentRows);
    const createdAt = daysAgo(plan.ageDays);

    // Higher priority skews toward safety-critical categories.
    const priority: schema.Priority =
      template.category === 'ELEVATOR' || template.category === 'SECURITY'
        ? chance(0.7)
          ? 'HIGH'
          : 'MEDIUM'
        : chance(0.2)
          ? 'HIGH'
          : chance(0.55)
            ? 'MEDIUM'
            : 'LOW';

    const reachedInProgress = plan.finalStatus !== 'OPEN';
    const inProgressAt = reachedInProgress
      ? new Date(createdAt.getTime() + (0.5 + rng() * 2) * 86_400_000)
      : null;
    const resolvedAt =
      plan.finalStatus === 'RESOLVED' && inProgressAt
        ? new Date(inProgressAt.getTime() + (0.5 + rng() * 4) * 86_400_000)
        : null;

    // Guard against a generated timeline drifting past "now".
    if (resolvedAt && resolvedAt > NOW) resolvedAt.setTime(NOW.getTime() - 3600_000);

    const [complaint] = await db
      .insert(schema.complaints)
      .values({
        residentId: resident.id,
        title: template.title,
        description: template.description,
        category: template.category,
        status: plan.finalStatus,
        priority,
        createdAt,
        updatedAt: resolvedAt ?? inProgressAt ?? createdAt,
        resolvedAt,
      })
      .returning({ id: schema.complaints.id, reference: schema.complaints.reference });

    if (!complaint) continue;
    created += 1;

    const events: schema.NewComplaintEvent[] = [
      {
        complaintId: complaint.id,
        type: 'CREATED',
        toStatus: 'OPEN',
        actorId: resident.id,
        actorRole: 'RESIDENT',
        createdAt,
      },
    ];

    // A priority change partway through, on some complaints.
    if (chance(0.35)) {
      events.push({
        complaintId: complaint.id,
        type: 'PRIORITY_CHANGED',
        fromPriority: 'MEDIUM',
        toPriority: priority,
        note: pick(ADMIN_NOTES.priority),
        actorId: pick(adminRows).id,
        actorRole: 'ADMIN',
        createdAt: new Date(createdAt.getTime() + 3600_000 * (2 + rng() * 10)),
      });
    }

    if (inProgressAt) {
      events.push({
        complaintId: complaint.id,
        type: 'STATUS_CHANGED',
        fromStatus: 'OPEN',
        toStatus: 'IN_PROGRESS',
        note: pick(ADMIN_NOTES.toInProgress),
        actorId: pick(adminRows).id,
        actorRole: 'ADMIN',
        createdAt: inProgressAt,
      });
    }

    if (resolvedAt) {
      events.push({
        complaintId: complaint.id,
        type: 'STATUS_CHANGED',
        fromStatus: 'IN_PROGRESS',
        toStatus: 'RESOLVED',
        note: pick(ADMIN_NOTES.toResolved),
        actorId: pick(adminRows).id,
        actorRole: 'ADMIN',
        createdAt: resolvedAt,
      });
    }

    await db.insert(schema.complaintEvents).values(events);

    // A matching outbox row per status change, so the admin email log is
    // populated and looks like a system that has actually been notifying.
    const statusChanges = events.filter((event) => event.type === 'STATUS_CHANGED');
    if (statusChanges.length > 0) {
      await db.insert(schema.emailOutbox).values(
        statusChanges.map((event) => ({
          recipientEmail: emailFor(resident.fullName),
          recipientName: resident.fullName,
          type: 'COMPLAINT_STATUS_CHANGED' as const,
          subject: `${complaint.reference} is now ${event.toStatus === 'RESOLVED' ? 'Resolved' : 'In Progress'} — ${template.title}`,
          // One seeded failure so the log demonstrates the failure path too.
          status: chance(0.08) ? ('FAILED' as const) : ('SENT' as const),
          attempts: 1,
          providerMessageId: `seed-${randomUUID()}`,
          lastError: null,
          complaintId: complaint.id,
          createdAt: event.createdAt as Date,
          sentAt: event.createdAt as Date,
        })),
      );
    }
  }

  // Mark the seeded failures with a plausible reason.
  await pool.query(`
    UPDATE email_outbox
       SET last_error = 'Provider responded 422: recipient domain rejected the message',
           sent_at = NULL,
           provider_message_id = NULL
     WHERE status = 'FAILED'
  `);

  const [{ rows: counts }] = await Promise.all([
    pool.query(`
      SELECT
        (SELECT count(*) FROM users)             AS users,
        (SELECT count(*) FROM complaints)        AS complaints,
        (SELECT count(*) FROM complaint_events)  AS events,
        (SELECT count(*) FROM notices)           AS notices,
        (SELECT count(*) FROM email_outbox)      AS emails,
        (SELECT count(*) FROM complaints
          WHERE status <> 'RESOLVED'
            AND created_at < now() - interval '7 days') AS overdue
    `),
  ]);

  const summary = counts[0];

  console.info('');
  console.info('  Seed complete');
  console.info('  ─────────────────────────────────────────');
  console.info(`  Users        ${summary.users}  (${ADMINS.length} admin, ${RESIDENTS.length} resident)`);
  console.info(`  Complaints   ${summary.complaints}  (${summary.overdue} currently overdue)`);
  console.info(`  Audit events ${summary.events}`);
  console.info(`  Notices      ${summary.notices}`);
  console.info(`  Emails       ${summary.emails}`);
  console.info('');
  console.info('  Demo credentials');
  console.info('  ─────────────────────────────────────────');
  console.info(`  Admin     ${ADMIN_EMAIL}  /  ${ADMIN_PASSWORD}`);
  console.info(`  Resident  ${emailFor(RESIDENTS[0].name)}  /  ${RESIDENT_PASSWORD}`);
  console.info('');

  void created;
  void primaryAdmin;
  await pool.end();
}

main().catch((error: unknown) => {
  console.error('[seed] failed:', error);
  process.exit(1);
});
