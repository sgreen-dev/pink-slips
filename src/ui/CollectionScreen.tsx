import { useContext, useState } from 'react'
import { backdropUrl } from './artwork.ts'
import { Backdrop } from './Backdrop.tsx'
import {
  ALL_CARD_IDS,
  bestVariant,
  copiesOwned,
  ownedCount,
  packCards,
  type Pack,
} from '../collection/collection.ts'
import { loadCollection, type CollectionState } from '../collection/persist.ts'
import { AccountContext, openNext } from './account.ts'
import { CARS } from '../data/cars.ts'
import { MODS } from '../data/mods.ts'
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

  const owned = state.owned
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
        <p className="collection__summary">
          You own {ownedCount(owned)} of {ALL_CARD_IDS.length} cards.
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
          Finishing a match earns {packsPerMatch} pack. Beating the CPU earns {packsPerCpuWin}.
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
