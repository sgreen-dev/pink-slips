import { describe, expect, it } from 'vitest'
import {
  isCollectionState,
  isCounts,
  isGarageList,
  isSavedGarage,
  isStringArray,
  normalizeCollection,
} from './records.ts'

/**
 * These guards stand between an untrusted body and stored account state: the service runs them
 * on the collection and the garages a browser sends to `/me/claim` and `/me/garages` before it
 * writes either to an account (DESIGN.md 13).
 */

const garage = {
  id: 'custom-1',
  name: 'Mine',
  cars: ['honda-civic-si'],
  deck: ['turbo-kit'],
  updatedAt: 5,
}

const collection = {
  owned: { 'honda-civic-si': 2 },
  packs: 3,
  variants: { foil: {}, holo: {}, chrome: {} },
  laps: 1,
  grantVersion: 2,
  credits: 40,
}

describe('garage records', () => {
  it('accepts a complete garage and a list of them', () => {
    expect(isSavedGarage(garage)).toBe(true)
    expect(isGarageList([garage, garage])).toBe(true)
    expect(isGarageList([])).toBe(true)
  })

  it('refuses anything with a field of the wrong type or missing', () => {
    expect(isSavedGarage(null)).toBe(false)
    expect(isSavedGarage('a string')).toBe(false)
    expect(isSavedGarage({ ...garage, id: 1 })).toBe(false)
    expect(isSavedGarage({ ...garage, cars: 'honda-civic-si' })).toBe(false)
    expect(isSavedGarage({ ...garage, deck: [1, 2] })).toBe(false)
    expect(isSavedGarage({ ...garage, updatedAt: '5' })).toBe(false)
    expect(isGarageList([garage, { id: 'x' }])).toBe(false)
    expect(isGarageList(garage)).toBe(false)
  })

  it('checks every item of a string array', () => {
    expect(isStringArray(['a', 'b'])).toBe(true)
    expect(isStringArray([])).toBe(true)
    expect(isStringArray(['a', 1])).toBe(false)
    expect(isStringArray('a')).toBe(false)
  })
})

describe('card counts', () => {
  it('accepts whole counts at or above zero', () => {
    expect(isCounts({})).toBe(true)
    expect(isCounts({ 'honda-civic-si': 0 })).toBe(true)
    expect(isCounts({ 'honda-civic-si': 3 })).toBe(true)
  })

  it('refuses a negative, a fraction, a string, or an array', () => {
    expect(isCounts({ 'honda-civic-si': -1 })).toBe(false)
    expect(isCounts({ 'honda-civic-si': 1.5 })).toBe(false)
    expect(isCounts({ 'honda-civic-si': '3' })).toBe(false)
    expect(isCounts({ 'honda-civic-si': Number.NaN })).toBe(false)
    expect(isCounts([])).toBe(false)
    expect(isCounts(null)).toBe(false)
  })
})

describe('collection records', () => {
  it('accepts a complete record and one missing every optional field', () => {
    expect(isCollectionState(collection)).toBe(true)
    expect(isCollectionState({ owned: {}, packs: 0, variants: { foil: {}, holo: {} } })).toBe(true)
  })

  it('refuses a broken owned map, packs, or variants', () => {
    expect(isCollectionState(null)).toBe(false)
    expect(isCollectionState({ ...collection, owned: 'none' })).toBe(false)
    expect(isCollectionState({ ...collection, packs: -1 })).toBe(false)
    expect(isCollectionState({ ...collection, packs: 1.5 })).toBe(false)
    expect(isCollectionState({ ...collection, variants: undefined })).toBe(false)
    expect(isCollectionState({ ...collection, variants: { foil: {} } })).toBe(false)
    expect(
      isCollectionState({ ...collection, variants: { ...collection.variants, chrome: 3 } }),
    ).toBe(false)
  })

  // Credits are a balance the service adds to an account on claim, so a record that slips a
  // string or a negative past this guard mints them for real.
  it('refuses credits that are not a whole count', () => {
    expect(isCollectionState({ ...collection, credits: '40' })).toBe(false)
    expect(isCollectionState({ ...collection, credits: -40 })).toBe(false)
    expect(isCollectionState({ ...collection, credits: 40.5 })).toBe(false)
    expect(isCollectionState({ ...collection, credits: Number.NaN })).toBe(false)
    expect(isCollectionState({ ...collection, credits: Number.POSITIVE_INFINITY })).toBe(false)
    expect(isCollectionState({ ...collection, credits: null })).toBe(false)
    expect(isCollectionState({ ...collection, credits: undefined })).toBe(true)
  })

  it('refuses laps and a grant version that are not whole counts', () => {
    expect(isCollectionState({ ...collection, laps: -1 })).toBe(false)
    expect(isCollectionState({ ...collection, laps: '1' })).toBe(false)
    expect(isCollectionState({ ...collection, grantVersion: '2' })).toBe(false)
    expect(isCollectionState({ ...collection, grantVersion: -2 })).toBe(false)
  })
})

describe('filling in what an older record lacks', () => {
  it('defaults chrome, laps, the grant version and credits', () => {
    const old = { owned: { 'honda-civic-si': 1 }, packs: 2, variants: { foil: {}, holo: {} } }
    expect(normalizeCollection(old)).toEqual({
      owned: { 'honda-civic-si': 1 },
      packs: 2,
      variants: { foil: {}, holo: {}, chrome: {} },
      laps: 0,
      // No version means the record was written against the legacy grant, so the loader rebases.
      grantVersion: 1,
      credits: 0,
    })
  })

  it('keeps what a current record carries', () => {
    expect(normalizeCollection(collection)).toEqual(collection)
  })
})
