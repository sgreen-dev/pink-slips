import { useContext, useMemo, useRef, useState } from 'react'
import { backdropUrl } from './artwork.ts'
import { Backdrop } from './Backdrop.tsx'
import {
  ALL_CARD_IDS,
  bestVariant,
  copiesOwned,
  usefulCopies,
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
import { AccountContext, buyOnline, claimLapOnline, openNext, scrapOnline } from './account.ts'
import { count } from './analytics.ts'
import { detailTargetFor } from './detail.ts'
import { useDetail } from './useDetail.ts'
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
import { RulesButton, RulesDialog } from './RulesDialog.tsx'
import { useSound } from './sound/useSound.ts'

interface CollectionScreenProps {
  onBack: () => void
}

interface Opened {
  pack: Pack
  /** Ids the player did not own before this pack. */
  fresh: ReadonlySet<string>
}

/** The filter rows are fixed lists, so they are built once rather than on every render. */
const TYPE_OPTIONS = CAR_TYPES.map((t) => [t, CAR_TYPE_LABEL[t]] as [CarType, string])
const TIER_OPTIONS = TIERS.map((t) => [t, TIER_LABEL[t]] as [Tier, string])
const FAMILY_OPTIONS = (['part', 'boost', 'sabotage'] as const).map(
  (f) => [f, FAMILY_LABEL[f]] as [ModFamily, string],
)

/** A card name for either kind of id, for the picker and the line after a buy. */
function nameOfCard(id: string): string {
  return CAR_BY_ID.get(id)?.name ?? MOD_BY_ID.get(id)?.name ?? id
}

/** Every card in the game, what the player owns, and the packs waiting to be opened (DESIGN.md 12). */
export function CollectionScreen({ onBack }: CollectionScreenProps) {
  const account = useContext(AccountContext)
  const [state, setState] = useState<CollectionState>(() => loadCollection())
  const [opened, setOpened] = useState<Opened | null>(null)
  const rules = useRef<HTMLDialogElement>(null)
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
  const [packError, setPackError] = useState<string | null>(null)
  const ownedCars = useMemo(() => CARS.filter((car) => owns(owned, car.id)), [owned])
  const defaultKeepsake = useMemo(() => {
    const rarestFirst = [...TIERS].reverse()
    return rarestFirst.flatMap((t) => ownedCars.filter((car) => car.tier === t))[0]?.id ?? ''
  }, [ownedCars])
  const chosen = keepsake || defaultKeepsake
  // Scrapping spare copies for credits, and buying a card with them (DESIGN.md 12).
  const sound = useSound()
  const [confirmScrap, setConfirmScrap] = useState(false)
  const [wanted, setWanted] = useState('')
  const [scrapError, setScrapError] = useState<string | null>(null)
  const [boughtNote, setBoughtNote] = useState<string | null>(null)
  const openDetail = useDetail()
  const ownedCarCount = useMemo(
    () => CARS.filter((car) => copiesOwned(owned, car.id) > 0).length,
    [owned],
  )
  const ownedModCount = useMemo(
    () => MODS.filter((mod) => copiesOwned(owned, mod.id) > 0).length,
    [owned],
  )
  const spare = useMemo(() => surplus(state), [state])
  const spareCount = useMemo(() => [...spare.values()].reduce((sum, n) => sum + n, 0), [spare])
  const spareValue = useMemo(() => scrapValue(state), [state])
  // Everything the credits could still add: a card not held at all, and a mod below the copies
  // a deck can hold, since packs used to be the only way to a second or third (DESIGN.md 12).
  // Every card id, mapped and sorted. It answers only to what is owned, so it must not be
  // rebuilt when the picker beside it changes, which is the whole cost of choosing a card to buy.
  const missing = useMemo(
    () =>
      ALL_CARD_IDS.filter((id) => copiesOwned(owned, id) < usefulCopies(id))
        .map((id) => ({
          id,
          name: nameOfCard(id),
          held: copiesOwned(owned, id),
          price: cardPrice(id) ?? 0,
        }))
        .sort((a, b) => a.price - b.price || a.name.localeCompare(b.name)),
    [owned],
  )
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
      applyCollection(data.collection)
      sound.play('scrap')
    } else {
      const next = scrapLocally()
      if (!next) {
        setScrapError('There is nothing spare to scrap.')
        return
      }
      if (!next.saved) setScrapError(notStored('Scrapped'))
      applyCollection(next.state)
      sound.play('scrap')
    }
  }
  /** What to say when the change happened on screen but the browser refused to store it. */
  const notStored = (what: string) =>
    `${what}, but this browser is blocking storage, so it will be gone next time you open the game.`

  /** Shows the card just bought, the way its info button would, and leaves a line naming it. */
  const showBought = (id: string) => {
    // Both buy paths meet here and only on success, so the register cannot ring for a refusal.
    sound.play('buy')
    const target = detailTargetFor(id)
    setBoughtNote(nameOfCard(id) + ' is yours.')
    if (target) openDetail?.(target)
  }
  const doBuy = async () => {
    setScrapError(null)
    setBoughtNote(null)
    if (wanted === '') return
    // applyCollection clears the picker, so the id has to be held first.
    const bought = wanted
    if (account) {
      const data = await buyOnline(account.endpoint, account.token, wanted)
      if (!data || data === 'refused') {
        setScrapError('That card could not be bought.')
        return
      }
      account.update(data)
      applyCollection(data.collection)
      showBought(bought)
    } else {
      const next = buyLocally(bought)
      if (!next) {
        setScrapError('That card could not be bought.')
        return
      }
      if (!next.saved) setScrapError(notStored('Bought'))
      applyCollection(next.state)
      showBought(bought)
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
      setState(data.collection)
    } else {
      const next = claimLapLocally(chosen)
      if (!next) {
        setLapError('The lap could not be taken.')
        return
      }
      if (!next.saved) setLapError(notStored('The lap was taken'))
      setState(next.state)
    }
    setConfirmLap(false)
    setKeepsake('')
    setOpened(null)
  }
  const cars = useMemo(
    () =>
      CARS.filter(
        (car) => (type === 'all' || car.type === type) && (tier === 'all' || car.tier === tier),
      ),
    [type, tier],
  )
  const mods = useMemo(
    () => MODS.filter((mod) => family === 'all' || mod.family === family),
    [family],
  )
  const { packsPerMatch, packsPerCpuWin } = TUNABLES.collection

  const open = async () => {
    setPackError(null)
    const result = await openNext(account)
    // A signed-in player's pack comes from the service, so null here is the connection.
    if (!result) {
      setPackError(
        account
          ? 'The pack could not be opened. Check the connection and try again.'
          : 'The pack could not be opened.',
      )
      return
    }
    if (!result.saved) setPackError(notStored('The pack was opened'))
    const fresh = new Set(
      packCards(result.pack)
        .filter((card) => copiesOwned(owned, card.id) === 0)
        .map((card) => card.id),
    )
    setState(result.state)
    count('pack-opened')
    setOpened({ pack: result.pack, fresh })
  }

  return (
    <main className="collection">
      <Backdrop image={backdropUrl('collection')} />
      {/* Two stacked groups rather than one row of four: the screen title sits under the
          wordmark, and Rules under Back to start. */}
      <header className="builder__header collection__header">
        <div className="collection__headline">
          <span className="board__brand">Pink Slips</span>
          <h1 className="builder__title">Collection</h1>
        </div>
        <div className="screen__nav">
          <button type="button" className="button button--small" onClick={onBack}>
            Back to start
          </button>
          <RulesButton dialogRef={rules} />
        </div>
      </header>

      <section className="collection__packs">
        {rebased && (
          <div className="collection__notice">
            <p>
              The free cards changed. A new collection now starts with six cars and sixteen mods
              instead of every loaner garage, so packs have more left to find. Everything you opened
              or won is still yours. The loaner garages are just that: you can still race them, they
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
          <Plate laps={state.laps} size="md" />
        </p>
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
        {packError && (
          <p className="builder__notice" role="status">
            {packError}
          </p>
        )}
        {/* Outside the lap panel below, which unmounts the moment the lap is taken. */}
        {lapError && (
          <p className="builder__notice" role="status">
            {lapError}
          </p>
        )}
        {/* Only what changes in answer to something the player did is announced, which is the
            pack that just opened and the lines under the controls. */}
        <div aria-live="polite">
          {opened && <PackReveal pack={opened.pack} fresh={opened.fresh} />}
        </div>
        {(spareCount > 0 || state.credits > 0) && (
          <div className="collection__scrap">
            {/* Credits sit beside the controls that earn and spend them, not up in the summary. */}
            <p>
              <strong>
                {state.credits} {state.credits === 1 ? 'credit' : 'credits'}.
              </strong>{' '}
              {spareCount > 0
                ? `You hold ${spareCount} spare ${spareCount === 1 ? 'card' : 'cards'} past what any deck can use. Scrapping them costs you nothing you could play, and never touches a card with a finish.`
                : 'Spend them on any card you do not own.'}
            </p>
            {state.credits > 0 && (
              <div className="collection__row">
                <label className="collection__buy">
                  Buy{' '}
                  <select value={wanted} onChange={(event) => setWanted(event.target.value)}>
                    <option value="">a card you do not own</option>
                    {missing.map((card) => (
                      <option key={card.id} value={card.id}>
                        {card.name}
                        {card.held > 0 ? ` (have ${card.held})` : ''} — {card.price}
                      </option>
                    ))}
                  </select>
                </label>
                {/* Plain while the scrap pair is armed: Buy and the confirm share this panel,
                    and only one thing in a panel is pink (DESIGN.md 8, one primary per panel). */}
                <button
                  type="button"
                  className={`button ${confirmScrap ? '' : 'button--primary'}`}
                  disabled={wanted === '' || (cardPrice(wanted) ?? 0) > state.credits}
                  onClick={() => void doBuy()}
                >
                  {wanted === '' ? 'Pick a card' : `Buy for ${cardPrice(wanted) ?? 0} credits`}
                </button>
              </div>
            )}
            {spareCount > 0 &&
              (confirmScrap ? (
                <span className="board__confirm">
                  Scrap them?
                  <button type="button" className="button" onClick={() => setConfirmScrap(false)}>
                    Keep them
                  </button>
                  <button
                    type="button"
                    className="button button--primary"
                    onClick={() => void doScrap()}
                  >
                    Scrap for {spareValue} credits
                  </button>
                </span>
              ) : (
                <button type="button" className="button" onClick={() => setConfirmScrap(true)}>
                  Scrap {spareCount} spare {spareCount === 1 ? 'card' : 'cards'}
                </button>
              ))}
            {scrapError && (
              <p className="builder__notice" role="status">
                {scrapError}
              </p>
            )}
            {boughtNote && (
              <p className="builder__hint" role="status">
                {boughtNote}
              </p>
            )}
          </div>
        )}
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
                Start over?
                <button type="button" className="button" onClick={() => setConfirmLap(false)}>
                  Not yet
                </button>
                <button
                  type="button"
                  className="button button--primary"
                  onClick={() => void takeLap()}
                >
                  Take lap {state.laps + 1}
                </button>
              </span>
            ) : (
              <button type="button" className="button" onClick={() => setConfirmLap(true)}>
                Take the lap
              </button>
            )}
          </div>
        )}
      </section>

      <section className="builder__browse">
        {/* Two buttons that swap a grid, not a tab widget: there is no tabpanel, no
              aria-controls and no arrow-key movement, so announcing one would be a promise the
              markup does not keep. */}
        <div className="builder__tabs" role="group" aria-label="Show">
          <button
            type="button"
            aria-pressed={tab === 'cars'}
            className={`button ${tab === 'cars' ? 'button--on' : ''}`}
            onClick={() => setTab('cars')}
          >
            Cars ({ownedCarCount}/{CARS.length})
          </button>
          <button
            type="button"
            aria-pressed={tab === 'mods'}
            className={`button ${tab === 'mods' ? 'button--on' : ''}`}
            onClick={() => setTab('mods')}
          >
            Mods ({ownedModCount}/{MODS.length})
          </button>
        </div>
        <p className="builder__hint">
          Cards you do not own yet are dimmed. Counts show your copies.
        </p>

        {tab === 'cars' ? (
          <>
            <Filter label="Type" value={type} options={TYPE_OPTIONS} onChange={setType} />
            <Filter label="Tier" value={tier} options={TIER_OPTIONS} onChange={setTier} />
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
            <Filter label="Family" value={family} options={FAMILY_OPTIONS} onChange={setFamily} />
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
      <RulesDialog dialogRef={rules} />
    </main>
  )
}
