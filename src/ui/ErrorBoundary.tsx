import { Component, type ErrorInfo, type ReactNode } from 'react'

/**
 * The last line: a thrown render used to blank the page, which loses a match in progress with
 * no way back but a reload the player has to think of themselves. This says what happened and
 * offers the reload, so the game fails visibly rather than silently.
 *
 * A class because React offers no hook for this.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  constructor(props: { children: ReactNode }) {
    super(props)
    this.state = { failed: false }
  }

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // Nothing collects these, so the console is where a player can be asked to look.
    console.error('Pink Slips stopped:', error, info.componentStack)
  }

  override render(): ReactNode {
    if (!this.state.failed) return this.props.children
    return (
      <main className="start">
        <h1 className="start__title">Pink Slips</h1>
        <p className="start__tagline">
          Something went wrong and the game stopped. Reloading starts again from the start screen;
          your collection and your garages are saved and will still be there.
        </p>
        <div className="start__nav">
          <button
            type="button"
            className="button button--primary button--big"
            onClick={() => window.location.reload()}
          >
            Reload
          </button>
        </div>
      </main>
    )
  }
}
