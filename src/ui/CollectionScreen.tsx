import { useContext, useState } from 'react'
import { backdropUrl } from './artwork.ts'
import { Backdrop } from './Backdrop.tsx'
import {
  ALL_CARD_IDS,
  bestVariant,
  copiesOwned,
  cardPrice,
  isComplete,
  ownedCount,
  scrapValue,
  surplus,
  owns,
  packCarCount,
  packCards,
  type Pack,
} from '../collection/collection.ts'
import {
  buyLocally,
  claimLapLocally,
  clearRebaseNotice,
  scrapLocally,
  loadCollection,
  rebaseNoticePending,
  type CollectionState,
} from '../collection/persist.ts'
import {
  AccountContext,
  buyOnline,
  claimLapOnline,
  mirror,
  openNext,
  scrapOnline,
} from './account.ts'
import { Plate } from './Plate.tsx'
import { CAR_BY_ID, CARS } from '../data/cars.ts'
import { MOD_BY_ID, MODS } from '../data/mods.ts'
import { TIER_LABEL } from '../data/tiers.ts'
import {
  CAR_TYPES,
  CAR_TYPE_LABEL,
  TIERS,
  type CarType,
  type ModFamily,
  type Tier,
} from '../data/types.ts'
import { TUNABLES } from '../engine/index.ts'
import { FAMILY_LABEL } from './builder.ts'
import { CarCard } from './CarCard.tsx'
import { Filter } from './Filter.tsx'
import { ModCard } from './ModCard.tsx'
import { PackReveal } from './PackReveal.tsx'

interface CollectionScreenProps {
  onBack: () => void
}

interface Opened {
  pack: Pack
  /** Ids the player did not own before this pack. */
  fresh: ReadonlySet<string>
}

/** Every card in the game, what the player owns, and the packs waiting to be opened (DESIGN.md 12). */
export function CollectionScreen({ onBack }: CollectionScreenProps) {
  const account = useContext(AccountContext)
  const [state, setState] = useState<CollectionState>(() => loadCollection())
  const [opened, setOpened] = useState<Opened | null>(null)
  const [tab, setTab] = useState<'cars' | 'mods'>('cars')
  const [type, setType] = useState<CarType | 'all'>('all')
  const [tier, setTier] = useState<Tier | 'all'>('all')
  const [family, setFamily] = useState<ModFamily | 'all'>('all')
  // Shown once to a collection that was rebased onto the intro set (DESIGN.md 12).
  const [rebased, setRebased] = useState(() => rebaseNoticePending())

  const owned = state.owned
  // Taking the lap (DESIGN.md 12, Laps): offered once every car is owned, behind a confirm.
  const complete = isComplete(owned)
  const [keepsake, setKeepsake] = useState('')
  const [confirmLap, setConfirmLap] = useState(false)
  const [lapError, setLapError] = useState<string | null>(null)
  const ownedCars = CARS.filter((car) => owns(owned, car.id))
  const rarestFirst = [...TIERS].reverse()
  const defaultKeepsake =
    rarestFirst.flatMap((t) => ownedCars.filter((car) => car.tier === t))[0]?.id ?? ''
  const chosen = keepsake || defaultKeepsake
  // Scrapping spare copies for credits, and buying a card with them (DESIGN.md 12).
  const [confirmScrap, setConfirmScrap] = useState(false)
  const [wanted, setWanted] = useState('')
  const [scrapError, setScrapError] = useState<string | null>(null)
  const spare = surplus(state)
  const spareCount = [...spare.values()].reduce((sum, n) => sum + n, 0)
  const spareValue = scrapValue(state)
  const missing = ALL_CARD_IDS.filter((id) => !owns(owned, id))
    .map((id) => ({
      id,
      name: CAR_BY_ID.get(id)?.name ?? MOD_BY_ID.get(id)?.name ?? id,
      price: cardPrice(id) ?? 0,
    }))
    .sort((a, b) => a.price - b.price || a.name.localeCompare(b.name))
  const applyCollection = (next: CollectionState) => {
    setState(next)
    setConfirmScrap(false)
    setWanted('')
  }
  const doScrap = async () => {
    setScrapError(null)
    if (account) {
      const data = await scrapOnline(account.endpoint, account.token)
      if (!data || data === 'refused') {
        setScrapError('Nothing could be scrapped. Check the connection and try again.')
        return
      }
      account.update(data)
      mirror(data)
      applyCollection(data.collection)
    } else {
      const next = scrapLocally()
      if (!next) {
        setScrapError('There is nothing spare to scrap.')
        return
      }
      applyCollection(next)
    }
  }
  const doBuy = async () => {
    setScrapError(null)
    if (wanted === '') return
    if (account) {
      const data = await buyOnline(account.endpoint, account.token, wanted)
      if (!data || data === 'refused') {
        setScrapError('That card could not be bought.')
        return
      }
      account.update(data)
      mirror(data)
      applyCollection(data.collection)
    } else {
      const next = buyLocally(wanted)
      if (!next) {
        setScrapError('That card could not be bought.')
        return
      }
      applyCollection(next)
    }
  }
  const takeLap = async () => {
    setLapError(null)
    if (account) {
      const data = await claimLapOnline(account.endpoint, account.token, chosen)
      if (!data || data === 'refused') {
        setLapError('The lap could not be taken. Check the connection and try again.')
        return
      }
      account.update(data)
      mirror(data)
      setState(data.collection)
    } else {
      const next = claimLapLocally(chosen)
      if (!next) {
        setLapError('The lap could not be taken.')
        return
      }
      setState(next)
    }
    setConfirmLap(false)
    setKeepsake('')
    setOpened(null)
  }
  const cars = CARS.filter(
    (car) => (type === 'all' || car.type === type) && (tier === 'all' || car.tier === tier),
  )
  const mods = MODS.filter((mod) => family === 'all' || mod.family === family)
  const { packsPerMatch, packsPerCpuWin } = TUNABLES.collection

  const open = async () => {
    const result = await openNext(account)
    if (!result) return
    const fresh = new Set(
      packCards(result.pack)
        .filter((card) => copiesOwned(owned, card.id) === 0)
        .map((card) => card.id),
    )
    setState(result.state)
    setOpened({ pack: result.pack, fresh })
  }

  return (
    <main className="collection">
      <Backdrop image={backdropUrl('collection')} />
      <header className="builder__header">
        <span className="board__brand">Pink Slips</span>
        <h1 className="builder__title">Collection</h1>
        <button type="button" className="button" onClick={onBack}>
          Back to start
        </button>
      </header>

      <section className="collection__packs" aria-live="polite">
        {rebased && (
          <div className="collection__notice">
            <p>
              The free cards changed. A new collection now starts with six cars and sixteen mods
              instead of all three garages, so packs have more left to find. Everything you opened
              or won is still yours. The three garages are loaners: you can still race them, they
              just are not in your collection. A saved garage that needs a card you no longer have
              waits in the builder until you fix it.
            </p>
            <button
              type="button"
              className="button"
              onClick={() => {
                clearRebaseNotice()
                setRebased(false)
              }}
            >
              Got it
            </button>
          </div>
        )}
        <p className="collection__summary">
          You own {ownedCount(owned)} of {ALL_CARD_IDS.length} cards.
          {state.credits > 0 ? ' ' + state.credits + ' credits.' : ''}
          <Plate laps={state.laps} size="md" />
        </p>
        {complete && (
          <div className="collection__lap">
            <p>
              Every car is yours. Take the lap: your collection returns to the intro set, you keep
              one car in Chrome, and packs hold an extra car from then on, up to two. Custom garages
              that need cars you give up are removed.
            </p>
            <label className="collection__keepsake">
              Keepsake{' '}
              <select value={chosen} onChange={(event) => setKeepsake(event.target.value)}>
                {ownedCars.map((car) => (
                  <option key={car.id} value={car.id}>
                    {car.name}
                  </option>
                ))}
              </select>
            </label>
            {confirmLap ? (
              <span className="board__confirm">
                <button
                  type="button"
                  className="button button--primary"
                  onClick={() => void takeLap()}
                >
                  Take lap {state.laps + 1}
                </button>
                <button
                  type="button"
                  className="button button--ghost"
                  onClick={() => setConfirmLap(false)}
                >
                  Not yet
                </button>
              </span>
            ) : (
              <button
                type="button"
                className="button button--primary"
                onClick={() => setConfirmLap(true)}
              >
                Take the lap
              </button>
            )}
            {lapError && <p className="builder__notice">{lapError}</p>}
          </div>
        )}
        {(spareCount > 0 || state.credits > 0) && (
          <div className="collection__scrap">
            <p>
              You hold {spareCount} spare {spareCount === 1 ? 'card' : 'cards'} past what any deck
              can use. Scrapping them costs you nothing you could play, and never touches a card
              with a finish.
            </p>
            {confirmScrap ? (
              <span className="board__confirm">
                <button
                  type="button"
                  className="button button--primary"
                  onClick={() => void doScrap()}
                >
                  Scrap for {spareValue} credits
                </button>
                <button
                  type="button"
                  className="button button--ghost"
                  onClick={() => setConfirmScrap(false)}
                >
                  Keep them
                </button>
              </span>
            ) : (
              <button
                type="button"
                className="button button--primary"
                disabled={spareCount === 0}
                onClick={() => setConfirmScrap(true)}
              >
                Scrap {spareCount} spare {spareCount === 1 ? 'card' : 'cards'}
              </button>
            )}
            <label className="collection__buy">
              Buy{' '}
              <select value={wanted} onChange={(event) => setWanted(event.target.value)}>
                <option value="">a card you do not own</option>
                {missing.map((card) => (
                  <option key={card.id} value={card.id}>
                    {card.name} — {card.price}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="button"
              disabled={wanted === '' || (cardPrice(wanted) ?? 0) > state.credits}
              onClick={() => void doBuy()}
            >
              {wanted === '' ? 'Pick a card' : `Buy for ${cardPrice(wanted) ?? 0} credits`}
            </button>
            {scrapError && <p className="builder__notice">{scrapError}</p>}
          </div>
        )}
        <button
          type="button"
          className="button button--primary button--big"
          disabled={state.packs === 0}
          onClick={() => void open()}
        >
          {state.packs === 0
            ? 'No packs to open'
            : `Open a pack (${state.packs} ${state.packs === 1 ? 'pack' : 'packs'} waiting)`}
        </button>
        <p className="builder__hint">
          Finishing a match earns {packsPerMatch} pack. Beating the CPU earns {packsPerCpuWin}. A
          pack holds {packCarCount(state.laps)} cars and {TUNABLES.collection.packMods} mods.
        </p>
        {opened && <PackReveal pack={opened.pack} fresh={opened.fresh} />}
      </section>

      <section className="builder__browse">
        <div className="builder__tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'cars'}
            className={`button ${tab === 'cars' ? 'button--primary' : ''}`}
            onClick={() => setTab('cars')}
          >
            Cars ({CARS.filter((car) => copiesOwned(owned, car.id) > 0).length}/{CARS.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'mods'}
            className={`button ${tab === 'mods' ? 'button--primary' : ''}`}
            onClick={() => setTab('mods')}
          >
            Mods ({MODS.filter((mod) => copiesOwned(owned, mod.id) > 0).length}/{MODS.length})
          </button>
        </div>
        <p className="builder__hint">
          Cards you do not own yet are dimmed. Counts show your copies.
        </p>

        {tab === 'cars' ? (
          <>
            <Filter
              label="Type"
              value={type}
              options={CAR_TYPES.map((t) => [t, CAR_TYPE_LABEL[t]] as [CarType, string])}
              onChange={setType}
            />
            <Filter
              label="Tier"
              value={tier}
              options={TIERS.map((t) => [t, TIER_LABEL[t]] as [Tier, string])}
              onChange={setTier}
            />
            <div className="browse__grid">
              {cars.map((car) => {
                const have = copiesOwned(owned, car.id)
                return (
                  <CarCard
                    key={car.id}
                    carId={car.id}
                    size="sm"
                    dimmed={have === 0}
                    variant={bestVariant(state.variants, car.id)}
                    badge={have > 1 ? `×${have}` : undefined}
                  />
                )
              })}
            </div>
          </>
        ) : (
          <>
            <Filter
              label="Family"
              value={family}
              options={(['part', 'boost', 'sabotage'] as const).map(
                (f) => [f, FAMILY_LABEL[f]] as [ModFamily, string],
              )}
              onChange={setFamily}
            />
            <div className="browse__grid">
              {mods.map((mod) => {
                const have = copiesOwned(owned, mod.id)
                return (
                  <div key={mod.id} className="hand__slot">
                    <ModCard
                      modId={mod.id}
                      dimmed={have === 0}
                      variant={bestVariant(state.variants, mod.id)}
                    />
                    {have > 0 && <span className="hand__count">×{have}</span>}
                  </div>
                )
              })}
            </div>
          </>
        )}
      </section>
    </main>
  )
}
