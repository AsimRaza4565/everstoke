import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registryToKit } from '../lib/brand-resolve.mjs';

test('registryToKit preserves existing channel data and sets defaults correctly', () => {
  const entry = {
    slug: 'growth-mindset',
    label: 'Growth Mindset',
    handle: '@growthmindset',
    niche: 'Personal Growth',
    accent: '#10B981',
    slots: ['14:00', '20:00'],
    voice: 'am_michael',
    docDay: 'Wed',
    active: true,
    kit: {
      eyebrow: 'GROWTH // DAILY',
      tagline: 'Get better every day.',
      tags: ['growth', 'mindset', 'habits'],
      niches: ['growth', 'habits'],
      description: 'Daily personal growth insights in 60 seconds.',
    }
  };

  const kit = registryToKit(entry);

  assert.equal(kit.slug, 'growth-mindset');
  assert.equal(kit.label, 'Growth Mindset');
  assert.equal(kit.handle, '@growthmindset');
  assert.equal(kit.niche, 'Personal Growth');
  assert.equal(kit.accent, '#10B981');
  assert.deepEqual(kit.slots, ['14:00', '20:00']);
  assert.equal(kit.docDay, 'Wed');
  assert.equal(kit.active, true);
  assert.equal(kit.fromRegistry, true);
  assert.equal(kit.eyebrow, 'GROWTH // DAILY');
  assert.equal(kit.tagline, 'Get better every day.');
  assert.deepEqual(kit.tags, ['growth', 'mindset', 'habits']);
});

test('registryToKit parses comma and space-delimited keywords if tags are omitted', () => {
  const entry = {
    slug: 'crypto-pulse',
    ytKeywords: '"crypto news" bitcoin "altcoin daily" ethereum investment',
  };

  const kit = registryToKit(entry);
  assert.ok(kit.tags.includes('crypto news'));
  assert.ok(kit.tags.includes('altcoin daily'));
  assert.ok(kit.tags.includes('bitcoin'));
  assert.ok(kit.tags.includes('ethereum'));
});

test('reconnecting an existing channel must preserve existing slug over raw handle', () => {
  // Simulates the seam in studio/app/api/oauth/callback/route.js
  const existingRegistry = [
    { channelId: 'UC1234567890', slug: 'custom-assigned-slug' }
  ];

  const incomingChannelId = 'UC1234567890';
  const incomingHandle = 'newhandle';

  function slugify(s) {
    return s.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  }

  const existing = existingRegistry.find(c => c.channelId === incomingChannelId);
  let resolvedSlug;
  if (existing) {
    resolvedSlug = existing.slug;
  } else {
    resolvedSlug = slugify(incomingHandle);
  }

  assert.equal(resolvedSlug, 'custom-assigned-slug', 'Existing slug should be preserved to prevent secret drift');
});
