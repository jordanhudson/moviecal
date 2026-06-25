import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanMovieTitle, decodeHtmlEntities } from './title-cleaner.js';

test('strips a parenthesized annotation (5+ chars) at the end into a note', () => {
  assert.deepEqual(cleanMovieTitle('Backrooms (Advance Screening)'), {
    title: 'Backrooms',
    note: 'Advance Screening',
  });
});

test('keeps short parenthesized text like a year', () => {
  assert.deepEqual(cleanMovieTitle('Up (2009)'), {
    title: 'Up (2009)',
    note: null,
  });
});

test('keeps parenthesized text that is not at the end of the title', () => {
  assert.deepEqual(cleanMovieTitle('Crouching Tiger (Hidden Dragon) Returns'), {
    title: 'Crouching Tiger (Hidden Dragon) Returns',
    note: null,
  });
});

test('plain titles pass through untouched', () => {
  assert.deepEqual(cleanMovieTitle('Dune: Part Two'), {
    title: 'Dune: Part Two',
    note: null,
  });
});

test('decodes HTML entities before cleaning', () => {
  assert.deepEqual(cleanMovieTitle('Singin&#8217; in the Rain (4K Restoration)'), {
    title: 'Singin’ in the Rain',
    note: '4K Restoration',
  });
  assert.deepEqual(cleanMovieTitle('Fast &amp; Furious'), {
    title: 'Fast & Furious',
    note: null,
  });
});

test('decodeHtmlEntities handles named, decimal, and hex entities', () => {
  assert.equal(
    decodeHtmlEntities('&lt;b&gt; &quot;hi&quot; &apos;there&apos;'),
    '<b> "hi" \'there\'',
  );
  assert.equal(decodeHtmlEntities('&#65;&#x42;'), 'AB');
});
