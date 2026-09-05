import { useContext, useEffect, useRef, useState } from 'react'
import { backdropUrl } from './artwork.ts'
import { Backdrop } from './Backdrop.tsx'
import { AccountContext, pushGarages } from './account.ts'
import { copiesOwned } from '../collection/collection.ts'
import { loadCollection } from '../collection/persist.ts'
import { CARS } from '../data/cars.ts'
import { MODS, getMod } from '../data/mods.ts'
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
import {
  FAMILY_LABEL,
  addCar,
  addMod,
  canAddCar,
  canAddMod,
  deckCounts,
  draftFrom,
  emptyDraft,
  garageOptions,
  newGarageId,
  removeCar,
  removeMod,
  validateDraft,
  type GarageDraft,
  type GarageOption,
} from './builder.ts'
import { CarCard } from './CarCard.tsx'
import { Filter } from './Filter.tsx'
import { ModCard } from './ModCard.tsx'
import { RulesButton, RulesDialog } from './RulesDialog.tsx'
import { VariantContext, lookupFrom } from './variants.ts'
import {
  clearDraft,
  deleteGarage,
  loadDraft,
  loadGarages,
  saveDraft,
  upsertGarage,
  type SavedGarage,
} from './storage.ts'

interface BuilderScreenProps {
  onBack: () => void
}

/** Build a garage of 5 and a deck of 30, keep it in localStorage, and race it (DESIGN.md 9). */
export function BuilderScreen({ onBack }: BuilderScreenProps) {
  const [draft, setDraft] = useState<GarageDraft>(() => loadDraft() ?? emptyDraft())
  const [saved, setSaved] = useState<SavedGarage[]>(() => loadGarages())
  const account = useContext(AccountContext)
  const sync = () => {
    if (account) void pushGarages(account.endpoint, account.token, loadGarages())
  }
  const [collection] = useState(() => loadCollection())
  const owned = collection.owned
  const variantOf = lookupFrom(collection.variants)
  const [tab, setTab] = useState<'cars' | 'mods'>('cars')
  const [type, setType] = useState<CarType | 'all'>('all')
  const [tier, setTier] = useState<Tier | 'all'>('all')
  const [family, setFamily] = useState<ModFamily | 'all'>('all')
  const [notice, setNotice] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const rules = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    saveDraft(draft)
  }, [draft])

  const validation = validateDraft(draft, owned)
  const counts = deckCounts(draft.deck)
  const cars = CARS.filter(
    (car) => (type === 'all' || car.type === type) && (tier === 'all' || car.tier === tier),
  )
  const mods = MODS.filter((mod) => family === 'all' || mod.family === family)
  const options = garageOptions(saved)
  const savedName = draft.id ? (saved.find((g) => g.id === draft.id)?.name ?? null) : null

  const update = (next: GarageDraft) => {
    setDraft(next)
    setNotice(null)
    setConfirmDelete(false)
  }

  const save = (asNew: boolean) => {
    if (validation.errors.length > 0) {
      setNotice('Fix the problems listed before saving.')
      return
    }
    const id = asNew || draft.id === null ? newGarageId() : draft.id
    const record: SavedGarage = {
      id,
      name: draft.name.trim(),
      cars: [...draft.cars],
      deck: [...draft.deck],
      updatedAt: Date.now(),
    }
    if (upsertGarage(record)) {
      setSaved(loadGarages())
      sync()
      setDraft({ ...draft, id, name: record.name })
      setNotice(`Saved ${record.name}. It is now on the start screen.`)
    } else {
      setNotice('Could not save. This browser is blocking storage, so the garage will not persist.')
    }
  }

  const remove = () => {
    if (!draft.id) return
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }
    if (deleteGarage(draft.id)) {
      setSaved(loadGarages())
      sync()
      setDraft(emptyDraft())
      setNotice('Deleted.')
    } else {
      setNotice('Could not delete. This browser is blocking storage.')
    }
    setConfirmDelete(false)
  }

  const load = (option: GarageOption) => {
    update(draftFrom(option, option.custom ? option.id : null))
    setNotice(
      option.custom ? null : `Loaded ${option.name} as a template. Saving makes your own copy.`,
    )
  }

  const reset = () => {
    update(emptyDraft())
    clearDraft()
  }

  return (
    <VariantContext value={variantOf}>
      <main className="builder">
        <Backdrop image={backdropUrl('builder')} />
        <header className="builder__header">
          <span className="board__brand">Pink Slips</span>
          <h1 className="builder__title">Deck builder</h1>
          <RulesButton dialogRef={rules} label="Rules" small />
          <button type="button" className="button" onClick={onBack}>
            Back to start
          </button>
        </header>

        <div className="builder__layout">
          <aside className="builder__garage">
            <label className="builder__name">
              <span>Garage name</span>
              <input
                type="text"
                value={draft.name}
                maxLength={40}
                onChange={(event) => update({ ...draft, name: event.target.value })}
              />
            </label>
            {savedName && <p className="builder__saved">Editing saved garage: {savedName}</p>}

            <h2 className="builder__section">
              Garage {draft.cars.length}/{TUNABLES.garageSize}
            </h2>
            <div className="builder__cars">
              {draft.cars.map((carId) => (
                <CarCard
                  key={carId}
                  carId={carId}
                  size="sm"
                  onClick={() => update(removeCar(draft, carId))}
                />
              ))}
              {Array.from(
                { length: Math.max(0, TUNABLES.garageSize - draft.cars.length) },
                (_, i) => (
                  <div key={i} className="builder__slot">
                    empty
                  </div>
                ),
              )}
            </div>
            <p className="builder__hint">Click a car in the garage to remove it.</p>

            <h2 className="builder__section">
              Deck {draft.deck.length}/{TUNABLES.modDeckSize}
            </h2>
            {counts.size === 0 ? (
              <p className="builder__hint">
                Add mods from the Mods tab. Up to {TUNABLES.maxCopiesPerMod} copies of each,{' '}
                {TUNABLES.maxCopiesPerRareMod} of a rare mod.
              </p>
            ) : (
              <ul className="builder__deck">
                {[...counts.entries()].map(([modId, count]) => (
                  <li key={modId} className={`builder__row builder__row--${getMod(modId).family}`}>
                    <span className="builder__row-name">{getMod(modId).name}</span>
                    <span className="builder__row-count">×{count}</span>
                    <button
                      type="button"
                      className="button button--small"
                      aria-label={`Remove one ${getMod(modId).name}`}
                      onClick={() => update(removeMod(draft, modId))}
                    >
                      −
                    </button>
                    <button
                      type="button"
                      className="button button--small"
                      aria-label={`Add one ${getMod(modId).name}`}
                      disabled={!canAddMod(draft, modId, owned)}
                      onClick={() => update(addMod(draft, modId, owned))}
                    >
                      +
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {validation.errors.length > 0 && (
              <ul className="builder__errors">
                {validation.errors.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            )}
            {validation.warnings.length > 0 && (
              <ul className="builder__warnings">
                {validation.warnings.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            )}
            {validation.errors.length === 0 && <p className="builder__ready">Ready to race.</p>}

            <div className="builder__actions">
              <button type="button" className="button button--primary" onClick={() => save(false)}>
                {draft.id ? 'Save changes' : 'Save garage'}
              </button>
              {draft.id && (
                <button type="button" className="button" onClick={() => save(true)}>
                  Save as new
                </button>
              )}
              {draft.id && (
                <button type="button" className="button" onClick={remove}>
                  {confirmDelete ? 'Confirm delete' : 'Delete'}
                </button>
              )}
              <button type="button" className="button button--ghost" onClick={reset}>
                Start empty
              </button>
            </div>
            {notice && <p className="builder__notice">{notice}</p>}

            <h2 className="builder__section">Load</h2>
            <div className="builder__load">
              {options.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className="button button--small"
                  onClick={() => load(option)}
                >
                  {option.name}
                  {option.custom ? '' : ' (starter)'}
                </button>
              ))}
            </div>
          </aside>

          <section className="builder__browse">
            <div className="builder__tabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'cars'}
                className={`button ${tab === 'cars' ? 'button--primary' : ''}`}
                onClick={() => setTab('cars')}
              >
                Cars ({CARS.length})
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'mods'}
                className={`button ${tab === 'mods' ? 'button--primary' : ''}`}
                onClick={() => setTab('mods')}
              >
                Mods ({MODS.length})
              </button>
            </div>

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
                <p className="builder__hint">
                  Click a car to add it to the garage. Cars you do not own yet are dimmed.
                </p>
                <div className="browse__grid">
                  {cars.map((car) => {
                    const inGarage = draft.cars.includes(car.id)
                    const have = copiesOwned(owned, car.id)
                    const addable = canAddCar(draft, car.id, owned)
                    return (
                      <CarCard
                        key={car.id}
                        carId={car.id}
                        size="sm"
                        dimmed={have === 0}
                        badge={inGarage ? 'In garage' : have === 0 ? 'Not owned' : undefined}
                        onClick={addable ? () => update(addCar(draft, car.id, owned)) : undefined}
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
                <p className="builder__hint">
                  Click a mod to add a copy to the deck, up to the copies you own and at most{' '}
                  {TUNABLES.maxCopiesPerMod}, or {TUNABLES.maxCopiesPerRareMod} of a rare mod.
                </p>
                <div className="browse__grid">
                  {mods.map((mod) => {
                    const count = counts.get(mod.id) ?? 0
                    const have = copiesOwned(owned, mod.id)
                    return (
                      <div key={mod.id} className="hand__slot">
                        <ModCard
                          modId={mod.id}
                          playable={canAddMod(draft, mod.id, owned)}
                          dimmed={have === 0}
                          onClick={() => update(addMod(draft, mod.id, owned))}
                        />
                        {count > 0 && <span className="hand__count">×{count}</span>}
                        <span className="browse__owned">
                          {have === 0 ? 'not owned' : `own ${have}`}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </section>
        </div>
        <RulesDialog dialogRef={rules} />
      </main>
    </VariantContext>
  )
}
