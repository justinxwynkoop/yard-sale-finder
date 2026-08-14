# Draft Sales & Listings — Design

**Date:** 2026-08-13
**Status:** Approved for implementation planning
**Ships as:** JS-only → OTA (no database changes, no RLS changes, no native changes).

## Problem

A seller halfway through Create Sale / Create Listing who gets interrupted
(call, app backgrounded, crash, deliberate "finish later") loses every field
and photo. Drafts protect in-progress posts. Scope decision (user): this is
**interruption protection** (model "A"), not a cross-device prep-ahead
workflow — with an explicit **"Save draft"** button so the draft is a
deliberate, findable object.

## Decisions

| Decision | Choice |
|---|---|
| Storage | Device-local (AsyncStorage). No server rows, no `draft` status, no RLS surgery |
| Cardinality | ONE draft per form type (`sale`, `listing`). Saving again overwrites |
| Explicit save | "Save draft" ghost button beside the sticky Post CTA on both forms; saves, toasts "Draft saved", closes |
| Safety net | Debounced silent autosave to the same slot while editing (crash/interruption coverage). The button is the deliberate exit; autosave is invisible protection |
| Meaningful-draft gate | Button renders and autosave persists only once the form has a title, description, or ≥1 photo — an empty tapped-into form never nags |
| Resume door 1 | Reopening the Create form with a draft present → banner: "Pick up where you left off?" → Restore / Start fresh |
| Resume door 2 | My Sales / My Listings pin a "Draft" row on top when one exists: title, "saved <relative time> · on this device", tap → Create form restored; discard action with confirm |
| Lifecycle | Successful post clears; Start fresh clears; discard clears |
| Event-join precedence | When CreateSale opens with event params (`eventId`/`presetStart`/`presetEnd`), the event prefill wins over the draft's dates on restore; the rest of the draft restores normally |
| Photos | Local URIs saved as-is (uploads only happen at post). On restore, files the OS purged are skipped silently |
| Honesty | Draft rows are labeled "on this device" — local drafts don't follow the account |

## Storage shape

Keys `trove:draft:sale` and `trove:draft:listing`, JSON:
`{ v: 1, savedAt: ISO, fields: { ...all form fields as strings/arrays... }, media: [localUri...] }`
Unknown/missing keys on restore → field keeps its default (forward-compatible).
A tiny `src/lib/drafts.ts` module owns load/save/clear/meaningfulness so both
screens share one implementation; it is pure enough to unit test (shape
round-trip, meaningfulness rules, purged-photo filtering is screen-side).

## Screens

- **CreateSaleScreen / CreateListingScreen:** debounced autosave effect
  (~1s after last change, only when meaningful); "Save draft" button; restore
  banner on mount when a draft exists (and, for CreateSale, no conflicting
  event prefill on the date fields); clear-on-post.
- **MySalesScreen / MyListingsScreen:** local-draft row pinned above the list
  (reads the draft slot on focus), navigates to the Create screen which then
  offers/starts restore; Discard pill with destructive confirm.

## Out of scope (explicitly)

Multiple drafts per type, server-side drafts / cross-device sync, drafts for
neighborhood-sale events, edit-screen drafts.

## Testing

Unit tests for `drafts.ts` (round-trip, meaningfulness, versioned shape
tolerance). Manual smoke: interrupt mid-form → relaunch → restore banner;
Save draft → row appears in My Sales; post → draft gone; event-link open with
stale draft → event dates win.
