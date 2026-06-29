import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTitle, titlesMatch } from './title-match.js';

test('normalizeTitle strips diacritics, punctuation, and a leading article', () => {
  assert.equal(normalizeTitle('Amélie'), 'amelie');
  assert.equal(normalizeTitle('The Silence of the Lambs'), 'silence of the lambs');
  assert.equal(normalizeTitle('WALL·E'), 'wall e');
  assert.equal(normalizeTitle('Fast & Furious'), 'fast and furious');
  assert.equal(normalizeTitle('  A   Ghost   Story '), 'ghost story');
});

test('titlesMatch accepts equivalent titles', () => {
  assert.ok(titlesMatch('Amélie', 'Amelie'));
  assert.ok(titlesMatch('The Silence of the Lambs', 'Silence of the Lambs'));
  assert.ok(titlesMatch('Fast & Furious', 'Fast and Furious'));
  assert.ok(titlesMatch('WALL·E', 'Wall-E'));
});

test('titlesMatch rejects distinct titles (incl. near-misses and the Hannibal bug)', () => {
  assert.ok(!titlesMatch('The Silence of the Lambs', 'Hannibal'));
  assert.ok(!titlesMatch('Alien', 'Aliens')); // no prefix/substring leniency
  assert.ok(!titlesMatch('Dune', 'Dune: Part Two'));
  assert.ok(!titlesMatch('', 'Anything')); // empty normalizes to nothing
});
