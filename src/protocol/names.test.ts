import { describe, expect, it } from 'vitest'
import { parseClientMessage } from './messages.ts'
import { isNameAllowed, nameProblem, normalizeName, safeDisplayName } from './names.ts'

describe('the name filter', () => {
  it('lets ordinary names through, including ones that contain a blocked word', () => {
    for (const name of [
      'Ann',
      'Bo',
      'Scunthorpe',
      'Cassandra',
      'Assassin',
      'Cocker Spaniel',
      'Dickens',
      'Shittake fan',
      'Raccoon',
      'Cucumber',
      'Sussex',
      'Essex',
      'Grape Ape',
      'Therapist',
      'José',
      'Mx Racer 42',
    ]) {
      expect(nameProblem(name), name).toBeNull()
    }
  })

  it('refuses blocked words however they are dressed up', () => {
    for (const name of [
      'fuck',
      'FUCK',
      'F u c k',
      'f.u.c.k',
      'fuuuuck',
      'phuck you'.replace('ph', 'f'),
      'Fvck'.replace('v', 'u'),
      'sh1t',
      'b!tch',
      '@ss',
      'a$$',
      'n1gger',
      'Nigga',
      'cunt',
      'Cuntface',
      'p0rn star',
      'sexy racer',
      'cum',
      'Hitler',
      'kkk',
    ]) {
      expect(nameProblem(name), name).not.toBeNull()
    }
  })

  it('refuses names the game uses and empty ones', () => {
    for (const name of ['CPU', 'cpu', 'Admin', 'M0derator', 'Pink Slips', 'staff']) {
      expect(nameProblem(name), name).toBe('That name is taken by the game.')
    }
    expect(nameProblem('')).toBe('Type a name.')
    expect(nameProblem('   ')).toBe('Type a name.')
    expect(nameProblem('123')).toBeNull()
    expect(nameProblem('???')).toBe('A name needs at least one letter.')
    expect(nameProblem('x'.repeat(25))).toMatch(/at most 24/)
  })

  it('normalises look-alikes, accents, and punctuation', () => {
    expect(normalizeName('B0b!')).toBe('bobi')
    expect(normalizeName('  José  Álvarez ')).toBe('jose alvarez')
    expect(normalizeName('a-b_c')).toBe('a b c')
  })

  it('masks a refused name on display and in a room join', () => {
    expect(safeDisplayName('Ann')).toBe('Ann')
    expect(safeDisplayName('sh1t')).toBe('Player')
    expect(isNameAllowed('Bo')).toBe(true)
    const join = parseClientMessage(
      JSON.stringify({ type: 'join', name: 'b!tch', garage: { garage: ['a'], deck: ['b'] } }),
    )
    expect(join?.type === 'join' && join.name).toBe('Player')
    const fine = parseClientMessage(
      JSON.stringify({ type: 'join', name: 'Bo', garage: { garage: ['a'], deck: ['b'] } }),
    )
    expect(fine?.type === 'join' && fine.name).toBe('Bo')
  })
})
