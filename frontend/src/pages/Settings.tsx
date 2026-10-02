import { useCallback, useEffect, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { api, isApiError } from '../api/client';
import type { BusinessDay, Settings as SettingsType } from '../api/types';
import { usePageMeta } from '../layout/PageMeta';
import Badge from '../components/Badge';
import { Skeleton } from '../components/Skeleton';
import StatList from '../components/StatList';
import { useToast } from '../components/Toast';

const WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const TONES = ['professional', 'friendly', 'concise'];
const TRAIT_OPTIONS = ['patient', 'helpful', 'empathetic', 'proactive', 'warm'];

function integrationBadge(v: string) {
  if (v === 'demo-mock') return <Badge variant="warning">Demo mock</Badge>;
  if (v === 'not-configured') return <Badge variant="neutral">Not configured</Badge>;
  return <Badge variant="success">Connected</Badge>;
}

function Section({
  title,
  desc,
  children,
  onSave,
  saving,
}: {
  title: string;
  desc: string;
  children: React.ReactNode;
  onSave: () => void;
  saving: boolean;
}) {
  return (
    <div className="card card-pad section-card">
      <h3>{title}</h3>
      <div className="section-desc">{desc}</div>
      {children}
      <div className="save-bar">
        <button className="btn btn-primary btn-sm" onClick={onSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </div>
  );
}

export default function Settings() {
  usePageMeta('Settings');
  const toast = useToast();

  const [settings, setSettings] = useState<SettingsType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingSection, setSavingSection] = useState<string | null>(null);

  // Local editable copies per section.
  const [business, setBusiness] = useState({ name: '', tagline: '', address: '', phone: '', email: '' });
  const [personality, setPersonality] = useState({ tone: 'professional', formality: '', verbosity: '', traits: [] as string[] });
  const [voice, setVoice] = useState({ rate: 1.0 });
  const [hours, setHours] = useState<BusinessDay[]>([]);
  const [rules, setRules] = useState({ slot_interval_min: 30, buffer_min: 10, max_days_ahead: 60, cancellation_notice_h: 24 });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const s = await api.get<SettingsType>('/settings');
      setSettings(s);
      setBusiness({ ...s.business });
      setPersonality({
        tone: s.personality.tone,
        formality: s.personality.formality,
        verbosity: s.personality.verbosity,
        traits: [...s.personality.traits],
      });
      setVoice({ rate: s.voice.rate });
      const byDay = new Map(s.hours.map((h) => [h.day, h]));
      setHours(WEEK.map((d) => byDay.get(d) ?? { day: d, open: '', close: '' }));
      setRules({ ...s.appointment_rules });
    } catch (err) {
      setError(isApiError(err) ? err.message : 'Failed to load settings.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (section: string, body: unknown) => {
    setSavingSection(section);
    try {
      const r = await api.put<{ settings: SettingsType }>('/settings', body);
      setSettings(r.settings);
      toast('success', 'Settings saved.');
    } catch (err) {
      toast('error', isApiError(err) ? err.message : 'Save failed.');
    } finally {
      setSavingSection(null);
    }
  };

  const toggleTrait = (t: string) =>
    setPersonality((p) => ({
      ...p,
      traits: p.traits.includes(t) ? p.traits.filter((x) => x !== t) : [...p.traits, t],
    }));

  const setHour = (day: string, field: 'open' | 'close', value: string) =>
    setHours((hs) => hs.map((h) => (h.day === day ? { ...h, [field]: value } : h)));

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Skeleton height="20px" width="30%" />
          <Skeleton height="36px" />
          <Skeleton height="36px" />
        </div>
        <div className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Skeleton height="20px" width="30%" />
          <Skeleton height="36px" />
        </div>
      </div>
    );
  }

  if (error || !settings) {
    return (
      <div className="error-state card">
        <div className="error-icon" aria-hidden="true">
          <AlertCircle size={28} strokeWidth={1.5} />
        </div>
        <div className="error-title">Couldn&apos;t load settings</div>
        <div className="error-desc">{error ?? 'Unknown error.'}</div>
        <button className="btn btn-secondary" onClick={() => void load()}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Settings</h1>
          <div className="sub">Business profile, AI behavior, hours, and integrations.</div>
        </div>
      </div>

      <div className="settings-grid">
        <div>
          <Section
            title="Business Profile"
            desc="Public business details the receptionist shares with callers."
            onSave={() => void save('business', { business })}
            saving={savingSection === 'business'}
          >
            <div className="field">
              <label htmlFor="s-name">Company name</label>
              <input id="s-name" className="input" value={business.name} onChange={(e) => setBusiness({ ...business, name: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="s-tagline">Tagline</label>
              <input id="s-tagline" className="input" value={business.tagline} onChange={(e) => setBusiness({ ...business, tagline: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="s-address">Address</label>
              <input id="s-address" className="input" value={business.address} onChange={(e) => setBusiness({ ...business, address: e.target.value })} />
            </div>
            <div className="form-row">
              <div className="field">
                <label htmlFor="s-phone">Phone</label>
                <input id="s-phone" className="input" value={business.phone} onChange={(e) => setBusiness({ ...business, phone: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor="s-email">Email</label>
                <input id="s-email" type="email" className="input" value={business.email} onChange={(e) => setBusiness({ ...business, email: e.target.value })} />
              </div>
            </div>
          </Section>

          <Section
            title="AI Personality"
            desc="Tone and traits shape how the receptionist speaks."
            onSave={() => void save('personality', { personality })}
            saving={savingSection === 'personality'}
          >
            <div className="field">
              <label htmlFor="s-tone">Tone</label>
              <select id="s-tone" className="select" value={personality.tone} onChange={(e) => setPersonality({ ...personality, tone: e.target.value })}>
                {TONES.map((t) => (
                  <option key={t} value={t}>
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-row">
              <div className="field">
                <label htmlFor="s-formality">Formality</label>
                <input id="s-formality" className="input" value={personality.formality} onChange={(e) => setPersonality({ ...personality, formality: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor="s-verbosity">Verbosity</label>
                <input id="s-verbosity" className="input" value={personality.verbosity} onChange={(e) => setPersonality({ ...personality, verbosity: e.target.value })} />
              </div>
            </div>
            <div className="field">
              <label>Traits</label>
              {TRAIT_OPTIONS.map((t) => (
                <label key={t} className="checkbox-row">
                  <input type="checkbox" checked={personality.traits.includes(t)} onChange={() => toggleTrait(t)} />
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </label>
              ))}
            </div>
          </Section>

          <Section
            title="Voice"
            desc="Browser voice settings for the voice demo."
            onSave={() => void save('voice', { voice })}
            saving={savingSection === 'voice'}
          >
            <div className="field">
              <label>Provider</label>
              <input className="input" value={settings.voice.provider} disabled aria-describedby="voice-provider-hint" />
              <div className="field-hint" id="voice-provider-hint">Read-only in this demo.</div>
            </div>
            <div className="field">
              <label htmlFor="s-rate">Speaking rate: <span className="tnum">{voice.rate.toFixed(2)}×</span></label>
              <input
                id="s-rate"
                type="range"
                min={0.5}
                max={1.5}
                step={0.05}
                value={voice.rate}
                onChange={(e) => setVoice({ rate: Number(e.target.value) })}
                style={{ width: '100%' }}
              />
            </div>
            <div className="field-hint">{settings.voice.note}</div>
          </Section>
        </div>

        <div>
          <Section
            title="Working Hours"
            desc="When the receptionist may book appointments. Leave a day blank to mark it closed."
            onSave={() => void save('hours', { hours: hours.filter((h) => h.open && h.close) })}
            saving={savingSection === 'hours'}
          >
            {hours.map((h) => (
              <div key={h.day} className="hours-row">
                <span className="day-name">{h.day}</span>
                <div>
                  <label className="sr-only" htmlFor={`h-open-${h.day}`}>{h.day} opens</label>
                  <input id={`h-open-${h.day}`} type="time" className="input" value={h.open} onChange={(e) => setHour(h.day, 'open', e.target.value)} />
                </div>
                <div>
                  <label className="sr-only" htmlFor={`h-close-${h.day}`}>{h.day} closes</label>
                  <input id={`h-close-${h.day}`} type="time" className="input" value={h.close} onChange={(e) => setHour(h.day, 'close', e.target.value)} />
                </div>
              </div>
            ))}
            <div className="field-hint">Timezone: {settings ? 'America/Chicago (business local time)' : ''}</div>
          </Section>

          <Section
            title="Appointment Rules"
            desc="Booking constraints enforced by the scheduling tools."
            onSave={() => void save('appointment_rules', { appointment_rules: rules })}
            saving={savingSection === 'appointment_rules'}
          >
            <div className="form-row">
              <div className="field">
                <label htmlFor="r-slot">Slot interval (min)</label>
                <input id="r-slot" type="number" min={5} className="input tnum" value={rules.slot_interval_min} onChange={(e) => setRules({ ...rules, slot_interval_min: Number(e.target.value) })} />
              </div>
              <div className="field">
                <label htmlFor="r-buffer">Buffer between appointments (min)</label>
                <input id="r-buffer" type="number" min={0} className="input tnum" value={rules.buffer_min} onChange={(e) => setRules({ ...rules, buffer_min: Number(e.target.value) })} />
              </div>
            </div>
            <div className="form-row">
              <div className="field">
                <label htmlFor="r-ahead">Max days ahead</label>
                <input id="r-ahead" type="number" min={1} className="input tnum" value={rules.max_days_ahead} onChange={(e) => setRules({ ...rules, max_days_ahead: Number(e.target.value) })} />
              </div>
              <div className="field">
                <label htmlFor="r-notice">Cancellation notice (hours)</label>
                <input id="r-notice" type="number" min={0} className="input tnum" value={rules.cancellation_notice_h} onChange={(e) => setRules({ ...rules, cancellation_notice_h: Number(e.target.value) })} />
              </div>
            </div>
          </Section>

          <div className="card card-pad section-card">
            <h3>Integrations</h3>
            <div className="section-desc">External connections. Interfaces are ready; providers plug in here.</div>
            {(
              [
                ['Calendar sync', settings.integrations.calendar, 'Two-way sync with Google / Outlook calendars.'],
                ['Telephony (PSTN)', settings.integrations.telephony, 'Twilio interface ready: direct phone calls.'],
                ['CRM', settings.integrations.crm, 'Push customer profiles and outcomes.'],
                ['Email', settings.integrations.email, 'Confirmations and reminders.'],
              ] as [string, string, string][]
            ).map(([name, value, desc]) => (
              <div key={name} className="integration-row">
                <div className="i-name">
                  {name}
                  <span className="i-desc">{desc}</span>
                </div>
                {integrationBadge(value)}
              </div>
            ))}
          </div>

          <div className="card card-pad section-card">
            <h3>Environment</h3>
            <div className="section-desc">Runtime configuration. Secrets are never exposed to the frontend.</div>
            <StatList
              items={[
                { k: 'AI engine', v: <code className="tnum">{settings.environment.engine}</code> },
                { k: 'Database', v: <code className="tnum">{settings.environment.db}</code> },
                { k: 'Vector store', v: <code className="tnum">{settings.environment.vector}</code> },
                { k: 'Secrets exposed', v: settings.environment.secrets_exposed ? <Badge variant="danger">Yes</Badge> : <Badge variant="success">No</Badge> },
              ]}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
