import Button from '../UI/Button';
import { DELIVERY_METHODS } from '../../utils/constants';
import storeLocationsData from '../../../store_locations.json';
import './CheckoutForm.css';

function formatStopdeskLabel(loc) {
  if (!loc.city) return `${loc.wilaya} (Main Stopdesk)`;
  return `${loc.wilaya} - ${loc.city}`;
}

/**
 * Fully controlled — all field values and change handling live in the
 * parent (Checkout page), since the wilaya + delivery method selection
 * also drives the live price breakdown shown in OrderSummary.
 */
export default function CheckoutForm({ values, onChange, onSubmit, submitting, wilayaOptions, wilayaLoading }) {
  const isDoorstep = values.deliveryMethod === 'homedelivery';
  const isStopdesk = values.deliveryMethod === 'stopdesk';

  const selectedWilayaCode = wilayaOptions.find((w) => w.wilaya === values.wilaya)?.wilaya_code;
  const allLocations = storeLocationsData.locations || [];
  const stopdeskOptions =
    selectedWilayaCode != null
      ? allLocations.filter((loc) => loc.wilaya_code === selectedWilayaCode)
      : allLocations;

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit();
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="field">
        <label htmlFor="cf-name">Full Name</label>
        <input
          id="cf-name"
          type="text"
          required
          placeholder="Jane Doe"
          value={values.name}
          onChange={(e) => onChange('name', e.target.value)}
        />
      </div>

      <div className="field">
        <label htmlFor="cf-phone">Phone Number</label>
        <input
          id="cf-phone"
          type="tel"
          required
          placeholder="+213 555 000 000"
          value={values.phone}
          onChange={(e) => onChange('phone', e.target.value)}
        />
      </div>

      <div className="field">
        <label htmlFor="cf-wilaya">Wilaya</label>
        <select
          id="cf-wilaya"
          required
          value={values.wilaya}
          onChange={(e) => onChange('wilaya', e.target.value)}
          disabled={wilayaLoading || !wilayaOptions.length}
        >
          <option value="" disabled>
            {wilayaLoading
              ? 'Loading wilayas…'
              : wilayaOptions.length
                ? 'Select your wilaya'
                : 'No wilayas available yet'}
          </option>
          {wilayaOptions.map((w) => (
            <option key={w.id} value={w.wilaya}>
              {w.wilaya}
            </option>
          ))}
        </select>
        <a className="delivery-prices-link" href="/delivery-prices" target="_blank" rel="noopener noreferrer">
          View delivery prices
        </a>
      </div>

      <div className="field">
        <label htmlFor="cf-commune">Commune</label>
        <input
          id="cf-commune"
          type="text"
          required
          placeholder="e.g. Bab Ezzouar"
          value={values.commune}
          onChange={(e) => onChange('commune', e.target.value)}
        />
      </div>

      <div className="field">
        <label>Delivery Method</label>
        <div className="delivery-method-options">
          {DELIVERY_METHODS.map((method) => (
            <label
              key={method.value}
              className={`delivery-method-option${values.deliveryMethod === method.value ? ' active' : ''}`}
            >
              <input
                type="radio"
                name="deliveryMethod"
                value={method.value}
                checked={values.deliveryMethod === method.value}
                onChange={() => onChange('deliveryMethod', method.value)}
              />
              {method.label}
            </label>
          ))}
        </div>
      </div>

      {/* Only needed for doorstep delivery — a stopdesk pickup only
          needs the wilaya + commune to route to the right desk. */}
      {isDoorstep && (
        <div className="field">
          <label htmlFor="cf-address">Street Address</label>
          <textarea
            id="cf-address"
            required={isDoorstep}
            placeholder="Building, street, landmark…"
            value={values.address}
            onChange={(e) => onChange('address', e.target.value)}
          />
        </div>
      )}

      {isStopdesk && (
        <div className="field">
          <label htmlFor="cf-stopdesk">Stopdesk Location</label>
          <select
            id="cf-stopdesk"
            required={isStopdesk}
            value={values.stopdeskLocation}
            onChange={(e) => onChange('stopdeskLocation', e.target.value)}
          >
            <option value="" disabled>
              {values.wilaya
                ? stopdeskOptions.length
                  ? 'Select your stopdesk'
                  : 'No stopdesk found for this wilaya'
                : 'Select a wilaya first'}
            </option>
            {stopdeskOptions.map((loc) => {
              const label = formatStopdeskLabel(loc);
              return (
                <option key={loc.id} value={label}>
                  {label}
                </option>
              );
            })}
          </select>
        </div>
      )}

      <div className="field">
        <label htmlFor="cf-notes">Additional Notes</label>
        <textarea
          id="cf-notes"
          placeholder="Anything else we should know? (optional)"
          value={values.notes}
          onChange={(e) => onChange('notes', e.target.value)}
        />
      </div>

      <Button type="submit" variant="primary" style={{ width: '100%', marginTop: 8 }} disabled={submitting}>
        {submitting ? 'Placing Order…' : 'Confirm Order'}
      </Button>
    </form>
  );
}
