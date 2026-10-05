import { useState, type FormEvent } from 'react'
import { ArrowRight } from 'lucide-react'
import { login } from '../lib/data'

/* One row, input and button the same height, centred in the viewport. */
export function Login({ onDone }: { onDone: () => void }) {
  const [pw, setPw] = useState('')
  const [bad, setBad] = useState(false)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!pw || busy) return
    setBusy(true)
    const ok = await login(pw)
    setBusy(false)
    if (ok) onDone()
    else setBad(true)
  }

  return (
    <form onSubmit={submit} className="mx-auto mt-[22vh] flex w-full max-w-[300px] flex-col items-center gap-3">
      <div className="flex w-full items-center gap-1.5">
        <input
          autoFocus
          type="password"
          autoComplete="current-password"
          value={pw}
          onChange={(e) => { setPw(e.target.value); setBad(false) }}
          placeholder="passphrase"
          aria-label="Passphrase"
          aria-invalid={bad}
          className={`h-9 min-w-0 flex-1 rounded-md bg-muted px-3 font-mono text-[13px] text-foreground ring-1 outline-none transition-shadow placeholder:text-muted-foreground focus:ring-ring ${bad ? 'ring-bad' : 'ring-border'}`}
        />
        <button
          type="submit"
          disabled={busy || !pw}
          aria-label="Enter"
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground transition-opacity disabled:opacity-30"
        >
          <ArrowRight className="size-4" strokeWidth={2} />
        </button>
      </div>
      <p className={`h-4 font-mono text-[11.5px] text-bad transition-opacity ${bad ? 'opacity-100' : 'opacity-0'}`} aria-live="polite">
        {bad ? 'Wrong passphrase' : ''}
      </p>
    </form>
  )
}
