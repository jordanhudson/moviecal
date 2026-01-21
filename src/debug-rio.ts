// Debug script to investigate Rio Theatre timezone handling
// Run on fly.io: fly ssh console -a movieclock -C "node dist/debug-rio.js"

/**
 * Convert a UTC date to a "naive" date that represents Pacific time.
 * Copy of the function from rio-scraper.ts for testing.
 */
function utcToPacificNaive(utcDate: Date): Date {
  const pacificStr = utcDate.toLocaleString('en-US', {
    timeZone: 'America/Vancouver',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const match = pacificStr.match(/(\d+)\/(\d+)\/(\d+),?\s+(\d+):(\d+):(\d+)/);
  if (!match) {
    return utcDate;
  }

  const [, month, day, year, hour, minute, second] = match.map(Number);
  return new Date(Date.UTC(year, month - 1, day, hour, minute, second));
}

async function debugRio() {
  console.log('=== Rio Theatre Timezone Debug ===\n');

  // 1. Show server timezone info
  console.log('SERVER ENVIRONMENT:');
  console.log('  process.env.TZ:', process.env.TZ || '(not set)');
  console.log('  new Date().toString():', new Date().toString());
  console.log('  new Date().toISOString():', new Date().toISOString());
  console.log('  Timezone offset (minutes):', new Date().getTimezoneOffset());
  console.log('  Timezone offset (hours):', new Date().getTimezoneOffset() / 60);
  console.log('');

  // 2. Fetch a few events from Rio API
  console.log('FETCHING FROM RIO API...\n');

  const now = new Date();
  const startDate = new Date(now);
  startDate.setMonth(startDate.getMonth() - 1);
  const endDate = new Date(now);
  endDate.setMonth(endDate.getMonth() + 2);

  const apiUrl = new URL('https://riotheatre.ca/wp-json/barker/v1/listings');
  apiUrl.searchParams.set('_embed', 'true');
  apiUrl.searchParams.set('status', 'publish');
  apiUrl.searchParams.set('page', '1');
  apiUrl.searchParams.set('per_page', '10'); // Just get 10 for debugging
  apiUrl.searchParams.set('start_date', startDate.toISOString());
  apiUrl.searchParams.set('end_date', endDate.toISOString());

  console.log('API URL:', apiUrl.toString());

  const response = await fetch(apiUrl.toString());
  if (!response.ok) {
    throw new Error(`API request failed: ${response.status} ${response.statusText}`);
  }

  const events = await response.json();

  console.log(`Fetched ${events.length} events\n`);

  // 3. Analyze each event's time handling
  console.log('EVENT TIME ANALYSIS:');
  console.log('='.repeat(80));

  for (const event of events.slice(0, 5)) {
    const rawStartTime = event.start_time;
    const parsedDate = new Date(rawStartTime);

    // Apply the fix
    const fixedDate = utcToPacificNaive(parsedDate);

    console.log(`\nTitle: ${event.event.title}`);
    console.log(`  Raw start_time from API: "${rawStartTime}"`);
    console.log(`  OLD (broken) - new Date():`);
    console.log(`    .toISOString():  ${parsedDate.toISOString()}`);
    console.log(`    Server would display: ${parsedDate.getUTCHours()}:${String(parsedDate.getUTCMinutes()).padStart(2, '0')} (UTC server)`);
    console.log(`  NEW (fixed) - utcToPacificNaive():`);
    console.log(`    .toISOString():  ${fixedDate.toISOString()}`);
    console.log(`    Server would display: ${fixedDate.getUTCHours()}:${String(fixedDate.getUTCMinutes()).padStart(2, '0')} (UTC server)`);
    console.log(`    Actual Pacific time: ${parsedDate.toLocaleString('en-US', { timeZone: 'America/Vancouver', hour: 'numeric', minute: '2-digit', hour12: true })}`);
  }

  console.log('\n' + '='.repeat(80));
  console.log('\nDIAGNOSIS:');

  // Check first event to diagnose
  if (events.length > 0) {
    const raw = events[0].start_time;
    const hasZ = raw.includes('Z');
    const hasOffset = raw.includes('+') || (raw.match(/-/g) || []).length > 2;

    if (!hasZ && !hasOffset) {
      console.log('The API returns times WITHOUT timezone info.');
      console.log('JavaScript is likely interpreting these as UTC, causing the 8-hour shift.');
      console.log('\nSUGGESTED FIX: Parse the time as Pacific time explicitly.');
    } else if (hasZ) {
      console.log('The API returns times with "Z" (UTC) suffix.');
      console.log('The times ARE in UTC - display logic may need adjustment.');
    } else {
      console.log('The API returns times with timezone offset.');
      console.log('Check if the offset matches expectations.');
    }
  }
}

// Also check VIFF for comparison
async function debugViff() {
  console.log('\n\n=== VIFF Timezone Debug (for comparison) ===\n');

  const response = await fetch('https://viff.org/wp-json/v1/attendable/calendar/instances');
  const events = await response.json();

  console.log(`Fetched ${events.length} VIFF events\n`);

  for (const event of events.slice(0, 3)) {
    const titleMatch = event.title.match(/<h3 class="c-calendar-instance__title">\s*(.+?)\s*<\/h3>/s);
    const title = titleMatch ? titleMatch[1].trim() : '(unknown)';

    console.log(`Title: ${title}`);
    console.log(`  Raw start from API: "${event.start}"`);
    const parsed = new Date(event.start);
    console.log(`  Parsed .toString(): ${parsed.toString()}`);
    console.log(`  Parsed .toISOString(): ${parsed.toISOString()}`);

    const hasTimezone = event.start.includes('Z') ||
                        event.start.includes('+') ||
                        (event.start.match(/-/g) || []).length > 2;
    console.log(`  Has timezone indicator: ${hasTimezone}`);
    console.log('');
  }
}

debugRio().then(() => debugViff()).catch(console.error);
