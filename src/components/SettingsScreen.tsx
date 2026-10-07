import { PACES, PACE_LABELS, BANDS, BAND_LABELS, type SessionSettings } from '../game/types';
import { PACE_SPECS } from '../game/types';
import Button from './ui/Button';

interface SettingsScreenProps {
  settings: SessionSettings;
  onUpdate: (patch: Partial<SessionSettings>) => void;
  onBack: () => void;
}

export default function SettingsScreen({ settings, onUpdate, onBack }: SettingsScreenProps) {
  const toggleBand = (band: (typeof BANDS)[number]) => {
    onUpdate({
      bands: settings.bands.includes(band)
        ? settings.bands.filter((existing) => existing !== band)
        : [...settings.bands, band],
    });
  };

  return (
    <div className="mx-auto flex h-full w-full max-w-md flex-col overflow-hidden" data-testid="settings">
      <header className="flex items-center justify-between border-b border-ink-800 p-4">
        <h1 className="text-lg font-bold text-white">Settings</h1>
        <Button variant="ghost" size="small" onClick={onBack} data-testid="settings-back">
          Back
        </Button>
      </header>

      <div className="flex-1 space-y-6 overflow-y-auto p-4">
        <section>
          <h2 className="text-xs uppercase tracking-wide text-gray-400">Difficulty bands</h2>
          <p className="mt-1 text-xs text-gray-500">
            Bands come from how often a word appears in real text, not from an exam level.
          </p>
          <div className="mt-2 flex gap-2">
            {BANDS.map((band) => {
              const on = settings.bands.includes(band);
              return (
                <button
                  key={band}
                  type="button"
                  onClick={() => toggleBand(band)}
                  aria-pressed={on}
                  data-testid={`band-${band}`}
                  className={[
                    'flex-1 rounded-lg border px-3 py-2 text-sm transition-colors',
                    on
                      ? 'border-jade-500 bg-jade-500/10 text-white'
                      : 'border-ink-800 bg-ink-900 text-gray-400',
                  ].join(' ')}
                >
                  {BAND_LABELS[band]}
                </button>
              );
            })}
          </div>
        </section>

        <section>
          <h2 className="text-xs uppercase tracking-wide text-gray-400">Pace</h2>
          <p className="mt-1 text-xs text-gray-500">
            How many bubbles fall, and how fast. Independent of which words you are learning.
          </p>
          <div className="mt-2 flex gap-2">
            {PACES.map((pace) => {
              const on = settings.pace === pace;
              return (
                <button
                  key={pace}
                  type="button"
                  onClick={() => onUpdate({ pace })}
                  aria-pressed={on}
                  data-testid={`pace-${pace}`}
                  className={[
                    'flex-1 rounded-lg border px-3 py-2 text-sm transition-colors',
                    on
                      ? 'border-jade-500 bg-jade-500/10 text-white'
                      : 'border-ink-800 bg-ink-900 text-gray-400',
                  ].join(' ')}
                >
                  <span className="block">{PACE_LABELS[pace]}</span>
                  <span className="block text-[11px] text-gray-500">
                    {PACE_SPECS[pace].bubbleCount} bubbles
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="space-y-2">
          <h2 className="text-xs uppercase tracking-wide text-gray-400">Reading aids</h2>
          <label className="flex items-center justify-between rounded-lg border border-ink-800 bg-ink-900 p-3 text-sm text-gray-200">
            Show pinyin under the Hanzi
            <input
              type="checkbox"
              checked={settings.pinyin}
              onChange={(event) => onUpdate({ pinyin: event.target.checked })}
              data-testid="toggle-pinyin"
              className="h-5 w-5 accent-jade-500"
            />
          </label>
          <label className="flex items-center justify-between rounded-lg border border-ink-800 bg-ink-900 p-3 text-sm text-gray-200">
            Sound cues
            <input
              type="checkbox"
              checked={settings.sound}
              onChange={(event) => onUpdate({ sound: event.target.checked })}
              data-testid="toggle-sound"
              className="h-5 w-5 accent-jade-500"
            />
          </label>
        </section>
      </div>
    </div>
  );
}